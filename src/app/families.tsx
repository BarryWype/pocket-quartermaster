import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { FamilySheet, familyRole } from '@/components/FamilySheet';
import { IconLabel } from '@/components/IconLabel';
import { Panel } from '@/components/Panel';
import { Row } from '@/components/Row';
import { Text } from '@/components/Text';
import { families, type FamilyDef, type FamilyId } from '@/content/families';
import { threatById } from '@/content/lookup';
import { rosterRules } from '@/content/roster';
import { bestPartyCounts, familyLevel } from '@/game/families/families';
import { levelMarks } from '@/game/families/strip';
import { useLanguage } from '@/hooks/useLanguage';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

/** All 15 families as a reference to scan: one row each, with the best current party's tags; a tap opens the family sheet. */
export default function FamiliesScreen() {
  useLanguage();
  const heroes = useGameStore((state) => state.save.heroes);
  const gear = useGameStore((state) => state.save.gear);
  const best = useMemo(() => (heroes.length > 0 ? bestPartyCounts({ heroes, gear }, rosterRules.partySize) : null), [heroes, gear]);
  const [open, setOpen] = useState<FamilyId | null>(null);

  const row = (family: FamilyDef) => {
    const count = best?.[family.id] ?? 0;
    const threat = family.answers ? threatById[family.answers] : null;
    const role = threat ? (
      <IconLabel emoji={threat.emoji} icon={threat.icon} label={familyRole(family.id)} size={16} labelStyle={styles.role} />
    ) : (
      <Text style={styles.role}>{familyRole(family.id)}</Text>
    );
    return (
      <Row
        key={family.id}
        emoji={family.emoji}
        icon={family.icon}
        title={tr(family.name)}
        subtitle={role}
        right={
          best && (
            <View style={styles.best} accessibilityLabel={`${t('families.best')}: ${count}`}>
              <Text style={[styles.count, count === 0 && styles.muted]}>{count}</Text>
              <Text style={[styles.marks, familyLevel(count) > 0 && styles.lit]}>{levelMarks(familyLevel(count))}</Text>
            </View>
          )
        }
        onPress={() => setOpen(family.id)}
      />
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.intro}>{t('families.intro')}</Text>
      <Panel style={styles.section}>
        <View style={styles.head}>
          <Text style={styles.title}>{t('families.threatSection')}</Text>
          {best && <Text style={styles.muted}>{t('families.best')}</Text>}
        </View>
        {families.filter((family) => family.kind === 'threat').map(row)}
      </Panel>
      <Panel style={styles.section}>
        <Text style={styles.title}>{t('families.playstyleSection')}</Text>
        {families.filter((family) => family.kind === 'playstyle').map(row)}
      </Panel>
      {open && <FamilySheet family={open} count={best ? (best[open] ?? 0) : undefined} link={false} onClose={() => setOpen(null)} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 10 },
  intro: { fontSize: 17 },
  section: { gap: 0 },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 21 },
  role: { fontSize: 15, color: colors.muted },
  best: { alignItems: 'flex-end' },
  count: { fontSize: 18 },
  marks: { fontSize: 13, color: colors.muted },
  lit: { color: colors.gold },
  muted: { color: colors.muted },
});
