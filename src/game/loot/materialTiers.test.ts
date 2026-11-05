import { RARITIES } from '@/content/gear';
import { items } from '@/content/items';
import { resources } from '@/content/resources';
import { shopStock, marketPool } from '@/content/shops';
import { patrolKindsAt, patrolRules } from '@/content/patrols';

import { createRng } from '../generation/rng';
import { salvageReturns } from '../forging/salvage';
import { highestUnlockedTier } from '../dungeons/unlock';
import type { PlaceKind } from '@/content/places';
import type { PlaceSpawn } from '../places/generate';
import { buyProblem, placeStock } from '../places/shops';
import type { PatrolSpawn } from '../patrols/generate';
import { traderOffers } from '../patrols/travellers';
import { createInitialSave } from '../save';
import { rollForSave } from './context';
import { LOOT_SOURCES } from './types';

const ROLLS = 300;
const NOW = 1_000_000;
const HERE = { latitude: 0, longitude: 0 };

/** An ore's tier is the tier its pickaxe opens (a wooden pickaxe, the tier 1 boss reward, opens tier 2 and stone). */
const materialTier: Record<string, number> = {
  ...Object.fromEntries(resources.filter((r) => r.pickaxeTier !== undefined).map((r) => [r.yields[0].materialId, r.pickaxeTier! + 1])),
  steel: 5,
};
const tierOf = (materialId: string) => materialTier[materialId] ?? 1;

const save = createInitialSave('tier-1');
const tier = highestUnlockedTier(save);

const aboveTier = (materials: { materialId: string }[]) => materials.map((m) => m.materialId).filter((id) => tierOf(id) > tier);

describe('a tier 1 save is never granted a material above tier 1', () => {
  it('is a tier 1 save', () => expect(tier).toBe(1));

  for (const source of LOOT_SOURCES.filter((s) => s !== 'patrol')) {
    it(`${source} loot`, () => {
      const found = new Set<string>();
      for (let i = 0; i < ROLLS; i++) {
        for (const id of aboveTier(rollForSave(save, source, createRng(`${source}|${i}`), { luck: 100 }).materials)) found.add(id);
      }
      expect([...found]).toEqual([]);
    });
  }

  for (const patrolKind of new Set(patrolKindsAt(1))) {
    it(`patrol loot (${patrolKind})`, () => {
      const found = new Set<string>();
      for (let i = 0; i < ROLLS; i++) {
        const loot = rollForSave(save, 'patrol', createRng(`patrol|${patrolKind}|${i}`), { luck: 100, patrolKind });
        for (const id of aboveTier(loot.materials)) found.add(id);
      }
      expect([...found]).toEqual([]);
    });
  }

  it('shop and market stock the player can buy', () => {
    const kinds = [...(Object.keys(shopStock) as PlaceKind[]), 'market' as PlaceKind];
    const found = new Set<string>();
    for (const kind of kinds) {
      for (let i = 0; i < ROLLS; i++) {
        const spawn: PlaceSpawn = { id: `${kind}-${i}`, kind, group: kind, tile: 't', position: HERE, startsAt: 0, expiresAt: NOW * 2, roll: 0 };
        const rich = { ...save, gold: 1_000_000 };
        for (const line of placeStock(rich, spawn, NOW)) {
          if (line.kind !== 'material' || tierOf(line.id) <= tier) continue;
          if (buyProblem(rich, spawn, line.key, 1, HERE, NOW) === null) found.add(line.id);
        }
      }
    }
    expect([...found]).toEqual([]);
    expect(marketPool.length).toBeGreaterThan(0);
  });

  it('trader trades', () => {
    const found = new Set<string>();
    for (let i = 0; i < ROLLS; i++) {
      const spawn = { id: `trader-${i}`, kind: 'trader', tier } as PatrolSpawn;
      for (const offer of traderOffers(spawn, save, patrolRules)) if (tierOf(offer.get.materialId) > tier) found.add(offer.get.materialId);
    }
    expect([...found]).toEqual([]);
  });

  it('salvaging tier 1 gear', () => {
    const tier1Gear = items.filter((item) => 'tier' in item && item.tier === 1 && 'slot' in item && item.slot !== 'tool');
    const found = new Set<string>();
    for (const item of tier1Gear) {
      for (const rarity of RARITIES) {
        for (const id of aboveTier(salvageReturns({ uid: `s-${item.id}`, itemId: item.id, rarity, roll: 8, affixes: [], rerolls: 0 }))) found.add(id);
      }
    }
    expect(tier1Gear.length).toBeGreaterThan(0);
    expect([...found]).toEqual([]);
  });
});
