import { ScrollView, StyleSheet } from 'react-native';

import { Text } from '@/components/Text';
import { tipText } from '@/game/reveal/reveal';
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';
import { IconLabel } from '@/components/IconLabel';

/** Every tip already closed, in the order they came, to read again. */
export default function TipsScreen() {
  useLanguage();
  const seen = useGameStore((state) => state.save.tips.seen);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {seen.length === 0 && <Text style={styles.empty}>{t('tips.empty')}</Text>}
      {seen.map((id) => (
        <IconLabel key={id} emoji="💡" label={tipText(id)} labelStyle={styles.tip} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, padding: 24 },
  empty: { fontSize: 19, color: colors.muted },
  tip: { fontSize: 20 },
});
