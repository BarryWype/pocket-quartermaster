import { mobById } from '@/content/enemies';
import { frLogTemplates } from '@/content/fr/logTemplates';
import { logTemplates as enLogTemplates } from '@/content/logTemplates';
import { itemById, materialById, opportunityById, threatById } from '@/content/lookup';
import { article, plural } from '@/i18n/french';
import { fill, getLocale, localized, t, tr } from '@/i18n';

import { shardId, type Element } from '../elements';
import type { Rng } from '../generation/rng';
import type { DungeonDef, Hunger, MobGroup } from '../types';
import type { AbilityEffect, EncounterResult, PartyMember, RunResult } from './simulate';
import type { ThreatScore } from '../threats/score';

export type LogInput = {
  dungeon: DungeonDef;
  party: PartyMember[];
  run: RunResult;
  gold: number;
  /** Recipes the run taught: the boss's drop and the opportunity's, by item name. */
  recipeItemNames: string[];
  sigil?: number;
  sigilShards?: { element: Element; amount: number };
  firstWin?: boolean;
  firstTierClear?: boolean;
  charter?: boolean;
  /** Replaces the usual outcome line, e.g. for Sanctum fights. */
  summary?: string;
  hunger?: Hunger;
  /** Consumables that never triggered and were broken back down. */
  salvaged: { heroId: string; itemId: string; materials: { materialId: string; amount: number }[]; gold: number }[];
  /** The party's elixirs took effect: the opening lines say so. */
  elixirs?: boolean;
};

const pick = <T>(rng: Rng, list: readonly T[]) => list[rng.int(0, list.length - 1)];

/** "3 giant rats", "a goblin and 2 goblin slingers" ("3 rats géants", "un gobelin et 2 gobelins frondeurs"). */
export function describeMobs(groups: MobGroup[]) {
  const french = getLocale() === 'fr';
  const parts = groups.map(({ mobId, count }) => {
    const name = tr(mobById[mobId].name);
    if (french) return count === 1 ? article('un', name) : `${count} ${plural(name)}`;
    return count === 1 ? `a ${name}` : `${count} ${name}s`;
  });
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')}${t('common.and')}${parts[parts.length - 1]}` : parts[0];
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
  const logTemplates = localized({ en: enLogTemplates, fr: frLogTemplates });
  const french = getLocale() === 'fr';
  const nameOf = (heroId: string) => party.find((m) => m.heroId === heroId)?.name ?? heroId;
  const weaponOf = (member: PartyMember) => {
    if (!member.weaponName) return logTemplates.noWeapon;
    const name = member.weaponName.toLowerCase();
    return french ? article('le', name) : `the ${name}`;
  };
  /** A threat's display name: lowercase in English, for the article to agree with in French. */
  const threatName = (score: ThreatScore) => {
    const name = tr(threatById[score.threat.id].name);
    return french ? name : name.toLowerCase();
  };
  /** Who or what answered a threat: heroes by name, a kit by its item's name. */
  const answererOf = (score: ThreatScore) => {
    const parts = score.coveredBy.flatMap(({ heroId, source }) => {
      const member = party.find((m) => m.heroId === heroId);
      if (!member) return [];
      if (source === 'kit' && member.consumable) {
        const name = tr(member.consumable.name);
        return [french ? article('le', name) : `the ${name.toLowerCase()}`];
      }
      return [member.name];
    });
    if (parts.length === 0) return french ? 'personne' : 'nobody';
    return parts.length > 1 ? `${parts.slice(0, -1).join(', ')}${t('common.and')}${parts[parts.length - 1]}` : parts[0];
  };

  const potions = (encounter: EncounterResult) => encounter.consumed.map((id) => fill(logTemplates.potion, { hero: nameOf(id) }));

  const knockedOut = (encounter: EncounterResult) => {
    // A revived hero got back up instead: their line is the revive sentence.
    const names = encounter.knockedOut
      .filter((id) => !encounter.effects.some((e) => e.key === 'revive' && e.heroId === id))
      .map(nameOf);
    if (names.length === 0) return '';
    if (names.length === 1) return fill(logTemplates.knockedOut, { hero: names[0] });
    return fill(logTemplates.knockedOutMany, { heroes: `${names.slice(0, -1).join(', ')}${t('common.and')}${names[names.length - 1]}` });
  };

  /** Abilities and threats that changed a fight, one short sentence each. */
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
          case 'firebomb':
          case 'revive':
          case 'smokeBomb':
            return [fill(logTemplates[e.key], { hero })];
          case 'duel':
          case 'fightHeal':
          case 'secondPotion':
            return [fill(logTemplates[e.key], { hero })];
          case 'raise':
          case 'allies':
            return [fill(logTemplates[e.key], { hero, tag: logTemplates.tagNames[e.tag!] ?? `${e.tag}` })];
          case 'protect':
            return [fill(logTemplates.protect, { hero, ally: nameOf(e.allyId!) })];
          case 'exposed':
            return [logTemplates.exposed];
          case 'poison':
            return [logTemplates.poison];
          case 'casters':
            return [fill(logTemplates.casters, { hero })];
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
      ...potions(encounter),
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
      case 'boss': {
        if (encounter.kind === 'boss') {
          const star = top(party, encounter.dealt);
          const stew = effect(encounter, 'stew') ? logTemplates.stew : '';
          const weakness = effect(encounter, 'weakness') ? (logTemplates.weakness[dungeon.boss.id] ?? '') : '';
          const sentence =
            encounter.cleared && star
              ? fill(pick(rng, logTemplates.bossWon), { hero: star.name, boss: tr(encounter.name), weapon: weaponOf(star) })
              : fill(pick(rng, logTemplates.bossLost), { boss: tr(encounter.name) });
          return weakness + stew + sentence + aftermath(encounter);
        }
        return capitalised(fightSentence(encounter)) + aftermath(encounter);
      }
      case 'trap': {
        const trap = tr(encounter.name);
        if (effect(encounter, 'tip')) return fill(pick(rng, logTemplates.trapTip), { trap });
        if (!encounter.trapTriggered) return fill(pick(rng, logTemplates.trapMissed), { trap });
        const hit = Object.keys(encounter.taken);
        const line =
          hit.length === 0
            ? ''
            : hit.length === 1
            ? fill(pick(rng, logTemplates.trapHit), {
                trap,
                hero: nameOf(hit[0]),
                damage: Math.round(encounter.taken[hit[0]]),
              })
            : fill(pick(rng, logTemplates.trapAll), { trap });
        const reduced = effect(encounter, 'trapReduce')
          ? fill(logTemplates.trapReduced, { hero: effectHero(encounter, 'trapReduce') })
          : '';
        return [line, reduced, ...potions(encounter), knockedOut(encounter)].join('').trim();
      }
      case 'locals': {
        const npc = tr(encounter.name);
        const answerer = run.threats.find((t) => t.threat.id === 'locals');
        switch (encounter.reaction) {
          case 'help':
            return fill(logTemplates.localsHelp[encounter.help!.kind], {
              hero: answerer ? answererOf(answerer) : '',
              npc,
              gold: encounter.gold,
            });
          case 'fight':
            return (
              fill(pick(rng, logTemplates.localsHostile), { npc }) +
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
      case 'mishap':
        return fill(pick(rng, logTemplates.mishap), { event: tr(encounter.name) });
      // Quiet steps produce no line.
      default:
        return '';
    }
  };

  /** The threat lines: one per drawn threat, met, half or missed. */
  const threatLines = run.threats.map((score) => {
    const vars = { threat: threatName(score), answerer: answererOf(score) };
    if (score.state === 'met') return fill(pick(rng, logTemplates.threatMet), vars);
    if (score.state === 'half') return fill(pick(rng, logTemplates.threatHalf), vars);
    return fill(pick(rng, logTemplates.threatMissed), vars);
  });

  /** The midpoint opportunity, right after the encounter it followed. */
  const midpoint = Math.floor((run.encounterCount - 1) / 2);
  const opportunityLine = () => {
    const opportunity = run.opportunity!;
    const name = tr(opportunityById[opportunity.id].name);
    const vars = { opportunity: french ? name : name.toLowerCase() };
    return fill(pick(rng, opportunity.answered ? logTemplates.opportunityTaken : logTemplates.opportunityMissed), vars);
  };

  const encounterLines: string[] = [];
  run.encounters.forEach((encounter, i) => {
    // Quiet steps produce no line, not even for the healer's tending.
    if (encounter.kind !== 'quiet') {
      const line = capitalised(
        lineFor(encounter) +
          (effect(encounter, 'partyHeal') ? fill(logTemplates.partyHeal, { hero: effectHero(encounter, 'partyHeal') }) : ''),
      ).trim();
      if (line) encounterLines.push(line);
    }
    if (i === midpoint && run.opportunity) encounterLines.push(opportunityLine());
  });

  const summary =
    input.summary ??
    (run.escaped
      ? fill(pick(rng, logTemplates.escaped), { gold: input.gold })
      : fill(pick(rng, logTemplates.outcome[run.outcome]), {
        boss: tr(dungeon.boss.name),
        gold: input.gold,
        cleared: run.encountersCleared,
        total: run.encounterCount,
      }));
  // The elixirs the party drank or coated with before setting out.
  const elixirLines = input.elixirs
    ? party.flatMap((member) => {
        const elixir = member.consumable?.elixir;
        if (!elixir || elixir.kind === 'firebomb' || elixir.kind === 'revive' || elixir.kind === 'smokeBomb') return [];
        const item = tr(member.consumable!.name).toLowerCase();
        const template = elixir.kind === 'oil' ? logTemplates.elixirOil : logTemplates.elixirDrank;
        return [capitalised(fill(template, { hero: member.name, item }).trim())];
      })
    : [];
  return [
    ...(input.hunger && input.hunger !== 'fed' ? [logTemplates.hunger[input.hunger]] : []),
    ...elixirLines,
    ...threatLines,
    ...encounterLines,
    capitalised(summary),
    ...input.recipeItemNames.map((item) => fill(pick(rng, logTemplates.recipe), { item: tr(item).toLowerCase() })),
    ...(input.firstTierClear ? [pick(rng, logTemplates.firstTierClear)] : input.firstWin ? [pick(rng, logTemplates.firstWin)] : []),
    ...(input.charter ? [pick(rng, logTemplates.charter)] : []),
    ...(input.sigil ? [fill(pick(rng, logTemplates.sigil), { tier: input.sigil })] : []),
    ...(input.sigilShards
      ? [
          fill(pick(rng, logTemplates.sigilShards), {
            amount: input.sigilShards.amount,
            shards: tr(materialById[shardId(input.sigilShards.element)].name).toLowerCase(),
          }),
        ]
      : []),
    ...input.salvaged.map((s) => {
      const name = tr(itemById[s.itemId].name);
      return fill(logTemplates.salvage, { item: french ? name : name.toLowerCase() });
    }),
  ];
}
