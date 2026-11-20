import { placeInfo } from '@/content/places';
import { buildingEmoji, buildingNameKey } from '@/game/supply/buildings';
import { orderPlaceName } from '@/game/supply/orders';
import type { RoutePoint } from '@/game/supply/types';
import type { SaveData } from '@/game/save';
import { tavernNameOf } from '@/game/taverns/taverns';
import { t } from '@/i18n';

/** A route point's name, for its pin, chip and labels. */
export function stopName(save: SaveData, point: RoutePoint): string {
  if ('building' in point) {
    const building = save.supply.buildings.find((b) => b.id === point.building);
    return building ? t(buildingNameKey[building.kind]) : t('supply.routeMode.grab');
  }
  if ('place' in point) {
    const order = save.supply.orders[point.place];
    return order ? orderPlaceName(order, tavernNameOf) : t('supply.routeMode.grab');
  }
  return t('supply.routeMode.grab');
}

/** A route point's icon. */
export function stopEmoji(save: SaveData, point: RoutePoint): string {
  if ('building' in point) {
    const building = save.supply.buildings.find((b) => b.id === point.building);
    return building ? buildingEmoji[building.kind] : '⬤';
  }
  if ('place' in point) {
    const order = save.supply.orders[point.place];
    return order ? placeInfo[order.kind].emoji : '⬤';
  }
  return '◆';
}

/** The id a stop's expiry is listed under in a loop preview. */
export const stopId = (point: RoutePoint): string | null => ('building' in point ? point.building : 'place' in point ? point.place : null);
