import type { ImageSourcePropType } from 'react-native';

import { itemById, relicById } from '@/content/lookup';
import type { GearDef, GearInstance } from '@/game/types';

/** A restored relic piece shows its relic's icon; any other piece shows its base item's. */
export const gearIconOf = (gear: GearInstance): ImageSourcePropType | undefined =>
  gear.relicId ? relicById[gear.relicId].icon : (itemById[gear.itemId] as GearDef).icon;
