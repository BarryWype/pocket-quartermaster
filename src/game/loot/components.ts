import { components } from '@/content/loot/components';
import { ELEMENTS } from '@/game/elements';
import { bossById, mobById } from '@/content/enemies';

import type { Rng } from '../generation/rng';
import { familyTags } from '../enemies/tags';
import type { MobDef } from '../types';
import type { Element } from '../elements';
import type { LootSourceId } from './types';

/** The elite components: every component tagged with the families it comes from. */
const eliteComponentIds = components.filter((c) => c.tags).map((c) => c.id);

/**
 * The component a mob carries: the first of its family tags with one. Golems
 * carry the golem core among constructs; elementals carry their element's heart.
 */
export function componentForMob(mob: MobDef): string | undefined {
  for (const tag of familyTags(mob)) {
    if (tag === 'elemental') {
      if (mob.element) return `${mob.element}Heart`;
    } else if (tag === 'construct') {
      return mob.name.toLowerCase().includes('golem') ? 'golemCore' : 'clockworkEscapement';
    } else {
      const found = components.find((c) => c.tags?.includes(tag));
      if (found) return found.id;
    }
  }
  return undefined;
}

const heartOf = (element: Element | undefined, rng: Rng): string =>
  `${element ?? ELEMENTS[rng.int(0, ELEMENTS.length - 1)]}Heart`;

/**
 * The components a roll can pick from, in equal weight. Tier bosses carry
 * their own component only; the blueprint handoff (`viaBlueprints`) falls
 * through to the shared pools when the boss rule gives nothing.
 */
export function componentPool(
  source: LootSourceId,
  enemies: string[],
  element: Element | undefined,
  rng: Rng,
  viaBlueprints = false,
): string[] {
  if (source === 'tierBoss') {
    const own = components.filter((c) => c.bossId && enemies.includes(c.bossId));
    if (own.length > 0) return [own[0].id];
    if (!viaBlueprints) return [];
  }
  if (source === 'elementalRift' || source === 'sanctum') return [heartOf(element, rng)];

  const unique = (ids: (string | undefined)[]): string[] => [...new Set(ids.filter((id): id is string => id !== undefined))];
  const mobs = enemies.map((id) => mobById[id] ?? bossById[id]).filter((mob) => mob !== undefined);
  const eliteIds = enemies.filter((id) => id.includes(':elite'));
  const pool = unique(
    eliteIds.map((id) => (mobById[id] !== undefined ? componentForMob(mobById[id]) : undefined)),
  );
  if (source === 'monsterLair') pool.push('drakeFang', 'harpyFlightFeather');
  if (pool.length > 0) return pool;

  const byTags = unique(mobs.map(componentForMob));
  if (byTags.length > 0) return byTags;

  // Nothing matched: any non-boss component, the heart of a random element.
  return [...eliteComponentIds, heartOf(undefined, rng)];
}
