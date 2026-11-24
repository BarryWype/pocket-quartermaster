import { Marker, ViewAnnotation } from '@maplibre/maplibre-react-native';
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { GameIcon } from '@/components/GameIcon';
import { Text } from '@/components/Text';
import { clockConfig } from '@/content/clockConfig';
import { tileCenter } from '@/game/generation/tiles';
import { sameStop } from '@/game/supply/autoRoute';
import { loopPreview } from '@/game/supply/cart';
import { plannerStops } from '@/game/supply/planner';
import { isStop, moveGrab } from '@/game/supply/routeEdit';
import { useNow } from '@/hooks/useNow';
import { t } from '@/i18n';
import { snapGrab } from '@/services/streetPath';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
import { ui } from '@/theme';

import { ROUTE_COLOUR } from '../SupplyRoute';

import { toggleRouteStop } from './routeTap';
import { stopEmoji, stopId, stopName } from './stops';

const PIN = 48;
const toLngLat = (position: { latitude: number; longitude: number }): [number, number] => [position.longitude, position.latitude];

/** A grab point let go: it snaps to the nearest street, and the route redraws through it. */
const dropGrab = (index: number, at: { latitude: number; longitude: number }) => {
  void snapGrab(useGameStore.getState().save, at).then((snapped) => {
    const mode = useMapPanels.getState().routeMode;
    if (mode) useMapPanels.getState().setRouteDraft(moveGrab(mode.draft, index, snapped));
  });
};

/**
 * Route mode's pins on the map: the hall, every building and every discovered
 * place with a live order within the hall's reach, large, numbered when on the
 * draft and marked ⏳ when they leave before the next loop ends; and the
 * draft's grab points, which a hold then a drag moves. Only this tree (and the
 * bar and the route line) re-render as the draft changes.
 */
export const RouteModePins = memo(function RouteModePins() {
  const mode = useMapPanels((s) => s.routeMode);
  const path = useMapPanels((s) => s.routePath);
  const selectedGrab = useMapPanels((s) => s.selectedGrab);
  const save = useGameStore((s) => s.save);
  const now = useNow(clockConfig.minutesMs);
  // The pickable stops depend on the save and the clock only: a tap changes neither, so it never regenerates the places.
  const stops = useMemo(() => plannerStops(save, now), [save, now]);
  const hall = save.supply.hall;
  if (!mode || !hall) return null;
  const draft = mode.draft;
  const leaving = loopPreview(save, draft, path, now).leaving;
  const numbers = new Map<string, number>();
  draft.filter(isStop).forEach((point, i) => {
    const id = stopId(point);
    if (id) numbers.set(id, i + 1);
  });
  const nextNumber = numbers.size + 1;

  return (
    <>
      <Marker id="route-pin:hall" lngLat={toLngLat(tileCenter(hall.cell))}>
        <View style={[styles.pin, styles.hallPin]} accessibilityLabel={t('supply.routeMode.hall')}>
          <GameIcon emoji="🏠" size={30} />
        </View>
      </Marker>
      {stops.map((stop) => {
        const point = stop.point;
        const id = stop.kind === 'building' ? stop.building.id : stop.place.id;
        const position = stop.kind === 'building' ? stop.building.position : stop.place.position;
        const n = numbers.get(id);
        const on = draft.some((picked) => sameStop(picked, point));
        const name = stopName(save, point);
        return (
          <Marker key={id} id={`route-pin:${id}`} lngLat={toLngLat(position)} onPress={() => toggleRouteStop(point)}>
            <View
              style={[styles.pin, on && styles.pinOn]}
              accessibilityRole="button"
              accessibilityLabel={on && n ? t('supply.routeMode.pinRemove', { name, n }) : t('supply.routeMode.pinAdd', { name, n: nextNumber })}
            >
              <GameIcon emoji={stopEmoji(save, point)} size={30} />
              {on && n !== undefined && (
                <View style={styles.number}>
                  <Text style={styles.numberText}>{n}</Text>
                </View>
              )}
              {leaving.includes(id) && (
                <View style={styles.leaving}>
                  <GameIcon emoji="⏳" size={16} />
                </View>
              )}
            </View>
          </Marker>
        );
      })}
      {draft.map((point, index) =>
        'via' in point ? (
          <ViewAnnotation
            key={`grab:${index}:${point.via.latitude},${point.via.longitude}`}
            id={`route-grab:${index}`}
            lngLat={toLngLat(point.via)}
            draggable
            onPress={() => useMapPanels.getState().selectGrab(index)}
            onDragEnd={(event) => {
              const [longitude, latitude] = event.nativeEvent.lngLat;
              dropGrab(index, { latitude, longitude });
            }}
          >
            <View style={[styles.grab, selectedGrab === index && styles.grabSelected]} accessibilityLabel={t('supply.routeMode.grabLabel')} />
          </ViewAnnotation>
        ) : null,
      )}
    </>
  );
});

const styles = StyleSheet.create({
  pin: {
    width: PIN,
    height: PIN,
    borderRadius: PIN / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.parchment,
    borderWidth: 3,
    borderColor: ui.outline,
  },
  pinOn: { borderColor: ROUTE_COLOUR, borderWidth: 4 },
  hallPin: { backgroundColor: ui.brassLight },
  number: {
    position: 'absolute',
    top: -8,
    right: -8,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.outline,
    borderWidth: 2,
    borderColor: ui.brass,
  },
  numberText: { color: ui.parchment, fontSize: 14 },
  leaving: { position: 'absolute', bottom: -8, left: -8, backgroundColor: ui.ember, borderWidth: 2, borderColor: ui.outline },
  grab: { width: 26, height: 26, borderRadius: 13, backgroundColor: ui.brass, borderWidth: 3, borderColor: ui.outline },
  grabSelected: { backgroundColor: ui.brassLight, borderColor: ROUTE_COLOUR },
});
