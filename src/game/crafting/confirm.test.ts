import { relicById } from '@/content/lookup';
import { lootConfig } from '@/content/loot/config';

import { createInitialSave, type SaveData } from '../save';
import { relicRecipe } from '../forging/relics';
import { forgeConfirmation, restoreConfirmation } from './confirm';

/** A save holding a relic and exactly its restore cost, gem included. */
const holding = (relicId: string): SaveData => {
  const recipe = relicRecipe(relicById[relicId]);
  const materials: Record<string, number> = {};
  for (const { materialId, amount } of recipe.inputs) materials[materialId] = (materials[materialId] ?? 0) + amount;
  return {
    ...createInitialSave(),
    relics: [{ uid: 'r1', relicId }],
    materials,
    valuables: { [`${recipe.valuables![0].valuableId}:1`]: 1 },
  };
};

describe('forgeConfirmation', () => {
  it('shows the piece, its tier and type, and the cost with what remains after', () => {
    const save = { ...createInitialSave(), materials: { wood: 6 } };
    const confirm = forgeConfirmation(save, 'sword1');
    expect(confirm).toMatchObject({ kind: 'forge', itemId: 'sword1', tier: 1, gearType: 'sword', ingredientId: null });
    expect(confirm?.cost.materials).toEqual([{ id: 'wood', needed: 4, held: 6, remaining: 2 }]);
    expect(confirm?.cost.valuables).toEqual([]);
  });

  it('expects Common without an ingredient, Uncommon with one', () => {
    const save = { ...createInitialSave(), materials: { wood: 6, dragonClaw: 1 } };
    expect(forgeConfirmation(save, 'sword1')?.expectedRarity).toBe('common');
    expect(forgeConfirmation(save, 'sword1', 'dragonClaw')?.expectedRarity).toBe('uncommon');
  });

  it('adds the ingredient to the full recipe cost when one is chosen', () => {
    const save = { ...createInitialSave(), materials: { wood: 6, dragonClaw: 1 } };
    const confirm = forgeConfirmation(save, 'sword1', 'dragonClaw');
    expect(confirm?.ingredientId).toEqual('dragonClaw');
    expect(confirm?.cost.materials).toEqual([
      { id: 'wood', needed: 4, held: 6, remaining: 2 },
      { id: 'dragonClaw', needed: 1, held: 1, remaining: 0 },
    ]);
  });

  it('shows the ingredient affix with its range, and none for a fixed affix or no ingredient', () => {
    const materials = { wood: 4 };
    const hunter = forgeConfirmation({ ...createInitialSave(), materials }, 'sword1', 'fangOrHorn');
    expect(hunter?.affix).toEqual({ id: 'hunter', min: 15, max: 30 });
    expect(forgeConfirmation({ ...createInitialSave(), materials }, 'sword1', 'dragonClaw')?.affix).toBeUndefined();
    expect(forgeConfirmation({ ...createInitialSave(), materials }, 'sword1')?.affix).toBeUndefined();
  });

  it('ranges every stat of the piece at the expected rarity', () => {
    const save = { ...createInitialSave(), materials: { wood: 6, fangOrHorn: 1 } };
    const plain = forgeConfirmation(save, 'sword1');
    const withIngredient = forgeConfirmation(save, 'sword1', 'fangOrHorn');
    expect(plain?.statRanges).toEqual(
      expect.arrayContaining([
        { key: 'power', min: 4, max: 6 },
        { key: 'crit', min: 4, max: 7 },
      ]),
    );
    const uncommonPower = withIngredient?.statRanges.find((range) => range.key === 'power');
    expect(uncommonPower).toEqual({ key: 'power', min: 4, max: 6 });
    expect(withIngredient?.statRanges).toHaveLength((plain?.statRanges ?? []).length);
  });

  it('returns null for a recipe that forges no gear', () => {
    expect(forgeConfirmation(createInitialSave(), 'smeltSteel')).toBeNull();
  });
});

describe('restoreConfirmation', () => {
  it('shows the relic, its tier and type, and the restore cost with the gem', () => {
    const save = holding('rustedSaintsBuckler');
    const confirm = restoreConfirmation(save, 'r1');
    expect(confirm).toMatchObject({ kind: 'restore', relicId: 'rustedSaintsBuckler', tier: 1, gearType: 'buckler' });
    const recipe = relicRecipe(relicById.rustedSaintsBuckler);
    expect(confirm?.cost.materials.map(({ id, needed, remaining }) => [id, needed, remaining])).toEqual(
      recipe.inputs.map(({ materialId, amount }) => [materialId, amount, 0]),
    );
    const gem = lootConfig.restore.gems[0].valuableId;
    expect(confirm?.cost.valuables).toEqual([{ id: gem, needed: 1, held: 1, remaining: 0 }]);
  });

  it('returns null when the relic is not held or not affordable', () => {
    expect(restoreConfirmation(createInitialSave(), 'r1')).toBeNull();
    const broke = { ...holding('rustedSaintsBuckler'), valuables: {} };
    expect(restoreConfirmation(broke, 'r1')).toBeNull();
  });
});
