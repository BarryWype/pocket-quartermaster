import { itemById } from '@/content/lookup';
import { lootConfig } from '@/content/loot/config';
import { lootMatrix } from '@/content/loot/matrix';
import { targets } from '@/game/sim/targets';
import type { GearDef } from '@/game/types';

import { createRng } from '../generation/rng';
import { rollSourceLoot } from './roll';
import { LOOT_SOURCES, type LootSourceId } from './types';

// Looted gear against the loot README's targets: every source rolled over
// seeds at its matrix visits for the regular player (no Luck, run length or
// charms, as pacing.py counts them).

const ROLLS = 3000;
const context = { playerTier: 3, pickaxeTier: 3, knownRecipes: [] as string[], favourCounts: {} };
const isTrinket = (itemId: string) => (itemById[itemId] as GearDef).slot === 'trinket';

/** Per visit: gear pieces (trinkets apart) and pieces of each top rarity, gear and trinkets together. */
function perVisit(source: LootSourceId) {
  let gear = 0;
  let rare = 0;
  let legendary = 0;
  for (let i = 0; i < ROLLS; i++) {
    const loot = rollSourceLoot({ source, tier: 3, enemies: [], base: { gold: 0, xp: 0 }, context, rng: createRng(`${source}|${i}`), luck: 0, modifiers: [] });
    for (const piece of loot.gear) {
      if (!isTrinket(piece.itemId)) gear++;
      if (piece.rarity === 'rare') rare++;
      if (piece.rarity === 'legendary') legendary++;
    }
  }
  return { gear: gear / ROLLS, rare: rare / ROLLS, legendary: legendary / ROLLS };
}

const rates = Object.fromEntries(LOOT_SOURCES.map((source) => [source, perVisit(source)])) as Record<LootSourceId, ReturnType<typeof perVisit>>;
const perWeek = (key: 'gear' | 'rare' | 'legendary') => LOOT_SOURCES.reduce((sum, source) => sum + rates[source][key] * lootMatrix[source].visitsPerDay * 7, 0);

describe('looted gear rates', () => {
  it("drops gear at each source's mark", () => {
    for (const source of LOOT_SOURCES) {
      const chance = lootConfig.markChances[lootMatrix[source].marks.gear];
      expect(Math.abs(rates[source].gear - chance)).toBeLessThanOrEqual(0.03);
    }
  });

  it('gives the regular player about 36 gear pieces a week', () => {
    const { piecesPerWeek } = targets.gear;
    expect(perWeek('gear')).toBeGreaterThanOrEqual(piecesPerWeek * 0.9);
    expect(perWeek('gear')).toBeLessThanOrEqual(piecesPerWeek * 1.1);
  });

  it('raises gear where players already go: the first win, tier bosses, patrols and step chests', () => {
    expect(rates.firstWin.gear).toBeGreaterThan(rates.dungeonRun.gear);
    expect(rates.tierBoss.gear).toBe(1);
    expect(rates.patrol.gear).toBeGreaterThan(0.2);
    expect(rates.stepChest.gear).toBeGreaterThan(0.2);
  });
});
