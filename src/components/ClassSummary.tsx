import { StyleSheet, View } from 'react-native';

import { signatureText } from '@/content/abilities';
import { classAffinities, type Affinity } from '@/content/equipment';
import { gearTypeNames } from '@/content/equipment';
import { heroClasses } from '@/content/heroes';
import type { ArmourType, HeroClassId, WeaponType } from '@/game/types';
import { t, tr } from '@/i18n';
import { colors } from '@/theme';

import { FamilyTag } from './FamilyTag';
import { Text } from './Text';

/** The weapon, armour and helmet types a class has at this affinity, by name. */
const typesAt = (classId: HeroClassId, affinity: Affinity) =>
  (Object.entries(classAffinities[classId]) as [WeaponType | ArmourType, Affinity][])
    .filter(([, a]) => a === affinity)
    .map(([type]) => tr(gearTypeNames[type].name).toLowerCase())
    .join(', ');

/** A class at a glance: role (and rarity when rare), team family, signature in one line, favoured ▲ and unfit ▼ types. */
export function ClassSummary({
  classId,
  affinities = true,
  light = false,
  familyTag = true,
}: {
  classId: HeroClassId;
  affinities?: boolean;
  light?: boolean;
  /** The class's team family beside its role; off where the hero card already shows it. */
  familyTag?: boolean;
}) {
  const def = heroClasses[classId];
  const unfit = typesAt(classId, 'unfit');
  return (
    <View style={styles.summary}>
      <View style={styles.head}>
        <Text style={[styles.family, light && styles.light]}>
          {t(`classes.family.${def.family}`)}
          {def.rarity === 'rare' ? ` · ✦ ${t('classes.rare')}` : ''}
        </Text>
        {familyTag && <FamilyTag family={def.familyTag} labelStyle={light ? styles.light : undefined} />}
      </View>
      <Text style={[styles.signature, light && styles.light]}>{signatureText(classId)}</Text>
      {affinities && (
        <View>
          <Text style={[styles.affinities, styles.favoured]}>{t('classes.favoured', { types: typesAt(classId, 'favoured') })}</Text>
          {unfit ? <Text style={[styles.affinities, styles.unfit]}>{t('classes.unfit', { types: unfit })}</Text> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { gap: 2 },
  head: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  family: { fontSize: 15, color: colors.muted, textTransform: 'uppercase' },
  signature: { fontSize: 17 },
  light: { color: colors.parchment },
  affinities: { fontSize: 15 },
  favoured: { color: colors.success },
  unfit: { color: colors.danger },
});
