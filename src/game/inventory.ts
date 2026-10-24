import type { MaterialStack } from './types';

export type Counts = Record<string, number>;

export function addMaterials(counts: Counts, stacks: MaterialStack[]): Counts {
  const next = { ...counts };
  for (const { materialId, amount } of stacks) {
    next[materialId] = (next[materialId] ?? 0) + amount;
  }
  return next;
}

export function hasMaterials(counts: Counts, stacks: MaterialStack[]): boolean {
  return stacks.every(({ materialId, amount }) => (counts[materialId] ?? 0) >= amount);
}

export function removeMaterials(counts: Counts, stacks: MaterialStack[]): Counts {
  if (!hasMaterials(counts, stacks)) throw new Error('Not enough materials');
  const next = { ...counts };
  for (const { materialId, amount } of stacks) {
    next[materialId] -= amount;
    if (next[materialId] === 0) delete next[materialId];
  }
  return next;
}
