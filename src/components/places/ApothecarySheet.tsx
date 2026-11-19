import { placeInfo } from '@/content/places';
import { t, tr } from '@/i18n';

import { MapSheet } from '../MapSheet';
import { CareSection } from './CareSection';
import { PlaceSummary } from './PlaceSummary';
import { someTabs, usePlaceSheet, type PlaceSheetProps } from './usePlaceSheet';
import { useShop } from './useShop';

/** The apothecary: potions and herbs to buy, parts it buys, and paid care for heroes at home. */
export function ApothecarySheet({ place, player, now, onClose }: PlaceSheetProps) {
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
      secondary={(view) => [
        ...(view.full && view.tab === 'care' ? [] : [{ key: 'care', title: t('placeSheet.tabs.care'), onPress: () => view.open('care') }]),
        ...base.deliver(view),
      ]}
      tabs={someTabs(
        shop.tab,
        { key: 'care', label: t('placeSheet.tabs.care'), render: () => <CareSection place={place} save={base.save} player={player} now={now} distance={base.distance} paid /> },
        base.orderTab,
        base.detailsTab(),
      )}
      inRange={base.inRange}
    />
  );
}
