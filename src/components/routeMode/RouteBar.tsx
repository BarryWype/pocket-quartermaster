import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GameIcon } from '@/components/GameIcon';
import { IconLabel } from '@/components/IconLabel';
import { ISLAND_HEIGHT } from '@/components/IslandMenu';
import { Overlay } from '@/components/Overlay';
import { Panel } from '@/components/Panel';
import { Text } from '@/components/Text';
import { EmberButton, WoodButton } from '@/components/ui';
import { clockConfig } from '@/content/clockConfig';
import { materialById } from '@/content/lookup';
import { distanceMeters } from '@/game/generation/geo';
import { tileCenter } from '@/game/generation/tiles';
import { sameRoute } from '@/game/supply/autoRoute';
import { buildingReach } from '@/game/supply/buildings';
import { loopPreview, routeProblem } from '@/game/supply/cart';
import { stopPosition, suggestOrder } from '@/game/supply/planner';
import { dropIndex, isStop, removeAt, reorderStops, shiftStop } from '@/game/supply/routeEdit';
import type { RoutePoint } from '@/game/supply/types';
import { useNow } from '@/hooks/useNow';
import { useStreetPath } from '@/hooks/useStreetPath';
import { t } from '@/i18n';
import { feel } from '@/services/feel';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
import { fonts, ui } from '@/theme';

import { ROUTE_COLOUR } from '../SupplyRoute';
import { stopEmoji, stopId, stopName } from './stops';

/** Up to this many goods on a chip; the rest are in the stats line's home goods. */
const CHIP_GOODS = 2;
/** How long the bar says why a tapped marker isn't a stop. */
const TAP_NOTE_MS = 5000;

/**
 * Route mode's slim bar above the island menu: the draft's stops as chips
 * (tap for Earlier, Later and Remove; hold and drag sideways to move), the
 * loop time, its risky streets and what goes home, then Cancel, Suggest order
 * and Save. It finds the draft's street path, which the map draws. Leaving with
 * changes asks once.
 */
export function RouteBar() {
  const mode = useMapPanels((s) => s.routeMode);
  const selectedGrab = useMapPanels((s) => s.selectedGrab);
  const tapNote = useMapPanels((s) => s.routeTapNote);
  const save = useGameStore((s) => s.save);
  const now = useNow(clockConfig.minutesMs);
  const insets = useSafeAreaInsets();
  const draft = useMemo(() => mode?.draft ?? [], [mode]);
  const hasStop = draft.some(isStop);
  const { path, finding } = useStreetPath(hasStop ? draft : []);
  const [selected, setSelected] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  // The map draws the draft along the streets as soon as it is found.
  useEffect(() => {
    useMapPanels.getState().setRoutePath(hasStop ? path : null);
  }, [hasStop, path]);

  const changed = mode !== null && !sameRoute(mode.draft, mode.start);
  const leave = () => {
    if (changed) setConfirming(true);
    else useMapPanels.getState().closeRouteMode();
  };
  // Why a tapped marker isn't a stop: read, then gone (an edit clears it sooner).
  useEffect(() => {
    if (tapNote === null) return;
    const timer = setTimeout(() => {
      if (useMapPanels.getState().routeTapNote === tapNote) useMapPanels.getState().setRouteTapNote(null);
    }, TAP_NOTE_MS);
    return () => clearTimeout(timer);
  }, [tapNote]);

  // The phone's back button leaves route mode the same way.
  const leaveRef = useRef(leave);
  useEffect(() => {
    leaveRef.current = leave;
  });
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      leaveRef.current();
      return true;
    });
    return () => subscription.remove();
  }, []);

  const setDraft = (next: RoutePoint[]) => {
    setSelected(null);
    useMapPanels.getState().setRouteDraft(next);
  };

  const stops = draft.map((point, index) => ({ point, index })).filter(({ point }) => isStop(point));
  const preview = loopPreview(save, draft, hasStop ? path : null, now);
  const previewOf = (point: RoutePoint) => preview.stops.find((stop) => (stop.point.buildingId ?? stop.point.placeId) === stopId(point));

  const problem = routeProblem(save, draft);
  const hall = save.supply.hall;
  const tooFar = hall
    ? stops.find(({ point }) => {
        const at = stopPosition(save, point);
        return at !== null && distanceMeters(tileCenter(hall.cell), at) > buildingReach(save).meters;
      })
    : undefined;
  const saveTitle =
    problem === 'noStop' || problem === 'noHall'
      ? t('supply.routeMode.needsStop')
      : problem === 'tooFar' && tooFar
        ? t('supply.routeMode.tooFar', { name: stopName(save, tooFar.point) })
        : finding
          ? t('supply.routeMode.finding')
          : t('supply.routeMode.save');

  const onSave = () => {
    useGameStore.getState().setRoute(draft, path ?? undefined);
    feel('reward');
    useMapPanels.getState().closeRouteMode();
  };

  const drag = useChipDrag((from, to) => {
    feel('press');
    setDraft(reorderStops(draft, from, to));
  });

  const goods = (amounts: Record<string, number>, mark: string, limit = Infinity) =>
    Object.entries(amounts)
      .filter(([, count]) => count > 0)
      .slice(0, limit)
      .map(([good, count]) => (
        <IconLabel
          key={`${mark}${good}`}
          emoji={materialById[good]?.emoji}
          icon={materialById[good]?.icon}
          label={`${mark}${count}`}
          size={14}
          labelStyle={styles.small}
        />
      ));

  const selectedStop = selected !== null ? stops.findIndex(({ index }) => index === selected) : -1;
  const homeGoods = goods(preview.home, '');

  return (
    <>
      <View style={[styles.bar, { bottom: insets.bottom + ISLAND_HEIGHT + 8 }]} accessibilityLiveRegion="polite">
        {tapNote !== null && (
          <Text style={styles.tapNote} accessibilityRole="alert">
            {tapNote}
          </Text>
        )}
        {stops.length === 0 ? (
          <Text style={styles.hint}>{t('supply.routeMode.hint')}</Text>
        ) : (
          <ScrollView horizontal scrollEnabled={drag.from === null} showsHorizontalScrollIndicator={false}>
            <View style={styles.chips} {...drag.handlers}>
              {stops.map(({ point, index }, n) => {
                const stop = previewOf(point);
                const id = stopId(point);
                const name = stopName(save, point);
                const dragging = drag.from === n;
                return (
                  <Pressable
                    key={`${id}:${index}`}
                    onLayout={(event) => drag.measure(n, event.nativeEvent.layout)}
                    onPress={() => setSelected(selected === index ? null : index)}
                    onLongPress={() => {
                      feel('press');
                      drag.start(n);
                    }}
                    onPressOut={drag.pressOut}
                    delayLongPress={350}
                    accessibilityRole="button"
                    accessibilityLabel={t('supply.routeMode.chipLabel', { n: n + 1, name })}
                    accessibilityHint={t('supply.routeMode.chipHint')}
                    style={[
                      styles.chip,
                      selected === index && styles.chipSelected,
                      dragging && styles.chipDragging,
                      dragging && { transform: [{ translateX: drag.dx }] },
                    ]}
                  >
                    <Text style={styles.chipNumber}>{n + 1}</Text>
                    <GameIcon emoji={stopEmoji(save, point)} size={22} />
                    {stop && goods(stop.loads, '▲', CHIP_GOODS)}
                    {stop && goods(stop.unloads, '▼', CHIP_GOODS)}
                    {id !== null && preview.leaving.includes(id) && <GameIcon emoji="⏳" size={14} />}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}

        {selectedStop !== -1 && selected !== null && (
          <View style={styles.actions}>
            <WoodButton compact title={t('supply.routeMode.earlier')} disabled={selectedStop === 0} onPress={() => setDraft(shiftStop(draft, selected, -1))} />
            <WoodButton
              compact
              title={t('supply.routeMode.later')}
              disabled={selectedStop === stops.length - 1}
              onPress={() => setDraft(shiftStop(draft, selected, 1))}
            />
            <WoodButton compact title={t('supply.routeMode.remove')} onPress={() => setDraft(removeAt(draft, selected))} />
          </View>
        )}
        {selectedGrab !== null && draft[selectedGrab] && 'via' in draft[selectedGrab] && (
          <View style={styles.actions}>
            <Text style={styles.small}>{t('supply.routeMode.grab')}</Text>
            <WoodButton compact title={t('supply.routeMode.removeGrab')} onPress={() => setDraft(removeAt(draft, selectedGrab))} />
          </View>
        )}

        {stops.length > 0 && (
          <View style={styles.stats}>
            <Text style={styles.small}>
              {[
                t('supply.routeMode.loop', { minutes: Math.round(preview.minutes) }),
                preview.riskyCells > 0 ? t('supply.routeMode.risky', { count: preview.riskyCells }) : t('supply.routeMode.noRisk'),
                homeGoods.length > 0 ? t('supply.routeMode.home') : t('supply.routeMode.nothingHome'),
              ].join(' · ')}
            </Text>
            {homeGoods}
          </View>
        )}
        {stops.flatMap(({ point }) => {
          const id = stopId(point);
          return id !== null && preview.leaving.includes(id)
            ? [
                <IconLabel
                  key={`leaving:${id}`}
                  emoji="⏳"
                  size={14}
                  label={t('supply.routeMode.leaving', { name: stopName(save, point) })}
                  labelStyle={styles.warning}
                />,
              ]
            : [];
        })}
        {hasStop &&
          !finding &&
          path?.straightLegs.map((leg) => (
            <Text key={`straight:${leg}`} style={styles.muted}>
              {t('supply.routeMode.noStreet', { a: anchorName(save, draft, leg), b: anchorName(save, draft, leg + 1) })}
            </Text>
          ))}

        <View style={styles.buttons}>
          <WoodButton compact title={t('supply.routeMode.cancel')} onPress={leave} />
          <WoodButton compact title={t('supply.routeMode.suggest')} disabled={stops.length < 2} onPress={() => setDraft(suggestOrder(save, draft))} />
          <EmberButton compact title={saveTitle} disabled={problem !== null || finding} onPress={onSave} />
        </View>
      </View>
      {confirming && (
        <Overlay onClose={() => setConfirming(false)}>
          <Panel style={styles.dialog}>
            <Text style={styles.dialogTitle}>{t('supply.routeMode.leaveTitle')}</Text>
            <Text>{t('supply.routeMode.leaveBody')}</Text>
            <View style={styles.dialogActions}>
              <EmberButton title={t('supply.routeMode.keepEditing')} onPress={() => setConfirming(false)} />
              <WoodButton
                title={t('supply.routeMode.leave')}
                onPress={() => {
                  setConfirming(false);
                  useMapPanels.getState().closeRouteMode();
                }}
              />
            </View>
          </Panel>
        </Overlay>
      )}
    </>
  );
}

/** A leg's end by name: the hall at either end, else the route point (a grab point by that name). */
function anchorName(save: Parameters<typeof stopName>[0], draft: RoutePoint[], at: number): string {
  return at === 0 || at > draft.length ? t('supply.routeMode.hall') : stopName(save, draft[at - 1]);
}

/**
 * Dragging a chip sideways: a long press picks it up, the finger's moves slide
 * it (the bar's scroll is off meanwhile), and letting go drops it among the
 * others, by their middles. A long press let go without a move puts it back.
 */
function useChipDrag(onDrop: (from: number, to: number) => void) {
  const [state, setState] = useState<{ from: number; dx: number } | null>(null);
  const layouts = useRef<{ x: number; width: number }[]>([]);
  const live = useRef<{ from: number; dx: number; moved: boolean } | null>(null);
  const dropRef = useRef(onDrop);
  useEffect(() => {
    dropRef.current = onDrop;
  });

  // The responder's callbacks read the refs only during a drag, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() => {
    const finish = (dx: number) => {
      const drag = live.current;
      live.current = null;
      setState(null);
      if (!drag) return;
      const to = dropIndex(layouts.current, drag.from, dx);
      if (to !== drag.from) dropRef.current(drag.from, to);
    };
    return PanResponder.create({
      // Only once a chip is picked up does the bar take the finger from the chip and the scroll.
      onMoveShouldSetPanResponderCapture: () => live.current !== null,
      onPanResponderGrant: () => {
        if (live.current) live.current.moved = true;
      },
      onPanResponderMove: (_, { dx }) => {
        if (!live.current) return;
        live.current.dx = dx;
        setState({ from: live.current.from, dx });
      },
      onPanResponderRelease: (_, { dx }) => finish(dx),
      onPanResponderTerminate: () => finish(live.current?.dx ?? 0),
    });
  });

  return {
    from: state?.from ?? null,
    dx: state?.dx ?? 0,
    handlers: responder.panHandlers,
    measure: (n: number, layout: { x: number; width: number }) => {
      layouts.current[n] = { x: layout.x, width: layout.width };
    },
    start: (n: number) => {
      live.current = { from: n, dx: 0, moved: false };
      setState({ from: n, dx: 0 });
    },
    pressOut: () => {
      // A long press let go before any move: nothing was dragged.
      if (live.current && !live.current.moved) {
        live.current = null;
        setState(null);
      }
    },
  };
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 8,
    right: 8,
    gap: 6,
    padding: 8,
    backgroundColor: ui.parchment,
    borderWidth: 3,
    borderColor: ui.outline,
  },
  hint: { color: ui.ink, fontSize: 16 },
  tapNote: { color: ui.ink, fontSize: 15, borderLeftWidth: 4, borderLeftColor: ui.ember, paddingLeft: 8 },
  chips: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  chip: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    borderWidth: 2,
    borderColor: ui.outline,
    backgroundColor: ui.parchmentShade,
  },
  chipSelected: { borderColor: ROUTE_COLOUR, borderWidth: 3 },
  chipDragging: { backgroundColor: ui.brassLight, zIndex: 1, elevation: 4 },
  chipNumber: { color: ui.ink, fontFamily: fonts.serifBold, fontSize: 16 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  small: { color: ui.ink, fontSize: 15 },
  muted: { color: ui.inkMuted, fontSize: 14 },
  warning: { color: ui.bad, fontSize: 14, fontFamily: fonts.serifBold },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 6 },
  dialog: { gap: 10, padding: 14 },
  dialogTitle: { fontSize: 24 },
  dialogActions: { gap: 8, marginTop: 4 },
});
