import { gearProfiles } from '@/content/equipment';
import { familyOfThreat } from '@/content/families';
import { itemById } from '@/content/lookup';

import type { SaveData } from '../save';
import { affinityOf, isOnExpedition } from '../team/team';
import type { Briefing, GearDef, GearType } from '../types';

/**
 * The gear types a looted piece leans towards (lootConfig.usefulDrops): the
 * types carrying a threat family one of the open briefings needs that no
 * free hero can wear yet (a free hero could wear the type, but the roster has
 * no piece of it of the tier or one below that isn't away on a run);
 * failing those, the types some hero could wear that the roster owns none of.
 */
export function usefulGearTypes(save: SaveData, briefings: Briefing[], tier: number): GearType[] {
  const free = save.heroes.filter((hero) => !isOnExpedition(save, hero.id));
  const away = new Set(save.heroes.filter((hero) => !free.includes(hero)).flatMap((hero) => Object.values(hero.equipment)));
  const wearable = (type: GearType, heroes = free) => heroes.some((hero) => affinityOf(hero.classId, type) !== 'unfit');
  const held = (type: GearType, minTier: number) =>
    save.gear.some((piece) => {
      const item = itemById[piece.itemId] as GearDef;
      return item.gearType === type && !item.workTool && item.tier >= minTier && !away.has(piece.uid);
    });
  const types = Object.keys(gearProfiles) as GearType[];
  const needed = new Set(briefings.flatMap((briefing) => briefing.threats.map((threat) => familyOfThreat(threat.id))));
  const forThreats = types.filter((type) => {
    const { familyTag, secondFamily } = gearProfiles[type];
    return (needed.has(familyTag) || (secondFamily !== undefined && needed.has(secondFamily))) && wearable(type) && !held(type, tier - 1);
  });
  if (forThreats.length > 0) return forThreats;
  return types.filter((type) => wearable(type, save.heroes) && !held(type, 1));
}
