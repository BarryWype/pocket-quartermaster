import { classAffinities } from '@/content/equipment';
import { newHero } from '@/content/heroes';
import { items } from '@/content/items';
import type { GearDef, HeroClassId, HeroState, Quality } from '@/game/types';

import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';

/** The class's best weapon of a tier: a favoured type, first one found. */
function weaponFor(classId: HeroClassId, tier: number) {
  return items.find(
    (i): i is GearDef =>
      i.slot === 'weapon' && i.tier === tier && !!i.gearType && classAffinities[classId][i.gearType as keyof (typeof classAffinities)[HeroClassId]] === 'favoured',
  );
}

/**
 * The reference team for odds targets: these classes at a level, in a tier's
 * best weapons and armour at one quality, each with a healing potion, no traits.
 */
export function referenceTeam(classes: HeroClassId[], tier: number, quality: Quality, level: number): SaveData {
  const heroes: HeroState[] = classes.map((classId, i) => newHero(`h${i}`, classId, classId, '', level));
  const armour = items.find((i) => i.slot === 'armor' && i.tier === tier)!;
  let save: SaveData = {
    ...createInitialSave(),
    tutorial: { ...createInitialSave().tutorial, step: 'done' },
    heroes,
    consumables: { ...createInitialSave().consumables, healingPotion: classes.length },
    gear: classes.flatMap((classId, i) => [
      { uid: `w${i}`, itemId: weaponFor(classId, tier)!.id, quality },
      { uid: `a${i}`, itemId: armour.id, quality },
    ]),
  };
  heroes.forEach((hero, i) => {
    save = equip(equip(equip(save, hero.id, 'weapon', `w${i}`), hero.id, 'armor', `a${i}`), hero.id, 'consumable', 'healingPotion');
  });
  return save;
}
