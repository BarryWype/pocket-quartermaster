import { StyleSheet, View } from 'react-native';

import { signatureText } from '@/content/abilities';
import { classAffinities, type Affinity } from '@/content/equipment';
import { masteryTypeNames } from '@/content/forging';
import { heroClasses } from '@/content/heroes';
import type { ArmourType, HeroClassId, WeaponType } from '@/game/types';
import { t, tr } from '@/i18n';
import { colors } from '@/theme';

import { Text } from './Text';

/** The weapon and armour types a class has at this affinity, by name. */
const typesAt = (classId: HeroClassId, affinity: Affinity) =>
  (Object.entries(classAffinities[classId]) as [WeaponType | ArmourType, Affinity][])
    .filter(([, a]) => a === affinity)
    .map(([type]) => tr(masteryTypeNames[type].name).toLowerCase())
    .join(', ');

/** A class at a glance: family (and rarity when rare), signature in one line, favoured ▲ and unfit ▼ types. */
export function ClassSummary({ classId, affinities = true, light = false }: { classId: HeroClassId; affinities?: boolean; light?: boolean }) {
  const def = heroClasses[classId];
  const unfit = typesAt(classId, 'unfit');
  return (
    <View style={styles.summary}>
      <Text style={[styles.family, light && styles.light]}>
        {t(`classes.family.${def.family}`)}
        {def.rarity === 'rare' ? ` · ✦ ${t('classes.rare')}` : ''}
      </Text>
      <Text style={[styles.signature, light && styles.light]}>{signatureText(classId)}</Text>
      {affinities && (
        <Text style={styles.affinities}>
          <Text style={styles.favoured}>{t('classes.favoured', { types: typesAt(classId, 'favoured') })}</Text>
          {unfit ? <Text style={styles.unfit}>{`  ${t('classes.unfit', { types: unfit })}`}</Text> : null}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { gap: 2 },
  family: { fontSize: 15, color: colors.muted, textTransform: 'uppercase' },
  signature: { fontSize: 17 },
  light: { color: colors.parchment },
  affinities: { fontSize: 15 },
  favoured: { color: colors.success },
  unfit: { color: colors.danger },
});
