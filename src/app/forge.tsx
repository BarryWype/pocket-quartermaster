import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CraftingStation } from '@/components/CraftingStation';
import { InfuseStation } from '@/components/InfuseStation';
import { Text } from '@/components/Text';
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/i18n';
import { colors } from '@/theme';

const TABS = [
  { id: 'forge', label: () => t('crafting.forge') },
  { id: 'infuse', label: () => t('crafting.infuse') },
] as const;

export default function ForgeScreen() {
  useLanguage();
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('forge');

  return (
    <View style={styles.screen}>
      <View style={styles.tabs}>
        {TABS.map(({ id, label }) => (
          <Pressable key={id} onPress={() => setTab(id)} style={[styles.tab, tab === id && styles.tabActive]}>
            <Text style={[styles.tabLabel, tab === id && styles.tabLabelActive]}>{label()}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'forge' ? <CraftingStation station="forge" action={t('crafting.forge')} /> : <InfuseStation />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.woodDark,
  },
  tabActive: { backgroundColor: colors.wood },
  tabLabel: { fontSize: 16, color: colors.ink },
  tabLabelActive: { color: colors.parchment },
});
