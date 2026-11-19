import { placeInfo } from '@/content/places';
import { serviceRules } from '@/content/services';
import { chapelBlessingProblem } from '@/game/places/services';
import { t, tr } from '@/i18n';
import { feel } from '@/services/feel';
import { useGameStore } from '@/store/gameStore';

import { MapSheet } from '../MapSheet';
import { CareSection } from './CareSection';
import { PlaceSummary } from './PlaceSummary';
import { someTabs, usePlaceSheet, type PlaceSheetProps } from './usePlaceSheet';
import { useShop } from './useShop';

/** The chapel: its blessing for the next expedition is the main action; free care once a visit is its tab. */
export function ChapelSheet({ place, player, now, onClose }: PlaceSheetProps) {
  const base = usePlaceSheet(place, player, now);
  const shop = useShop(place, base, now);
  const info = placeInfo[place.kind];
  const problem = chapelBlessingProblem(base.save, place, player, now);
  const percent = Math.round(serviceRules.chapel.blessingDamage * 100);
  return (
    <MapSheet
      onClose={onClose}
      emoji={info.emoji}
      ring={base.ring}
      title={tr(info.name)}
      status={base.status}
      summary={
        <PlaceSummary
          line={base.save.expeditionBlessing ? t('places.blessingWaiting') : t('places.blessingHint', { percent })}
          stock={shop.stock}
          note={base.discoverLine}
        />
      }
      action={
        shop.pickedAction() ?? {
          state: base.decide(problem),
          verb: t('mapSheet.verbs.bless'),
          label: t('placeSheet.blessing'),
          blockedLabel: problem === 'alreadyBlessed' ? t('placeSheet.blocked.alreadyBlessed') : t('placeSheet.blocked.gone'),
          onPress: () => {
            useGameStore.getState().takeChapelBlessing(place, player);
            feel('reward');
          },
          onWalk: base.onWalk,
        }
      }
      secondary={(view) => (view.full && view.tab === 'care' ? [] : [{ key: 'care', title: t('placeSheet.tabs.care'), onPress: () => view.open('care') }])}
      tabs={someTabs(
        { key: 'care', label: t('placeSheet.tabs.care'), render: () => <CareSection place={place} save={base.save} player={player} now={now} distance={base.distance} paid={false} /> },
        shop.tab,
        base.detailsTab(),
      )}
      inRange={base.inRange}
    />
  );
}
