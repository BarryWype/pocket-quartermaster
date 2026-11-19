import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { placeInfo, placeRules } from '@/content/places';
import { distanceMeters } from '@/game/generation/geo';
import type { LatLng } from '@/game/generation/types';
import type { PlaceSpawn } from '@/game/places/generate';
import { mainAction } from '@/game/places/mainAction';
import { timeLeftShare } from '@/game/supply/buildings';
import { isNetworkKind } from '@/game/supply/discovery';
import { deliverProblem, isOrderKind, orderProgress } from '@/game/supply/orders';
import { useSupplyOn } from '@/hooks/useSupply';
import { t, tr } from '@/i18n';
import { feel } from '@/services/feel';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';
import { ui } from '@/theme';

import { IconLabel } from '../IconLabel';
import { mapSheetStatus, type MapSheetRing, type MapSheetSecondary, type MapSheetTab, type MapSheetView } from '../MapSheet';
import { OrderSection } from '../OrderSection';
import { Price } from '../Price';
import { Text } from '../Text';
import { leavesIn } from './placeText';

const HOUR = 3_600_000;

/**
 * What every place sheet shares: the save, the distance and range, the header's
 * ring and status line, the walk (centres the map on the place), the main
 * action's decision, the order tab and its Deliver, and the Details tab.
 */
export function usePlaceSheet(place: PlaceSpawn, player: LatLng, now: number, range: number = placeRules.interactionMeters) {
  const save = useGameStore((state) => state.save);
  const supplyOn = useSupplyOn();
  const distance = distanceMeters(player, place.position);
  const inRange = distance <= range;
  const status = mapSheetStatus({ distance, range, expiresAt: place.expiresAt, now });
  // A place's life is hours long, so its last hour is the urgent part of the ring.
  const ring: MapSheetRing = { kind: 'time', left: timeLeftShare(place.startsAt, place.expiresAt, now), last: place.expiresAt - now <= HOUR };
  const onWalk = () => useWorldStore.getState().set({ focusPlace: { latitude: place.position.latitude, longitude: place.position.longitude } });
  /** The main action's decision for a rule's problem: walk when out of range, else blocked or act. */
  const decide = <R extends string>(problem: R | 'tooFar' | null) => mainAction({ player, target: place.position, range, problem });

  const discovered = place.id in save.supply.discovered;
  const order = supplyOn && isOrderKind(place.kind) && discovered ? save.supply.orders[place.id] : undefined;
  const orderTab: MapSheetTab | null = order
    ? {
        key: 'order',
        label: t('placeSheet.tabs.order', { pct: Math.round(orderProgress(order) * 100) }),
        render: () => <OrderSection place={place} player={player} now={now} />,
      }
    : null;
  const undiscovered = supplyOn && isNetworkKind(place.kind) && !discovered;

  /** Deliver from the bag, as a secondary action, when there is something to hand over here; the order tab opens on it. */
  const deliver = (view: MapSheetView): MapSheetSecondary[] =>
    order && deliverProblem(save, place.id, place.position, player) === null
      ? [
          {
            key: 'deliver',
            title: t('supply.order.deliver'),
            onPress: () => {
              useGameStore.getState().deliverOrder(place.id, place.position, player);
              feel('reward');
              view.open('order');
            },
          },
        ]
      : [];

  const detailsTab = (extra?: ReactNode): MapSheetTab => ({
    key: 'details',
    label: t('placeSheet.tabs.details'),
    render: () => (
      <View style={styles.details}>
        <Text style={styles.muted}>{tr(placeInfo[place.kind].description)}</Text>
        <Text style={styles.muted}>{leavesIn(place.expiresAt - now)}</Text>
        <View style={styles.goldRow}>
          <Text style={styles.muted}>{t('placeSheet.youHold')}</Text>
          <Price amount={save.gold} textStyle={styles.muted} />
        </View>
        {extra}
      </View>
    ),
  });

  /** The "walk here to discover it" line for an undiscovered network place, under the summary. */
  const discoverLine = undiscovered ? <IconLabel emoji="👣" label={t('supply.discover.walkHere')} labelStyle={styles.muted} /> : null;

  return { save, player, distance, inRange, range, status, ring, onWalk, decide, orderTab, deliver, detailsTab, discoverLine };
}

const styles = StyleSheet.create({
  details: { gap: 6 },
  muted: { color: ui.inkMuted },
  goldRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
});

/** Every place sheet's props. */
export type PlaceSheetProps = { place: PlaceSpawn; player: LatLng; now: number; onClose: () => void };

/** The tabs that exist, in order. */
export const someTabs = (...tabs: (MapSheetTab | null | false)[]): MapSheetTab[] => tabs.filter((tab): tab is MapSheetTab => !!tab);
