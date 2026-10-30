import { bossById, mobById } from '@/content/enemies';
import { monsterParts } from '@/content/loot/monsterParts';
import { shardId, type Element } from '@/game/elements';

import { familyTags } from '../enemies/tags';

/**
 * The monster parts (and shards of elemental foes) a roll picks from, weighted
 * by the enemies' family tags: the main family counts double.
 */
export function partWeights(
  enemies: string[],
  element: Element | undefined,
): { materialId: string; weight: number }[] {
  const weights: { materialId: string; weight: number }[] = [];
  const add = (materialId: string, weight: number) => {
    const held = weights.find((entry) => entry.materialId === materialId);
    if (held) held.weight += weight;
    else weights.push({ materialId, weight });
  };

  for (const id of enemies) {
    const mob = mobById[id] ?? bossById[id];
    if (!mob) continue;
    const tags = familyTags(mob);
    tags.forEach((tag, i) => {
      const weight = i === 0 ? 2 : 1;
      if (tag === 'elemental') {
        const mobElement = mob.element ?? element;
        if (mobElement) add(shardId(mobElement), weight);
        return;
      }
      const part = monsterParts.find((p) => p.tag === tag);
      if (part) add(part.id, weight);
    });
  }

  if (weights.length === 0) return monsterParts.map((part) => ({ materialId: part.id, weight: 1 }));
  return weights;
}
