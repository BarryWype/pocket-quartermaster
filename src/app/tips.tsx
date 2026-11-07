import { Fragment } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Text';
import { Deferred, GhostScreen, ParchmentCard, WoodButton } from '@/components/ui';
import { tipText } from '@/game/reveal/reveal';
import { useLanguage } from '@/hooks/useLanguage';
import { t } from '@/i18n';
import { navigate } from '@/services/navigation';
import { useGameStore } from '@/store/gameStore';
import { fonts, ui } from '@/theme';
import { timed } from '@/components/timed';

/** Every tip already closed, in the order they came, to read again. */
function TipsScreen() {
  return (
    <Deferred name="tips" ghost={<GhostScreen variant="cards" />}>
      <TipsContent />
    </Deferred>
  );
}

function TipsContent() {
  useLanguage();
  const seen = useGameStore((state) => state.save.tips.seen);
  const reports = useGameStore((state) => state.save.reports);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <WoodButton title={t('families.all')} compact onPress={() => navigate('/families')} />
      <ParchmentCard style={styles.card}>
        {seen.length === 0 ? (
          <Text style={styles.empty}>{t('tips.empty')}</Text>
        ) : (
          seen.map((id, i) => (
            <Fragment key={id}>
              {i > 0 && <View style={styles.rule} />}
              <View style={styles.row}>
                <View style={styles.diamond} />
                <View style={styles.texts}>
                  <Text style={styles.kind}>{t(`tips.kind.${id}`)}</Text>
                  <Text style={styles.tip}>{tipText(id, reports)}</Text>
                </View>
              </View>
            </Fragment>
          ))
        )}
      </ParchmentCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.woodDark },
  container: { padding: 14, gap: 12 },
  card: { gap: 4 },
  empty: { fontFamily: fonts.serif, fontSize: 15, color: ui.ink },
  rule: { borderWidth: 2, borderStyle: 'dashed', borderColor: ui.parchmentRule },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8 },
  diamond: {
    width: 14,
    height: 14,
    marginTop: 5,
    transform: [{ rotate: '45deg' }],
    backgroundColor: ui.ember,
    borderWidth: 2,
    borderColor: ui.outline,
  },
  texts: { flexShrink: 1, gap: 2 },
  kind: { fontSize: 19, lineHeight: 21, color: ui.ink },
  tip: { fontFamily: fonts.serif, fontSize: 14, lineHeight: 19, color: ui.ink },
});

export default timed('screen: tips', TipsScreen);
