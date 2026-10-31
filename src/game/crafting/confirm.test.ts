import { relicById } from '@/content/lookup';
import { lootConfig } from '@/content/loot/config';

import { createInitialSave, type SaveData } from '../save';
import { qualityOdds } from '../forging/quality';
import { relicRecipe } from '../forging/relics';
import { forgeConfirmation, restoreConfirmation } from './confirm';
import type { Quality } from '../types';

const likeliest = (odds: Record<Quality, number>) =>
  (Object.keys(odds) as Quality[]).reduce((best, quality) => (odds[quality] > odds[best] ? quality : best));

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
    expect(confirm).toMatchObject({ kind: 'forge', itemId: 'sword1', tier: 1, gearType: 'sword', componentId: null });
    expect(confirm?.cost.materials).toEqual([{ id: 'wood', needed: 4, held: 6, remaining: 2 }]);
    expect(confirm?.cost.valuables).toEqual([]);
  });

  it('expects the likeliest quality for the current mastery', () => {
    const confirm = forgeConfirmation({ ...createInitialSave(), materials: { wood: 6 } }, 'sword1');
    expect(confirm?.expectedQuality).toEqual(likeliest(qualityOdds(1, 1)));
    expect(confirm?.masteryLevel).toEqual(1);
  });

  it('swaps the component unit into the cost when one is chosen', () => {
    const save = { ...createInitialSave(), materials: { wood: 6, fireHeart: 1 } };
    const confirm = forgeConfirmation(save, 'sword1', 'fireHeart');
    expect(confirm?.componentId).toEqual('fireHeart');
    expect(confirm?.cost.materials).toEqual([
      { id: 'wood', needed: 3, held: 6, remaining: 3 },
      { id: 'fireHeart', needed: 1, held: 1, remaining: 0 },
    ]);
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
