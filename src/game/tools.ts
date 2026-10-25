import { items } from '@/content/items';

import type { ResourceDef } from './generation/types';
import type { SaveData } from './save';
import type { ToolDef } from './types';

const pickaxes = items.filter((item): item is ToolDef => item.slot === 'tool' && item.tool === 'pickaxe');

/** The strongest pickaxe the player owns, or null. */
export function bestPickaxe(save: Pick<SaveData, 'tools'>): ToolDef | null {
  return pickaxes.filter((p) => save.tools.includes(p.id)).reduce<ToolDef | null>(
    (best, p) => (!best || p.power > best.power ? p : best),
    null,
  );
}

/** The weakest pickaxe that can mine a node needing `power`. */
export function pickaxeFor(power: number): ToolDef | undefined {
  return pickaxes.filter((p) => p.power >= power).sort((a, b) => a.power - b.power)[0];
}

export function canGather(save: Pick<SaveData, 'tools'>, resource: ResourceDef) {
  return (resource.requiresPickaxe ?? 0) <= (bestPickaxe(save)?.power ?? 0);
}
