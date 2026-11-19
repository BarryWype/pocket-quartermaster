import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { t } from '@/i18n';
import { useMapPanels } from '@/store/mapPanelsStore';
import { fonts, ui } from '@/theme';

import { GameIcon } from './GameIcon';
import { PressScale } from './motion';
import { Overlay } from './Overlay';
import { Text } from './Text';

const WIDTH = 300;
const GAP = 34;

/**
 * The chooser for overlapping markers: a tap that lands on two or more opens a
 * small list by the tap (icon, name, distance and status); picking one opens
 * its sheet. A tap outside or Android back closes it.
 */
export function MarkerChooser() {
  const chooser = useMapPanels((state) => state.chooser);
  const close = useMapPanels((state) => state.closeChooser);
  const { width, height } = useWindowDimensions();
  if (!chooser) return null;
  const anchor = chooser.anchor ?? { x: width / 2, y: height / 2 };
  const left = Math.min(Math.max(12, anchor.x - WIDTH / 2), width - WIDTH - 12);
  // Above the tap when it is in the lower half, below it otherwise, so the markers stay in sight.
  const place = anchor.y > height / 2 ? { bottom: height - anchor.y + GAP } : { top: anchor.y + GAP };
  return (
    <Overlay onClose={close} panelMotion={false} backdropStyle={styles.backdrop} contentStyle={styles.layer}>
      <View style={[styles.card, { left, width: Math.min(WIDTH, width - 24) }, place]} accessibilityRole="menu" accessibilityLabel={t('chooser.label')}>
        <Text style={styles.head}>{t('chooser.title', { count: chooser.entries.length })}</Text>
        {chooser.entries.map((entry) => (
          <PressScale
            key={entry.id}
            accessibilityRole="menuitem"
            accessibilityLabel={`${entry.name}, ${entry.status}`}
            onPress={() => {
              close();
              entry.open();
            }}
            style={styles.row}
          >
            <View style={styles.tile}>
              <View style={styles.upright}>
                <GameIcon emoji={entry.emoji} size={20} />
              </View>
            </View>
            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={1}>
                {entry.name}
              </Text>
              <Text style={styles.status} numberOfLines={1}>
                {entry.status}
              </Text>
            </View>
            <Text style={styles.go}>›</Text>
          </PressScale>
        ))}
      </View>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.15)' },
  layer: { flex: 1, padding: 0, justifyContent: 'flex-start' },
  card: {
    position: 'absolute',
    backgroundColor: ui.parchment,
    borderWidth: 3,
    borderColor: ui.outline,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 4,
  },
  head: { fontSize: 14, color: ui.inkMuted, paddingHorizontal: 6, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 6, borderTopWidth: 2, borderTopColor: ui.parchmentShade },
  tile: {
    width: 30,
    height: 30,
    transform: [{ rotate: '45deg' }],
    backgroundColor: ui.woodDeep,
    borderWidth: 2,
    borderColor: ui.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upright: { transform: [{ rotate: '-45deg' }] },
  text: { flex: 1 },
  name: { fontSize: 19, color: ui.ink },
  status: { fontSize: 13, color: ui.inkMuted, fontFamily: fonts.serif },
  go: { fontSize: 22, color: ui.brassDim },
});
