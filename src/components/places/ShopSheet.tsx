import { placeInfo } from '@/content/places';
import { tr } from '@/i18n';

import { MapSheet } from '../MapSheet';
import { PlaceSummary } from './PlaceSummary';
import { someTabs, usePlaceSheet, type PlaceSheetProps } from './usePlaceSheet';
import { useShop } from './useShop';

/**
 * The smithy and the market: a shop and nothing else. Buy is the main action;
 * Sell and Deliver sit under it. Tabs: the shop, the order, Details.
 */
export function ShopSheet({ place, player, now, onClose }: PlaceSheetProps) {
  const base = usePlaceSheet(place, player, now);
  const shop = useShop(place, base, now);
  const info = placeInfo[place.kind];
  return (
    <MapSheet
      onClose={onClose}
      emoji={info.emoji}
      ring={base.ring}
      title={tr(info.name)}
      status={base.status}
      summary={<PlaceSummary line={tr(info.description)} stock={shop.stock} note={base.discoverLine} />}
      action={shop.action}
      secondary={(view) => [...shop.otherSide(view), ...base.deliver(view)]}
      tabs={someTabs(shop.tab, base.orderTab, base.detailsTab())}
      inRange={base.inRange}
    />
  );
}
