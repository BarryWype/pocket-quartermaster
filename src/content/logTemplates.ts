import type { HeroClassId } from '@/game/types';

// Placeholders: {hero} {weapon} {enemy} {boss} {dungeon} {gear} {consumable} {gold} {item}
export const logTemplates = {
  intro: [
    'The party set out for {dungeon}.',
    'Torches lit, the team crept into {dungeon}.',
    'At first light the heroes reached {dungeon}.',
  ],
  heroAction: {
    warrior: [
      '{hero} cleaved through a {enemy} with {weapon}.',
      '{hero} held the line against a charging {enemy}.',
      '{hero} knocked a {enemy} flat with {weapon}.',
    ],
    archer: [
      'From the shadows, {hero} picked off a {enemy} with {weapon}.',
      '{hero} pinned a {enemy} to the wall with {weapon}.',
      '{hero} spotted an ambush of {enemy}s before it sprang.',
    ],
    fireMage: [
      '{hero} burned a {enemy} to cinders with {weapon}.',
      '{hero} set a nest of {enemy}s ablaze.',
      '{hero} lit the dark halls and scattered a {enemy}.',
    ],
  } satisfies Record<HeroClassId, string[]>,
  /** Used for {weapon} when a hero has none. */
  noWeapon: 'a borrowed stick',
  consumable: ['{hero} drank the {consumable} at just the right moment.', '{hero} shared the {consumable} before the last fight.'],
  hazard: ['The heat sapped {hero}\'s strength.', '{hero} staggered through the smoke.'],
  cracked: ["{hero}'s {gear} cracked under the {boss}'s blow.", "{hero}'s {gear} is badly worn."],
  broken: ["{hero}'s {gear} shattered and was lost.", "The {boss} snapped {hero}'s {gear} in two."],
  success: ['The {boss} fell. The team came home with {gold} gold.', 'With the {boss} beaten, the heroes looted {gold} gold.'],
  failure: ['The {boss} was too strong. The team retreated, bruised.', 'The {boss} drove the heroes back empty-handed.'],
  recipe: ['Among the spoils: the recipe for {item}!'],
};
