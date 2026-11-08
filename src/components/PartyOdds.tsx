import { StyleSheet, View } from 'react-native';

import { oddsBand } from '@/game/expeditions/odds';
import { formatPercent, t } from '@/i18n';
import { fonts, ui } from '@/theme';

import { Text } from './Text';

const ODDS_COLOURS = { Hopeless: ui.bad, Risky: ui.bad, Fair: ui.gold, Favourable: ui.hp, AlmostSure: ui.hp } as const;

/** A chance as the party dialog shows it: "58%", "…" while computing, "?" without heroes. */
const oddsText = (chance: number | null | undefined) => (chance === null ? '?' : chance === undefined ? '…' : formatPercent(chance));

const colourOf = (chance: number | null | undefined, fallback: string) => (typeof chance === 'number' ? ODDS_COLOURS[oddsBand(chance)] : fallback);

/** The odds medallion beside Send: "?" until a hero is in, then the party's chance, coloured by its band. */
export function OddsMedallion({ chance }: { chance: number | null | undefined }) {
  const colour = colourOf(chance, ui.brassDim);
  return (
    <View style={[styles.medallion, { borderColor: colour }]} accessibilityLabel={`${t('partyDialog.odds')} ${oddsText(chance)}`}>
      <Text style={[styles.medallionValue, { color: colour }]}>{oddsText(chance)}</Text>
      <Text style={styles.medallionLabel}>{t('partyDialog.odds')}</Text>
    </View>
  );
}

/** "Odds 58% → 72%", in a picker's detail card. */
export function OddsChange({ before, after }: { before: number | null | undefined; after: number | null | undefined }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{t('partyDialog.oddsLabel')}</Text>
      <Text style={styles.before}>{oddsText(before)}</Text>
      <Text style={styles.label}>→</Text>
      <Text style={[styles.after, { color: colourOf(after, ui.inkMuted) }]}>{oddsText(after)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  medallion: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.woodDeep,
    borderWidth: 3,
  },
  medallionValue: { fontFamily: fonts.body, fontSize: 24, lineHeight: 26 },
  medallionLabel: { fontFamily: fonts.serif, fontSize: 11, color: ui.onWoodMuted },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  label: { fontFamily: fonts.serif, fontSize: 15, color: ui.inkMuted },
  before: { fontFamily: fonts.body, fontSize: 22, color: ui.inkMuted },
  after: { fontFamily: fonts.body, fontSize: 26 },
});
