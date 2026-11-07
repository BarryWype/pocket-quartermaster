import { ScrollView, StyleSheet, View } from 'react-native';

import { FamilyLevelLines } from '@/components/FamilyTag';
import { Panel } from '@/components/Panel';
import { IconSlot } from '@/components/Row';
import { Text } from '@/components/Text';
import { gearProfiles, gearTypeNames } from '@/content/equipment';
import { families } from '@/content/families';
import { heroClasses } from '@/content/heroes';
import { threatById } from '@/content/lookup';
import { relics } from '@/content/loot/relics';
import type { GearType, HeroClassId } from '@/game/types';
import { useLanguage } from '@/hooks/useLanguage';
import { t, tr, type TextKey } from '@/i18n';
import { colors } from '@/theme';

const classIds = Object.keys(heroClasses) as HeroClassId[];
const gearTypes = Object.keys(gearProfiles) as GearType[];

/** All 15 families: what each answers, its three levels, and the classes, gear types and relics that carry its tag. */
export default function FamiliesScreen() {
  useLanguage();
  const names = (list: string[]) => list.join(', ');
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.intro}>{t('families.intro')}</Text>
      {families.map((family) => {
        const classes = classIds.filter((id) => heroClasses[id].familyTag === family.id).map((id) => tr(heroClasses[id].name));
        const gear = gearTypes
          .filter((type) => gearProfiles[type].familyTag === family.id)
          .map((type) =>
            gearProfiles[type].twoHanded ? `${tr(gearTypeNames[type].name)} ×2` : tr(gearTypeNames[type].name),
          );
        const extras = relics.filter((relic) => relic.extraFamily === family.id).map((relic) => tr(relic.name));
        return (
          <Panel key={family.id} style={styles.card}>
            <View style={styles.head}>
              <IconSlot emoji={family.emoji} icon={family.icon} size={32} />
              <View style={styles.body}>
                <Text style={styles.name}>{tr(family.name)}</Text>
                <Text style={styles.muted}>
                  {family.answers ? t('families.kind.threat', { threat: tr(threatById[family.answers].name) }) : t(`families.role.${family.id}` as TextKey)}
                </Text>
              </View>
            </View>
            <FamilyLevelLines family={family.id} />
            <Text style={styles.carriers}>{`${t('families.classes')}: ${names(classes)}`}</Text>
            <Text style={styles.carriers}>{`${t('families.items')}: ${names(gear)}`}</Text>
            {extras.length > 0 && <Text style={styles.carriers}>{`${t('families.relics')}: ${names(extras)}`}</Text>}
          </Panel>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  intro: { fontSize: 17 },
  card: { gap: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  body: { flex: 1 },
  name: { fontSize: 21 },
  muted: { color: colors.muted },
  carriers: { fontSize: 16, color: colors.muted },
});
