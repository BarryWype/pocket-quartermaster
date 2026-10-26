import { mobById } from '@/content/enemies';
import { logTemplates } from '@/content/logTemplates';

import type { Rng } from '../generation/rng';
import type { DungeonDef, MainReward, MobGroup } from '../types';
import type { AbilityEffect, EncounterResult, PartyMember, RunResult } from './simulate';

export type LogInput = {
  dungeon: DungeonDef;
  party: PartyMember[];
  run: RunResult;
  gold: number;
  recipeItemName: string | null;
  mainRewards: MainReward[];
  firstClear?: { gold: number; xp: number };
  /** Replaces the usual outcome line, e.g. for Sanctum fights. */
  summary?: string;
};

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => String(vars[key] ?? match));
}

const pick = <T>(rng: Rng, list: readonly T[]) => list[rng.int(0, list.length - 1)];

/** "3 giant rats", "a goblin and 2 goblin slingers". */
export function describeMobs(groups: MobGroup[]) {
  const parts = groups.map(({ mobId, count }) => {
    const name = mobById[mobId].name;
    return count === 1 ? `a ${name}` : `${count} ${name}s`;
  });
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
}

/** The hero with the highest value in a per-hero map, if any. */
function top(party: PartyMember[], values: Record<string, number>) {
  return party.reduce<PartyMember | null>(
    (best, member) => ((values[member.heroId] ?? 0) > (best ? (values[best.heroId] ?? 0) : 0) ? member : best),
    null,
  );
}

/** One line per encounter, a summary, then any recipe or broken gear. */
export function buildLog(input: LogInput, rng: Rng): string[] {
  const { dungeon, party, run } = input;
  const nameOf = (heroId: string) => party.find((m) => m.heroId === heroId)?.name ?? heroId;
  const weaponOf = (member: PartyMember) =>
    member.weaponName ? `the ${member.weaponName.toLowerCase()}` : logTemplates.noWeapon;

  const usedWhen = (encounter: EncounterResult, when: 'lowHp' | 'beforeBoss') =>
    encounter.consumed.filter((id) => party.find((m) => m.heroId === id)?.consumable?.when === when);

  const knockedOut = (encounter: EncounterResult) => {
    const names = encounter.knockedOut.map(nameOf);
    if (names.length === 0) return '';
    if (names.length === 1) return fill(logTemplates.knockedOut, { hero: names[0] });
    return fill(logTemplates.knockedOutMany, { heroes: `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` });
  };

  /** Abilities that changed a fight, one short sentence each. */
  const combatNotes = (encounter: EncounterResult) =>
    encounter.effects
      .flatMap((e) => {
        const hero = e.heroId ? nameOf(e.heroId) : '';
        switch (e.key) {
          case 'tagBonus':
            return [fill(logTemplates.tagBonus, { hero, tag: logTemplates.tagNames[e.tag!] ?? `${e.tag} foes` })];
          case 'rage':
          case 'buff':
          case 'crit':
          case 'advantage':
            return [fill(logTemplates[e.key], { hero })];
          case 'protect':
            return [fill(logTemplates.protect, { hero, ally: nameOf(e.allyId!) })];
          default:
            return [];
        }
      })
      .join('');

  /** Ability notes, damage taken, potions and knock-outs, appended to a fight line. */
  const aftermath = (encounter: EncounterResult) => {
    const hurt = top(party, encounter.taken);
    return [
      combatNotes(encounter),
      hurt ? fill(logTemplates.tookDamage, { hero: hurt.name, damage: Math.round(encounter.taken[hurt.heroId]) }) : '',
      ...usedWhen(encounter, 'lowHp').map((id) => fill(logTemplates.potion, { hero: nameOf(id) })),
      knockedOut(encounter),
    ].join('');
  };

  /** The fight part of a line: who won it, or who it overwhelmed. */
  const fightSentence = (encounter: EncounterResult) => {
    const mobs = describeMobs(encounter.mobs);
    const star = top(party, encounter.dealt);
    return encounter.cleared && star
      ? fill(pick(rng, logTemplates.fightWon[star.classId]), { hero: star.name, mobs, weapon: weaponOf(star) })
      : fill(pick(rng, logTemplates.fightLost), { mobs });
  };
  const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  const effect = (encounter: EncounterResult, key: AbilityEffect['key']) => encounter.effects.find((e) => e.key === key);
  const effectHero = (encounter: EncounterResult, key: AbilityEffect['key']) => {
    const heroId = effect(encounter, key)?.heroId;
    return heroId ? nameOf(heroId) : '';
  };
  const lineFor = (encounter: EncounterResult): string => {
    switch (encounter.kind) {
      case 'fight':
      case 'ambush': {
        if (encounter.calmed) {
          return fill(pick(rng, logTemplates.calmed), {
            hero: effectHero(encounter, 'calm'),
            mobs: describeMobs(encounter.mobs),
          });
        }
        const alert = effect(encounter, 'alert');
        const prefix =
          encounter.kind !== 'ambush' ? '' : alert ? fill(logTemplates.ambushAlert, { hero: effectHero(encounter, 'alert') }) : logTemplates.ambush;
        return prefix + capitalised(fightSentence(encounter)) + aftermath(encounter);
      }
      case 'boss': {
        const star = top(party, encounter.dealt);
        const rations = usedWhen(encounter, 'beforeBoss').map((id) => fill(logTemplates.ration, { hero: nameOf(id) }));
        const sentence =
          encounter.cleared && star
            ? fill(pick(rng, logTemplates.bossWon), { hero: star.name, boss: encounter.name, weapon: weaponOf(star) })
            : fill(pick(rng, logTemplates.bossLost), { boss: encounter.name });
        return rations.join('') + sentence + aftermath(encounter);
      }
      case 'trap': {
        const trap = encounter.name;
        if (effect(encounter, 'tip')) return fill(pick(rng, logTemplates.trapTip), { trap });
        if (effect(encounter, 'disarm')) {
          return fill(pick(rng, logTemplates.trapDisarmed), { trap, hero: effectHero(encounter, 'disarm') });
        }
        if (!encounter.trapTriggered) return fill(pick(rng, logTemplates.trapMissed), { trap });
        const hit = Object.keys(encounter.taken);
        const line =
          hit.length === 1
            ? fill(pick(rng, logTemplates.trapHit), {
                trap,
                hero: nameOf(hit[0]),
                damage: Math.round(encounter.taken[hit[0]]),
              })
            : fill(pick(rng, logTemplates.trapAll), { trap });
        const reduced = effect(encounter, 'trapReduce')
          ? fill(logTemplates.trapReduced, { hero: effectHero(encounter, 'trapReduce') })
          : '';
        const potions = usedWhen(encounter, 'lowHp').map((id) => fill(logTemplates.potion, { hero: nameOf(id) }));
        return [line, reduced, ...potions, knockedOut(encounter)].join('');
      }
      case 'obstacle': {
        const obstacle = encounter.name;
        const solved = effect(encounter, 'solve');
        if (solved) {
          const kind = dungeon.encounters.find((e) => e.type === 'obstacle' && e.name === obstacle);
          const template = logTemplates.obstacleSolved[kind?.type === 'obstacle' ? kind.kind : 'rubble'];
          return fill(template, { hero: effectHero(encounter, 'solve'), obstacle });
        }
        const line = fill(pick(rng, logTemplates.obstacleCost), { obstacle });
        if (!encounter.detour) return line + knockedOut(encounter);
        return (
          line +
          fill(logTemplates.detour, { mobs: describeMobs(encounter.mobs) }) +
          ' ' +
          capitalised(fightSentence(encounter)) +
          aftermath(encounter)
        );
      }
      case 'locals': {
        const npc = encounter.name;
        switch (encounter.reaction) {
          case 'help':
            return fill(logTemplates.localsHelp[encounter.help!.kind], {
              hero: effectHero(encounter, 'charm'),
              npc,
              gold: encounter.gold,
            });
          case 'fight':
            return (
              (effect(encounter, 'loud')
                ? fill(logTemplates.loudLocals, { hero: effectHero(encounter, 'loud'), npc })
                : fill(logTemplates.localsProvoked, { hero: effectHero(encounter, 'provoke'), npc })) +
              ' ' +
              capitalised(fightSentence(encounter)) +
              aftermath(encounter)
            );
          case 'steal': {
            const line = fill(logTemplates.localsStolen, { hero: effectHero(encounter, 'pickpocket'), npc, gold: encounter.gold });
            if (!encounter.noticed) return line;
            return line + logTemplates.localsNoticed + ' ' + capitalised(fightSentence(encounter)) + aftermath(encounter);
          }
          default:
            return fill(pick(rng, logTemplates.localsNeutral), { npc });
        }
      }
      case 'spring':
        return fill(pick(rng, logTemplates.spring), { event: encounter.name });
      case 'cache':
        return (
          fill(pick(rng, logTemplates.cache), { event: encounter.name, gold: encounter.gold }) +
          (effect(encounter, 'cacheBonus') ? fill(logTemplates.cacheBonus, { hero: effectHero(encounter, 'cacheBonus') }) : '')
        );
      case 'mishap':
        return fill(pick(rng, logTemplates.mishap), { event: encounter.name });
    }
  };

  const summary =
    input.summary ??
    fill(pick(rng, logTemplates.outcome[run.outcome]), {
    boss: dungeon.boss.name,
    gold: input.gold,
    cleared: run.encountersCleared,
    total: run.encounterCount,
  });
  return [
    ...run.encounters.map(
      (encounter) =>
        lineFor(encounter) +
        (effect(encounter, 'partyHeal') ? fill(logTemplates.partyHeal, { hero: effectHero(encounter, 'partyHeal') }) : ''),
    ),
    summary,
    ...(input.recipeItemName ? [fill(pick(rng, logTemplates.recipe), { item: input.recipeItemName.toLowerCase() })] : []),
    ...(input.firstClear ? [fill(pick(rng, logTemplates.firstClear), input.firstClear)] : []),
    ...input.mainRewards.map((reward) =>
      fill(pick(rng, logTemplates.mainReward[reward.kind]), {
        gold: reward.kind === 'goldPouch' ? reward.gold : 0,
        tier: reward.kind === 'sigil' || reward.kind === 'treasureMap' ? reward.tier : 0,
      }),
    ),
  ];
}
