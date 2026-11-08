import { classSpecials } from '@/content/classSpecials';
import { dungeons } from '@/content/dungeons';
import { placeFightRules, type FightPlaceKind } from '@/content/placeFights';
import { bossWeaknesses } from '@/content/weaknesses';
import { difficultyRules } from '@/content/difficulty';
import { isElitePatrolKind } from '@/content/enemies';
import { rosterRules } from '@/content/roster';

import { briefingFor, dailyRotation, rotationDay } from '../dungeons/rotation';
import { estimateOdds } from '../expeditions/odds';
import { placesWithin } from '../places/generate';
import { placeFightBriefing, placeFightDungeon } from '../places/fights';
import { PATROL_KINDS, patrolsAround } from '../patrols/generate';
import { patrolBriefing, patrolDungeon, patrolOdds } from '../patrols/fight';
import { createInitialSave, type SaveData } from '../save';
import type { Briefing, DungeonDef } from '../types';
import { averagePiece, rosterSave, withSpares } from './reference';
import { equip } from '../team/team';
import { highestTier } from './bot';
import { expectedLevels, simConfig, type SimConfig } from './config';
import { rosterParty, difficultyOdds as tierDifficultyOdds, type DifficultyOdds } from './difficultyOdds';

const DAY = 86_400_000;
const NOON = 12 * 3_600_000;

/** One tier's means, or null where nothing was sampled. */
export type QuickTier = {
  tier: number;
  /**
   * The tier's medium and hard dungeons for the party `sim:fit` fits them with
   * (the reference roster at the tier's end): prepared, and with the briefing
   * skipped (the strongest party as if there were no threats, in the gear it
   * wears); the threat gap is the difference.
   */
  gap: Record<'medium' | 'hard', { prepared: number | null; skipped: number | null }>;
  /** The tier boss, prepared. */
  boss: number | null;
  /** Fight events around, prepared. */
  events: number | null;
  /** Patrols around, prepared. */
  patrols: number | null;
  /** Each fight event kind and patrol kind on its own, null where it never spawned. */
  byKind: Record<string, number | null>;
  /** The mean odds of the tier's sources per difficulty (see difficultyOdds.ts). */
  difficulty: DifficultyOdds;
  /** Samples behind each mean. */
  samples: { normal: number; boss: number; events: number; patrols: number };
};

/**
 * The class specials probe's team (specials.ts): the starting trio in the
 * tier's sword, bow and wand plus mail, Common rarity, with a spare piece of
 * every type to dress from, at the top of the tier's level band; every lower
 * tier's dungeons cleared (so this tier is unlocked), stocked with every boss
 * weakness item and three healing potions.
 */
export function quickSave(tier: number): SaveData {
  const initial = createInitialSave();
  let save: SaveData = {
    ...initial,
    tutorial: { ...initial.tutorial, step: 'done' },
    // Each hero carries its class's first common special, like the other reference teams.
    heroes: initial.heroes.map((h) => ({ ...h, level: expectedLevels[tier - 1], special: classSpecials[h.classId].common[0] })),
    gear: [`sword${tier}`, `bow${tier}`, `wand${tier}`, `mail${tier}`, `mail${tier}`, `mail${tier}`].map((itemId, i) => averagePiece(`g${i}`, itemId, 'common')),
  };
  save = withSpares(save, tier, 'common');
  save.heroes.forEach((hero, i) => {
    save = equip(equip(save, hero.id, 'weapon', `g${i}`), hero.id, 'armor', `g${i + 3}`);
  });
  const next: SaveData = {
    ...save,
    // The tier's whole chain is measured, so its regular dungeons count as cleared.
    clearedDungeons: dungeons.filter((d) => d.tier < tier || (d.tier === tier && !d.isBoss && !d.overnight)).map((d) => d.id),
    consumables: {
      ...save.consumables,
      healingPotion: 3,
      ...Object.fromEntries(bossWeaknesses.map((w) => [w.itemId, 1])),
    },
  };
  if (highestTier(next) !== tier) throw new Error(`Tier ${tier} is not the highest unlocked one`);
  return next;
}

const mean = (values: number[]): number | null => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);

/**
 * The odds-only probe (`npm run sim:quick`): for each tier, the party the bot
 * would send from the reference roster at the tier's end (see rosterSave and
 * rosterParty) against the tier's medium and hard dungeons (prepared and with
 * the briefing skipped), its boss, the fight events and the patrols around the
 * reference location, once per rotation day at noon. No full game, no rewards.
 */
export function quickProbe(config: SimConfig = simConfig): QuickTier[] {
  const runs = config.quick.runs;
  return [1, 2, 3, 4, 5].map((tier) => {
    const roster = rosterSave(tier, 'end');
    const gap = { medium: { prepared: [] as number[], skipped: [] as number[] }, hard: { prepared: [] as number[], skipped: [] as number[] } };
    const boss: number[] = [];
    const events: number[] = [];
    const patrols: number[] = [];
    const byKind: Record<string, number[]> = Object.fromEntries([...Object.keys(placeFightRules.kinds), ...PATROL_KINDS].map((k) => [k, []]));
    const dungeonOdds = (dungeon: DungeonDef, briefing: Briefing, t: number, skipped = false) => {
      const party = rosterParty(roster, dungeon, briefing, rosterRules.partySize, t, skipped);
      return estimateOdds(party.save, party.heroIds, dungeon, runs, { now: t, briefing }).success;
    };
    for (let day = 0; day < config.quick.days; day++) {
      const t = config.startDay + day * DAY + NOON;
      const rotation = dailyRotation(rotationDay(t));

      for (const difficulty of ['medium', 'hard'] as const) {
        for (const dungeon of dungeons.filter((d) => d.tier === tier && d.difficulty === difficulty && !d.isBoss && !d.overnight)) {
          const briefing = briefingFor(rotation, dungeon);
          gap[difficulty].prepared.push(dungeonOdds(dungeon, briefing, t));
          gap[difficulty].skipped.push(dungeonOdds(dungeon, briefing, t, true));
        }
      }

      const bossDungeon = dungeons.find((d) => d.tier === tier && d.isBoss && !d.overnight);
      if (bossDungeon) boss.push(dungeonOdds(bossDungeon, briefingFor(rotation, bossDungeon), t));

      const places = placesWithin(config.location, 2000, t);
      for (const kind of Object.keys(placeFightRules.kinds) as FightPlaceKind[]) {
        const spawn = places.find((p) => p.kind === kind);
        if (!spawn) continue;
        const odds = dungeonOdds(placeFightDungeon(spawn, tier), placeFightBriefing(roster, spawn), t);
        events.push(odds);
        byKind[kind].push(odds);
      }

      for (const kind of PATROL_KINDS) {
        const spawn = patrolsAround(config.location, t, tier).find((p) => p.kind === kind);
        if (!spawn) continue;
        const dungeon = patrolDungeon(spawn, tier, isElitePatrolKind(kind));
        const party = rosterParty(roster, dungeon, patrolBriefing(spawn), spawn.difficulty ? difficultyRules.patrolParty[spawn.difficulty] : rosterRules.partySize, t);
        const odds = patrolOdds(party.save, spawn, party.heroIds, t, runs).success;
        patrols.push(odds);
        byKind[kind].push(odds);
      }
    }
    return {
      tier,
      gap: {
        medium: { prepared: mean(gap.medium.prepared), skipped: mean(gap.medium.skipped) },
        hard: { prepared: mean(gap.hard.prepared), skipped: mean(gap.hard.skipped) },
      },
      boss: mean(boss),
      events: mean(events),
      patrols: mean(patrols),
      byKind: Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, mean(v)])),
      difficulty: Object.fromEntries(
        (['easy', 'medium', 'hard'] as const).map((d) => [
          d,
          { start: tierDifficultyOdds(tier, d, 'start', runs), end: tierDifficultyOdds(tier, d, 'end', runs) },
        ]),
      ) as DifficultyOdds,
      samples: { normal: gap.hard.prepared.length, boss: boss.length, events: events.length, patrols: patrols.length },
    };
  });
}
