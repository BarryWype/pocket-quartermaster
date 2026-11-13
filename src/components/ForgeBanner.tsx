import { StyleSheet, View } from 'react-native';

import { PressScale } from '@/components/motion';

import { gearRules, rarityNames } from '@/content/gear';
import { gearName, itemById } from '@/content/lookup';
import type { ForgeResult } from '@/game/crafting/crafting';
import type { GearDef } from '@/game/types';
import { t, tr } from '@/i18n';
import { colors, pixel } from '@/theme';

import { GearDetails } from './GearDetails';
import { GearMarks } from './GearMarks';
import { IconLabel } from './IconLabel';
import { Text } from './Text';

/** The forged piece in its rarity colour, bigger for Legendary. */
export function ForgeBanner({ result, onClose }: { result: ForgeResult; onClose: () => void }) {
  const { rarity } = result.gear;
  const legendary = rarity === 'legendary';
  const color = gearRules.colors[rarity];
  return (
    <PressScale
      onPress={onClose}
      style={[styles.banner, (rarity === 'rare' || legendary) && { borderColor: color }, legendary && styles.legendary]}
    >
      <View style={styles.bannerTitleRow}>
        {legendary || rarity === 'rare' ? (
          <IconLabel
            emoji={legendary ? '🌟' : '✨'}
            label={gearName(result.gear)}
            size={24}
            labelStyle={[styles.bannerTitle, legendary && styles.legendaryTitle, { color }]}
          />
        ) : (
          <Text style={[styles.bannerTitle, { color }]}>{gearName(result.gear)}</Text>
        )}
        <GearMarks tier={(itemById[result.gear.itemId] as GearDef).tier} />
      </View>
      <Text style={{ color }}>{t('crafting.quality', { quality: tr(rarityNames[rarity]) })}</Text>
      <GearDetails gear={result.gear} labelStyle={styles.stats} />
    </PressScale>
  );
}

const styles = StyleSheet.create({
  banner: {
    gap: 2,
    padding: 12,
    marginBottom: 8,
    borderWidth: pixel.outline,
    borderColor: colors.ink,
    backgroundColor: colors.parchmentDark,
  },
  legendary: { borderWidth: 4, padding: 16, backgroundColor: colors.highlight },
  bannerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerTitle: { fontSize: 22 },
  legendaryTitle: { fontSize: 26 },
  stats: { fontSize: 16 },
});
