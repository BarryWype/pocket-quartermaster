import { dungeons } from '@/content/dungeons';
import { placeFightRules, type FightPlaceKind } from '@/content/placeFights';

import { briefingFor } from '../dungeons/rotation';
import { isDungeonAvailable } from '../expeditions/expeditions';
import { estimateOdds, type Odds } from '../expeditions/odds';
import { EMPTY_BRIEFING } from '../expeditions/simulate';
import { placeFightBriefing, placeFightDungeon } from '../places/fights';
import { placesWithin } from '../places/generate';
import { PATROL_KINDS, patrolsAround } from '../patrols/generate';
import { patrolOdds } from '../patrols/fight';
import type { SaveData } from '../save';
import type { DungeonDef } from '../types';
import { bestParty, highestTier, withLoadout, type ProbeRow, type RunLog, type Sim } from './bot';
import { emptySlots, fillPotions } from './rules/loadout';

/** The probe's own odds cache per game: the bot's cache rounds HP, so sharing it would let the probe change the game. */
const caches = new WeakMap<RunLog, Map<string, Odds>>();

/** Every hero home, rested and unhurt: the roster the probe picks parties from. */
function restedRoster(save: SaveData): SaveData {
  return {
    ...save,
    expeditions: [],
    patrolFights: [],
    placeFights: [],
    heists: [],
    heroes: save.heroes.map(({ hp: _hp, hpAt: _hpAt, exhaustedUntil: _exhausted, ...hero }) => hero),
  };
}

/**
 * The win odds for the current tier right now, measured without changing the
 * game: the best prepared party from the whole roster at full HP against every
 * open normal dungeon (and, with the briefing skipped, the strongest party as
 * if there were no threats and no kits), the tier boss, the fight events
 * around and each patrol kind.
 */
export function probe(sim: Sim): ProbeRow[] {
  const save = emptySlots(restedRoster(sim.save), sim.save.heroes.map((h) => h.id));
  const cache = caches.get(sim.log) ?? new Map<string, Odds>();
  caches.set(sim.log, cache);
  const view: Sim = { ...sim, save, oddsCache: cache };
  const tier = highestTier(save);
  const all = save.heroes.map((h) => h.id);
  const runs = sim.config.odds.runs;
  const rows: ProbeRow[] = [];
  const add = (kind: ProbeRow['kind'], id: string, prepared: number, plain: number | null = null) => rows.push({ day: sim.day, at: (sim.now - sim.startedAt) / 3_600_000, tier, kind, id, prepared, unprepared: plain });

  const prepare = (dungeon: DungeonDef, briefing = briefingFor(sim.rotation, dungeon)) => {
    const party = bestParty(view, dungeon, all, briefing);
    return { party, briefing };
  };

  for (const dungeon of dungeons.filter((d) => d.tier === tier && !d.isBoss && !d.overnight && isDungeonAvailable(save, d, sim.rotation))) {
    const { party, briefing } = prepare(dungeon);
    // Not prepared: the briefing skipped. The strongest party as if there were no threats, potions and no kits, against the real briefing.
    const blind = bestParty(view, dungeon, all, EMPTY_BRIEFING);
    const plain = estimateOdds(withLoadout(save, blind.heroIds, dungeon, EMPTY_BRIEFING), blind.heroIds, dungeon, runs, { now: sim.now, briefing });
    add('normal', dungeon.id, party.odds.success, plain.success);
  }

  const boss = dungeons.find((d) => d.tier === tier && d.isBoss);
  if (boss) add('boss', boss.id, prepare(boss).party.odds.success);

  const places = placesWithin(sim.location, 2000, sim.now);
  for (const kind of Object.keys(placeFightRules.kinds) as FightPlaceKind[]) {
    const spawn = places.find((p) => p.kind === kind);
    if (spawn) add('event', kind, prepare(placeFightDungeon(spawn, tier), placeFightBriefing(save, spawn)).party.odds.success);
  }

  const patrols = patrolsAround(sim.location, sim.now);
  const strongest = [...save.heroes].sort((a, b) => b.level - a.level).slice(0, 3).map((h) => h.id);
  const armed = fillPotions(save, strongest);
  for (const kind of PATROL_KINDS) {
    const spawn = patrols.find((p) => p.kind === kind && p.tierRoll === 'current');
    if (spawn) add('patrol', kind, patrolOdds(armed, spawn, strongest, sim.now, runs).success);
  }
  return rows;
}
