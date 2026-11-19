import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { effectiveRoute } from '@/game/supply/autoRoute';
import { t } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
import { useWorldStore } from '@/store/worldStore';
import { fonts, ui } from '@/theme';

import { Toast } from './motion/Toast';
import { Text } from './Text';
import { WoodButton } from './ui';

/** How long the toast stays once it shows. */
export const ROUTE_TOAST_MS = 6000;

/**
 * The route changed by itself: a toast on the map says what, with Undo (for
 * an addition) and Edit (the route planner). It waits while a sheet covers the
 * map or another tab is in front, so it is seen, then stays six seconds.
 */
export function RouteToast({ style }: { style?: StyleProp<ViewStyle> }) {
  const note = useWorldStore((state) => state.routeNote);
  const covered = useMapPanels(
    (s) =>
      s.sanctum !== null ||
      s.tavern !== null ||
      s.place !== null ||
      s.patrol !== null ||
      s.site !== null ||
      s.hallCell !== null ||
      s.supplyBuilding !== null ||
      s.cartOpen ||
      s.routePlanner !== null ||
      s.placingHall ||
      s.chooser !== null,
  );
  const focused = useIsFocused();
  const shown = note !== null && !covered && focused;

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => dismiss(note), ROUTE_TOAST_MS);
    return () => clearTimeout(timer);
  }, [shown, note]);

  if (!shown) return null;
  const undo = note.undo;
  return (
    <Toast edge="top" interactive style={[styles.toast, style]}>
      <View style={styles.body} accessibilityLiveRegion="polite">
        <Text style={styles.text}>{note.text}</Text>
        <View style={styles.buttons}>
          {undo && (
            <WoodButton
              compact
              title={t('supply.autoRoute.undo')}
              accessibilityLabel={t('supply.autoRoute.undoLabel')}
              onPress={() => {
                useGameStore.getState().undoRouteChange(undo);
                dismiss(note);
              }}
            />
          )}
          <WoodButton
            compact
            title={t('supply.autoRoute.edit')}
            accessibilityLabel={t('supply.autoRoute.editLabel')}
            onPress={() => {
              dismiss(note);
              useMapPanels.getState().openRoutePlanner(effectiveRoute(useGameStore.getState().save));
            }}
          />
        </View>
      </View>
    </Toast>
  );
}

/** Clears the note, unless a newer one took its place. */
function dismiss(note: { at: number } | null) {
  if (useWorldStore.getState().routeNote === note) useWorldStore.getState().set({ routeNote: null });
}

const styles = StyleSheet.create({
  toast: { position: 'absolute', left: 12, right: 12 },
  body: {
    gap: 8,
    padding: 10,
    backgroundColor: ui.parchment,
    borderWidth: 2,
    borderBottomWidth: 5,
    borderColor: ui.outline,
  },
  text: { color: ui.ink, fontSize: 16, fontFamily: fonts.serif },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
