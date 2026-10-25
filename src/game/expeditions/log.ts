import { mobById } from '@/content/enemies';
import { logTemplates } from '@/content/logTemplates';

import type { Rng } from '../generation/rng';
import type { DungeonDef, MainReward, MobGroup } from '../types';
import type { EncounterResult, PartyMember, RunResult } from './simulate';

export type LogInput = {
  dungeon: DungeonDef;
  party: PartyMember[];
  run: RunResult;
  gold: number;
  recipeItemName: string | null;
  /** Special items worth a line of their own, e.g. the tutorial's key. */
  finds: string[];
  mainRewards: MainReward[];
  /** Replaces the usual outcome line, e.g. for Sanctum fights. */
  summary?: string;
  gearEvents: { heroName: string; gearName: string; kind: 'cracked' | 'broken' }[];
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

  /** Damage taken, potions and knock-outs, appended to a fight line. */
  const aftermath = (encounter: EncounterResult) => {
    const hurt = top(party, encounter.taken);
    return [
      hurt ? fill(logTemplates.tookDamage, { hero: hurt.name, damage: Math.round(encounter.taken[hurt.heroId]) }) : '',
      ...usedWhen(encounter, 'lowHp').map((id) => fill(logTemplates.potion, { hero: nameOf(id) })),
      knockedOut(encounter),
    ].join('');
  };

  const lineFor = (encounter: EncounterResult): string => {
    switch (encounter.kind) {
      case 'fight':
      case 'ambush': {
        const mobs = describeMobs(encounter.mobs);
        const prefix = encounter.kind === 'ambush' ? logTemplates.ambush : '';
        const star = top(party, encounter.dealt);
        const sentence =
          encounter.cleared && star
            ? fill(pick(rng, logTemplates.fightWon[star.classId]), { hero: star.name, mobs, weapon: weaponOf(star) })
            : fill(pick(rng, logTemplates.fightLost), { mobs });
        return prefix + sentence.charAt(0).toUpperCase() + sentence.slice(1) + aftermath(encounter);
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
        if (!encounter.trapTriggered) return fill(pick(rng, logTemplates.trapMissed), { trap });
        const hit = Object.keys(encounter.taken);
        if (hit.length === 0) return fill(pick(rng, logTemplates.trapAvoided), { trap, hero: nameOf(encounter.avoided[0]) });
        const line =
          hit.length === 1
            ? fill(pick(rng, logTemplates.trapHit), {
                trap,
                hero: nameOf(hit[0]),
                damage: Math.round(encounter.taken[hit[0]]),
              })
            : fill(pick(rng, logTemplates.trapAll), { trap });
        const potions = usedWhen(encounter, 'lowHp').map((id) => fill(logTemplates.potion, { hero: nameOf(id) }));
        return [line, ...potions, knockedOut(encounter)].join('');
      }
      case 'spring':
        return fill(pick(rng, logTemplates.spring), { event: encounter.name });
      case 'cache':
        return fill(pick(rng, logTemplates.cache), { event: encounter.name, gold: encounter.gold });
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
    ...run.encounters.map(lineFor),
    summary,
    ...(input.recipeItemName ? [fill(pick(rng, logTemplates.recipe), { item: input.recipeItemName.toLowerCase() })] : []),
    ...input.finds.map((item) => fill(pick(rng, logTemplates.found), { item: item.toLowerCase() })),
    ...input.mainRewards.map((reward) =>
      fill(pick(rng, logTemplates.mainReward[reward.kind]), {
        gold: reward.kind === 'goldPouch' ? reward.gold : 0,
        tier: reward.kind === 'sigil' || reward.kind === 'treasureMap' ? reward.tier : 0,
      }),
    ),
    ...input.gearEvents.map((event) =>
      fill(logTemplates[event.kind], { hero: event.heroName, gear: event.gearName.toLowerCase() }),
    ),
  ];
}
