import { dungeons } from '@/content/dungeons';
import { placeFightRules, type FightPlaceKind } from '@/content/placeFights';

import { briefingFor } from '../dungeons/rotation';
import { isDungeonAvailable } from '../expeditions/expeditions';
import { estimateOdds } from '../expeditions/odds';
import { placeFightBriefing, placeFightDungeon } from '../places/fights';
import { placesWithin } from '../places/generate';
import { PATROL_KINDS, patrolsAround } from '../patrols/generate';
import { patrolOdds } from '../patrols/fight';
import type { SaveData } from '../save';
import type { DungeonDef } from '../types';
import { bestParty, highestTier, withLoadout, type ProbeRow, type Sim } from './bot';
import { emptySlots, fillPotions, unprepared } from './rules/loadout';

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
 * open normal dungeon (and the same party with its kit slots empty), the tier
 * boss, the fight events around and each patrol kind.
 */
export function probe(sim: Sim): ProbeRow[] {
  const save = emptySlots(restedRoster(sim.save), sim.save.heroes.map((h) => h.id));
  const view: Sim = { ...sim, save };
  const tier = highestTier(save);
  const all = save.heroes.map((h) => h.id);
  const runs = sim.config.odds.runs;
  const rows: ProbeRow[] = [];
  const add = (kind: ProbeRow['kind'], id: string, prepared: number, plain: number | null = null) => rows.push({ day: sim.day, at: (sim.now - sim.startedAt) / 3_600_000, tier, kind, id, prepared, unprepared: plain });

  const prepare = (dungeon: DungeonDef, briefing = briefingFor(sim.rotation, dungeon)) => {
    const party = bestParty(view, dungeon, all, briefing);
    return { party, briefing, loaded: withLoadout(save, party.heroIds, dungeon, briefing) };
  };

  for (const dungeon of dungeons.filter((d) => d.tier === tier && !d.isBoss && !d.overnight && isDungeonAvailable(save, d, sim.rotation))) {
    const { party, briefing, loaded } = prepare(dungeon);
    const plain = estimateOdds(unprepared(loaded, party.heroIds), party.heroIds, dungeon, runs, { now: sim.now, briefing });
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
