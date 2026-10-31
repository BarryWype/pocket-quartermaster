import { Pressable, StyleSheet, View } from 'react-native';

import { masteryTypeNames, qualities } from '@/content/forging';
import { gearName, itemById } from '@/content/lookup';
import type { ForgeResult } from '@/game/crafting/crafting';
import { rollToScale } from '@/game/forging/roll';
import type { GearDef } from '@/game/types';
import { t, tr } from '@/i18n';
import { colors, pixel } from '@/theme';

import { GearMarks } from './GearMarks';
import { Text } from './Text';
import { IconLabel } from './IconLabel';

/** The forged piece in its quality colour, bigger for Legendary, and any mastery level-up. */
export function ForgeBanner({ result, onClose }: { result: ForgeResult; onClose: () => void }) {
  const { quality, roll } = result.gear;
  const legendary = quality === 'legendary';
  return (
    <Pressable
      onPress={onClose}
      style={[styles.banner, (quality === 'rare' || legendary) && { borderColor: qualities[quality].color }, legendary && styles.legendary]}
    >
      <View style={styles.bannerTitleRow}>
        {legendary || quality === 'rare' ? (
          <IconLabel
            emoji={legendary ? '🌟' : '✨'}
            label={gearName(result.gear)}
            size={24}
            labelStyle={[styles.bannerTitle, legendary && styles.legendaryTitle, { color: qualities[quality].color }]}
          />
        ) : (
          <Text style={[styles.bannerTitle, { color: qualities[quality].color }]}>{gearName(result.gear)}</Text>
        )}
        <GearMarks tier={(itemById[result.gear.itemId] as GearDef).tier} />
      </View>
      <Text>
        {t('crafting.quality', { quality: tr(qualities[quality].name) })}
        {roll !== undefined ? ` · ${t('gear.roll', { roll: rollToScale(roll), max: 7 })}` : ''}
        {result.levelUp ? t('crafting.levelUp', { type: tr(masteryTypeNames[result.type].name), level: result.mastery.level }) : ''}
      </Text>
    </Pressable>
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
});
