import { Alert, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { isClosableHint, tutorialHint, type TutorialScreen } from '@/game/tutorial/tutorial';
import { t } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors, pixel } from '@/theme';

import { Text } from './Text';

type Props = {
  screen: TutorialScreen;
  style?: StyleProp<ViewStyle>;
  /** Replaces the step's line, e.g. while location is off. */
  text?: string;
};

/** The tutorial's one-line hint for this screen, if the current step has one, with a way to skip the rest. */
export function TutorialHint({ screen, style, text }: Props) {
  const hint = useGameStore((state) => tutorialHint(state.save, screen));
  const step = useGameStore((state) => state.save.tutorial.step);
  const closable = useGameStore((state) => isClosableHint(state.save));
  const nextTutorialStep = useGameStore((state) => state.nextTutorialStep);
  const skipTutorial = useGameStore((state) => state.skipTutorial);
  const line = text ?? hint;
  if (!line || step === 'done') return null;

  const confirmSkip = () =>
    Alert.alert(t('tutorial.skipConfirmTitle'), t('tutorial.skipConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('tutorial.skipConfirmOk'), onPress: skipTutorial },
    ]);

  return (
    <Pressable
      accessibilityRole={closable ? 'button' : 'text'}
      disabled={!closable}
      onPress={() => nextTutorialStep(step)}
      style={[styles.hint, style]}
    >
      <View style={styles.row}>
        <Text style={styles.icon}>🧭</Text>
        <Text style={styles.text}>{line}</Text>
      </View>
      <Pressable accessibilityRole="button" onPress={confirmSkip} hitSlop={8} style={styles.skip}>
        <Text style={styles.skipText}>{t('tutorial.skip')}</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hint: {
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: pixel.outline,
    borderColor: colors.ink,
    backgroundColor: colors.wood,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { fontSize: 20 },
  text: { flex: 1, color: colors.parchment, fontSize: 20 },
  skip: { alignSelf: 'flex-end' },
  skipText: { color: colors.parchment, fontSize: 16, opacity: 0.8, textDecorationLine: 'underline' },
});
