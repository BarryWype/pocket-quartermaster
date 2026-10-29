import type { FamilyTag, MobDef, Tag } from '../types';

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
