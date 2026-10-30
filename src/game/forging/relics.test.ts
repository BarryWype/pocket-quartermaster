import { gearId, gearRecipes } from '@/content/equipment';
import { itemById, relicById } from '@/content/lookup';
import { lootConfig } from '@/content/loot/config';
import { relics, type RelicDef } from '@/content/loot/relics';
import type { GearDef, Stats } from '@/game/types';

import { createInitialSave, type SaveData } from '../save';
import { gearStats } from './quality';
import { canRestore, relicRecipe, restoreRelic } from './relics';

/** A save holding the relic and exactly its restore cost, gem included. */
const holding = (relic: RelicDef, extra: Partial<SaveData> = {}): SaveData => {
  const recipe = relicRecipe(relic);
  const materials: Record<string, number> = {};
  for (const { materialId, amount } of recipe.inputs) materials[materialId] = (materials[materialId] ?? 0) + amount;
  return {
    ...createInitialSave(),
    relics: [{ uid: 'r1', relicId: relic.id }],
    materials,
    valuables: { [`${recipe.valuables![0].valuableId}:1`]: 1 },
    ...extra,
  };
};

describe('relicRecipe', () => {
  it('costs the type recipe at the relic tier ×1.5 rounded up, plus the tier gem', () => {
    for (const relic of relics) {
      const recipe = relicRecipe(relic);
      expect(recipe.inputs).toEqual(
        gearRecipes[relic.gearType][relic.tier - 1].map(({ materialId, amount }) => ({
          materialId,
          amount: Math.ceil(amount * lootConfig.restore.recipeMultiplier),
        })),
      );
      const gem = relic.tier <= 3 ? 'roughGem' : 'cutGem';
      expect(recipe.valuables).toEqual([{ valuableId: gem, amount: 1 }]);
    }
  });
});

describe('restoreRelic', () => {
  it('spends the cost, drops the relic from the list and marks the piece with it', () => {
    const relic = relicById.sextonsMace;
    const save = holding(relic, { nextUid: 7 });
    expect(canRestore(save, 'r1')).toBe(true);
    const next = restoreRelic(save, 'r1');
    expect(next.relics).toEqual([]);
    expect(next.gear).toHaveLength(1);
    const piece = next.gear[0];
    expect(piece).toMatchObject({ uid: 'g7', itemId: gearId('mace', 1), relicId: relic.id });
    expect(next.nextUid).toBe(8);
    expect(next.materials).toEqual({});
    expect(next.valuables).toEqual({});
    expect(next.knownRecipes).toEqual(save.knownRecipes);
  });

  it('throws without the gem, the materials or the relic', () => {
    const relic = relicById.smugglersCoat;
    expect(canRestore(holding(relic, { valuables: {} }), 'r1')).toBe(false);
    expect(() => restoreRelic(holding(relic, { valuables: {} }), 'r1')).toThrow();
    expect(() => restoreRelic(holding(relic, { materials: {} }), 'r1')).toThrow();
    expect(() => restoreRelic(holding(relic), 'r9')).toThrow();
    expect(holding(relic).gear).toHaveLength(0);
  });

  it('restores free of cost when asked (debug)', () => {
    const relic = relicById.wyrmSlayersSword;
    const next = restoreRelic(holding(relic, { materials: {}, valuables: {} }), 'r1', true);
    expect(next.gear[0].relicId).toBe(relic.id);
  });

  it('rolls at least Rare over many seeds', () => {
    for (const relic of relics) {
      for (let uid = 1; uid <= 20; uid++) {
        const next = restoreRelic(holding(relic, { nextUid: uid }), 'r1');
        expect(['rare', 'legendary']).toContain(next.gear[0].quality);
      }
    }
  });

  it('gives a Legendary relic with the best roll lower stats than the plain Legendary piece', () => {
    for (const relic of relics) {
      const item = itemById[gearId(relic.gearType, relic.tier)] as GearDef;
      const restored = gearStats(item, { quality: 'legendary', roll: 1.06, relicId: relic.id });
      const plain = gearStats(item, { quality: 'legendary', roll: 1.06 });
      for (const stat of ['power', 'magic', 'armour', 'resistance', 'hp'] as (keyof Stats)[]) {
        if (!plain[stat]) continue;
        expect(restored[stat]!).toBeLessThan(plain[stat]!);
      }
    }
  });

  it('restores two relics into two pieces', () => {
    const [a, b] = [relicById.rustedSaintsBuckler, relicById.desertersMail];
    const save: SaveData = {
      ...createInitialSave(),
      relics: [{ uid: 'r1', relicId: a.id }, { uid: 'r2', relicId: b.id }],
      materials: {},
      valuables: { 'roughGem:1': 2 },
    };
    for (const relic of [a, b]) {
      for (const { materialId, amount } of relicRecipe(relic).inputs) save.materials[materialId] = (save.materials[materialId] ?? 0) + amount;
    }
    const once = restoreRelic(save, 'r1');
    const twice = restoreRelic(once, 'r2');
    expect(once.gear).toHaveLength(1);
    expect(twice.gear).toHaveLength(2);
    expect(twice.relics).toEqual([]);
    expect(twice.gear.map((piece) => piece.relicId)).toEqual([a.id, b.id]);
  });
});
