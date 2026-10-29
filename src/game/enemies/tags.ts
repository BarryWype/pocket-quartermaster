import { mobById } from '@/content/enemies';

import type { DungeonDef, FamilyTag, MobDef, Tag } from '../types';

/** A mob's tags, with its element as a tag too. */
export const mobTags = (mob: MobDef): Tag[] => (mob.element ? [...mob.tags, mob.element] : mob.tags);

export const FAMILY_TAGS: FamilyTag[] = [
  'bird',
  'vermin',
  'carapace',
  'spirit',
  'goblinoid',
  'humanoid',
  'brute',
  'construct',
  'dragon',
  'caster',
  'elemental',
];

const KEPT: Tag[] = [...FAMILY_TAGS, 'beast', 'undead'];

/** The mob's family tags, in the order written on it: the first is its main family. */
export const familyTags = (mob: MobDef): Tag[] => mob.tags.filter((tag) => KEPT.includes(tag));

/** The different enemies a dungeon's fights put up, in encounter order, then its boss. */
export function dungeonFoes(dungeon: DungeonDef): MobDef[] {
  const fighters = dungeon.encounters.flatMap((e) => (e.type === 'fight' ? e.mobs.map((group) => mobById[group.mobId]) : []));
  const foes = [...fighters, dungeon.boss];
  return foes.filter((mob, i) => foes.findIndex((other) => other.name === mob.name) === i);
}
