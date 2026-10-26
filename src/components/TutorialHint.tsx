import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { isClosableHint, tutorialHint, type TutorialScreen } from '@/game/tutorial/tutorial';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

import { Text } from './Text';

type Props = {
  screen: TutorialScreen;
  style?: StyleProp<ViewStyle>;
};

/** The tutorial's one-line hint for this screen, if the current step has one. */
export function TutorialHint({ screen, style }: Props) {
  const hint = useGameStore((state) => tutorialHint(state.save, screen));
  const step = useGameStore((state) => state.save.tutorial.step);
  const closable = useGameStore((state) => isClosableHint(state.save));
  const nextTutorialStep = useGameStore((state) => state.nextTutorialStep);
  if (!hint) return null;

  return (
    <Pressable
      accessibilityRole={closable ? 'button' : 'text'}
      disabled={!closable}
      onPress={() => nextTutorialStep(step)}
      style={[styles.hint, style]}
    >
      <Text style={styles.icon}>🧭</Text>
      <Text style={styles.text}>{hint}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.woodDark,
    backgroundColor: colors.wood,
  },
  icon: { fontSize: 20 },
  text: { flex: 1, color: colors.parchment, fontSize: 16 },
});
