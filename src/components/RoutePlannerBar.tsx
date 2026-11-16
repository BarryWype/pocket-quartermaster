import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ISLAND_HEIGHT } from '@/components/IslandMenu';
import { Text } from '@/components/Text';
import { EmberButton, ParchmentCard, WoodButton } from '@/components/ui';
import { routePreview, routeProblem } from '@/game/supply/cart';
import type { RoutePoint } from '@/game/supply/types';
import { formatDistance, formatPercent, t } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
import { ui } from '@/theme';

/** Each stop's name on the points line: the hall, a camp's name, or a waypoint. */
function pointName(save: Parameters<typeof routePreview>[0], point: RoutePoint): string {
  if ('camp' in point) {
    const camp = save.supply.camps.find((c) => c.id === point.camp);
    return t(camp?.kind === 'trapper' ? 'supply.camp.trapperName' : 'supply.camp.timberName');
  }
  return t('supply.planner.waypoint');
}

/**
 * The route planner's bar, fixed at the bottom of the map while a draft is
 * open. Not a modal: the map stays tappable, so camps and cells can be added.
 */
export function RoutePlannerBar() {
  const insets = useSafeAreaInsets();
  const draft = useMapPanels((state) => state.routeDraft);
  const save = useGameStore((state) => state.save);
  const setRoute = useGameStore((state) => state.setRoute);
  const preview = useMapPanels((state) => state.draftPreview);
  const noteTips = useGameStore((state) => state.noteTips);
  useEffect(() => {
    noteTips(['supplyPlanner']);
  }, [noteTips]);

  // The preview is computed a tick after a change; the last result stays up while it runs.
  useEffect(() => {
    if (!draft) return;
    const timer = setTimeout(() => useMapPanels.getState().setDraftPreview(routePreview(save, draft, Date.now())));
    return () => clearTimeout(timer);
  }, [draft, save]);

  if (!draft) return null;
  const hasCamp = draft.some((point) => 'camp' in point);
  const problem = routeProblem(save, draft);
  const hall = t('supply.network.hall');
  const pointsLine = [hall, ...draft.map((point) => pointName(save, point)), hall].join(' → ');

  return (
    <ParchmentCard style={[styles.card, { bottom: insets.bottom + ISLAND_HEIGHT + 12 }]}>
      <View style={styles.body}>
        <Text style={styles.line}>{pointsLine}</Text>
        {preview && (
          <View style={styles.numbers}>
            <Text style={styles.muted}>
              {t('supply.planner.line', { distance: formatDistance(preview.meters), minutes: Math.round(preview.loopMinutes) })}
            </Text>
            <Text style={styles.muted}>{t('supply.planner.ambush', { percent: formatPercent(preview.ambushChance) })}</Text>
          </View>
        )}
        <Text style={styles.muted}>{t('supply.planner.hint')}</Text>
        <View style={styles.buttons}>
          <WoodButton compact title={t('supply.planner.undo')} onPress={() => useMapPanels.getState().undoRoute()} />
          <WoodButton compact title={t('supply.planner.clear')} onPress={() => useMapPanels.getState().clearRoute()} />
          <WoodButton compact title={t('common.cancel')} onPress={() => useMapPanels.getState().cancelRoute()} />
          <EmberButton
            title={t('supply.planner.save')}
            disabled={problem !== null || !hasCamp}
            onPress={() => {
              setRoute(draft);
              useMapPanels.getState().cancelRoute();
              useMapPanels.getState().openCart();
            }}
          />
        </View>
      </View>
    </ParchmentCard>
  );
}

const styles = StyleSheet.create({
  card: { position: 'absolute', left: 8, right: 8 },
  body: { gap: 8 },
  line: { color: ui.ink },
  muted: { color: ui.inkMuted },
  numbers: { gap: 2 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
