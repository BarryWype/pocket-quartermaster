import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { TimeRing } from '@/components/ui';
import { siteQuality } from '@/game/supply/sites';
import type { PlaceSpawn } from '@/game/places/generate';
import { t } from '@/i18n';
import { colors, ui } from '@/theme';

/** The rotated square's side: the same footprint as the places' diamonds. */
const SIDE = 31;

type Props = { site: PlaceSpawn; discovered: Record<string, number>; timeLeft?: number; lastDay?: boolean };

/**
 * A site on the map: a dashed brass diamond with an empty sign, so it never
 * looks like a place to visit for goods. Stars in the label once discovered;
 * footprints until then.
 */
export function SiteMarker({ site, discovered, timeLeft, lastDay }: Props) {
  const isDiscovered = site.id in discovered;
  const quality = siteQuality(site);
  const stars = `${'★'.repeat(quality)}${'☆'.repeat(3 - quality)}`;
  const spoken = [
    ...(isDiscovered
      ? [t('supply.site.label'), quality === 1 ? t('supply.site.oneStar') : t('supply.site.starsLabel', { count: quality })]
      : [t('supply.site.label'), t('supply.discover.notVisitedLabel')]),
    ...(lastDay ? [t('supply.time.lastDayLabel')] : []),
  ].join(', ');
  const tile = (
    <View style={styles.tile}>
      <View style={styles.upright}>
        <Text style={styles.emoji}>🪧</Text>
      </View>
    </View>
  );
  return (
    <View style={styles.marker} accessibilityLabel={spoken}>
      <View style={styles.tileWrap}>
        {timeLeft === undefined ? (
          tile
        ) : (
          <TimeRing left={timeLeft} last={!!lastDay} size={SIDE}>
            {tile}
          </TimeRing>
        )}
        {!isDiscovered && <Text style={styles.unvisited}>👣</Text>}
      </View>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{t('supply.site.label')}</Text>
        {discovered && <Text style={styles.stars}>{stars}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  marker: { alignItems: 'center' },
  tileWrap: { position: 'relative' },
  tile: {
    width: SIDE,
    height: SIDE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.woodDark,
    transform: [{ rotate: '45deg' }],
    borderWidth: 3,
    borderStyle: 'dashed',
    borderColor: ui.brass,
  },
  upright: { transform: [{ rotate: '-45deg' }] },
  emoji: { fontSize: 22 },
  // The diamond's top-right corner.
  unvisited: { position: 'absolute', right: -8, top: -8, fontSize: 14 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  label: {
    paddingHorizontal: 4,
    fontSize: 14,
    color: colors.parchment,
    backgroundColor: colors.woodDark,
  },
  stars: { fontSize: 14, color: ui.brassLight },
});
