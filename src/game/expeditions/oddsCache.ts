import type { SaveData } from '../save';
import type { DungeonDef, GearInstance } from '../types';
import { estimateOdds, type Odds, type OddsOptions } from './odds';

/** What one odds estimate is cached by: exactly what estimateOdds reads. */
export type OddsInputs = {
  save: SaveData;
  heroIds: string[];
  dungeon: DungeonDef;
  options?: OddsOptions;
};

/** The party heroes' fields the party preparation, supply and odds read, with the gear they wear. */
function partyProjection(save: SaveData, heroIds: string[]) {
  const away = new Set(save.expeditions.flatMap((expedition) => expedition.heroIds));
  const gear = new Map<string, GearInstance>();
  const heroes = save.heroes
    .filter((hero) => heroIds.includes(hero.id))
    .map((hero) => {
      for (const slot of ['weapon', 'armor', 'offhand', 'trinket'] as const) {
        const piece = save.gear.find((g) => g.uid === hero.equipment[slot]);
        if (piece) gear.set(piece.uid, piece);
      }
      return {
        id: hero.id,
        classId: hero.classId,
        trait: hero.trait,
        level: hero.level,
        roll: hero.roll ?? null,
        approachPicks: hero.approachPicks ?? null,
        gamble: hero.gamble ?? null,
        kitFor: hero.kitFor ?? null,
        equipment: hero.equipment,
        // HP as the run would take it (healed to the minute, frozen while away).
        hp: hero.hp ?? null,
        hpAt: hero.hpAt ?? null,
        exhaustedUntil: hero.exhaustedUntil ?? null,
        // Away heroes don't heal; with no stored HP (full) that changes nothing.
        away: hero.hp !== undefined && away.has(hero.id),
      };
    });
  return {
    heroes,
    gear: [...gear.values()].map((piece) => ({
      uid: piece.uid,
      itemId: piece.itemId,
      quality: piece.quality,
      roll: piece.roll ?? null,
      element: piece.element ?? null,
      luck: piece.luck ?? null,
      component: piece.component ?? null,
      relicId: piece.relicId ?? null,
    })),
  };
}

/**
 * A stable key over exactly what estimateOdds reads (see prepareParty,
 * launchPlan and runProvisions): the dungeon, the party with their stats and
 * HP state, the gear they wear, the supply stock, the meal and opt-in, the
 * briefing, the blessing and the Guild Hall ranks that shift the supply need.
 * Unrelated save writes (gold, materials, steps, the expeditions list, reports)
 * leave it unchanged. HP counts by the minute: the odds only move when the
 * healed HP does.
 */
export function oddsKey({ save, heroIds, dungeon, options = {} }: OddsInputs): string {
  const { now, loadout = {}, fullHp = false, briefing = null } = options;
  return JSON.stringify({
    dungeon: dungeon.id,
    party: heroIds,
    // HP is taken at this time, rounded to the minute.
    now: now === undefined ? 'stored' : Math.floor(now / 60_000),
    fullHp,
    loadout: { mealId: loadout.mealId ?? null, optIn: loadout.optIn ?? false },
    briefing: briefing ?? 'none',
    blessing: save.expeditionBlessing,
    // The Guild Hall's time cuts shift the supply need, and so the hunger.
    guild: save.guild,
    consumables: save.consumables,
    ...partyProjection(save, heroIds),
  });
}

/** The module-level cache: the last `cacheMax` keys, oldest dropped first. */
const cache = new Map<string, Odds>();
const cacheMax = 64;

/** The odds already computed for this key, if any — free to show while a recompute runs. */
export function cachedOdds(key: string): Odds | undefined {
  return cache.get(key);
}

/**
 * estimateOdds behind the module cache: computes and stores the odds the first
 * time it sees a key, and returns the cached odds for every call after that.
 */
export function cachedEstimateOdds(save: SaveData, heroIds: string[], dungeon: DungeonDef, runs?: number, options: OddsOptions = {}): Odds {
  const key = oddsKey({ save, heroIds, dungeon, options });
  const held = cache.get(key);
  if (held) return held;
  const odds = estimateOdds(save, heroIds, dungeon, runs, options);
  if (cache.size >= cacheMax) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, odds);
  return odds;
}
