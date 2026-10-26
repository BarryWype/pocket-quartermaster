import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { elementInfo } from '@/content/elements';
import { heroClasses } from '@/content/heroes';
import { sanctumRules } from '@/content/sanctums';
import { oddsBand } from '@/game/expeditions/odds';
import { distanceMeters } from '@/game/generation/geo';
import type { LatLng } from '@/game/generation/types';
import {
  availableHeroes,
  challengeProblem,
  sanctumById,
  sanctumOdds,
  type ChallengeProblem,
  type SanctumResult,
  type SanctumSpawn,
} from '@/game/sanctums/sanctums';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';
import { TutorialHint } from './TutorialHint';

const LINE_DELAY_MS = 600;

const problemText: Record<ChallengeProblem, (distance: number) => string> = {
  used: () => 'You already challenged this Sanctum. It reopens when it refreshes.',
  expired: () => 'This Sanctum has faded. A new one appears soon.',
  noSigil: () => 'You need a Sanctum Sigil. Successful expeditions sometimes bring one back.',
  tooFar: (distance) => `Get within ${sanctumRules.interactionMeters} m to open it (${Math.round(distance)} m away).`,
  noHeroes: () => 'Pick at least one hero who is at home.',
  heroAway: () => 'Heroes on an expedition cannot fight here.',
};

type Props = {
  spawn: SanctumSpawn;
  player: LatLng;
  onClose: () => void;
};

export function SanctumPanel({ spawn, player, onClose }: Props) {
  const save = useGameStore((state) => state.save);
  const challenge = useGameStore((state) => state.challengeSanctum);
  const nextTutorialStep = useGameStore((state) => state.nextTutorialStep);
  const sanctum = sanctumById[spawn.sanctumId];
  const element = elementInfo[sanctum.element];
  const tiers = [...new Set(save.sigils)].sort((a, b) => a - b);
  const [tier, setTier] = useState<number | null>(tiers[0] ?? null);
  const [heroIds, setHeroIds] = useState(availableHeroes(save).map((h) => h.id));
  const [result, setResult] = useState<SanctumResult | null>(null);
  const [shown, setShown] = useState(0);
  const [openedAt] = useState(() => Date.now());

  const odds = useMemo(
    () => (tier && heroIds.length > 0 ? sanctumOdds(save, heroIds, sanctum, tier) : null),
    [save, heroIds, sanctum, tier],
  );

  useEffect(() => nextTutorialStep('findSanctum'), [nextTutorialStep]);

  // Reveal the fight one line at a time.
  useEffect(() => {
    if (!result || shown >= result.log.length) return;
    const timer = setTimeout(() => setShown((n) => n + 1), LINE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [result, shown]);

  const problem = challengeProblem(save, spawn, tier ?? 0, heroIds, player, openedAt);
  const distance = distanceMeters(player, spawn.position);
  const toggle = (heroId: string) =>
    setHeroIds((ids) => (ids.includes(heroId) ? ids.filter((id) => id !== heroId) : [...ids, heroId]));

  const start = () =>
    Alert.alert(
      `Challenge the ${sanctum.guardian.name}?`,
      'This is your only attempt: win or lose, the Sigil is spent and this Sanctum closes for you until it refreshes.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Challenge', style: 'destructive', onPress: () => tier && setResult(challenge(spawn, tier, heroIds, player)) },
      ],
    );

  const finished = result && shown >= result.log.length;
  const rewardText = result
    ? [
        result.reward.shards > 0 && `${result.reward.shards} ${element.name.toLowerCase()} shards`,
        result.reward.stones > 0 && `${result.reward.stones} ${element.name.toLowerCase()} stone`,
      ]
        .filter(Boolean)
        .join(' and ')
    : '';

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content}>
            <TutorialHint screen="sanctum" />
            <Text style={styles.title}>
              {sanctum.emoji} {sanctum.name}
            </Text>
            <Text style={styles.muted}>
              {element.emoji} {element.name} · {sanctum.description}
            </Text>
            <Text style={styles.subtitle}>Guardian: {sanctum.guardian.name}</Text>
            <Text style={styles.muted}>{sanctum.guardian.description}</Text>

            {!result && (
              <>
                <Text style={styles.subtitle}>Sigil</Text>
                <View style={styles.chips}>
                  {tiers.length === 0 && <Text style={styles.muted}>No Sigil held.</Text>}
                  {tiers.map((t) => (
                    <Pressable key={t} onPress={() => setTier(t)} style={[styles.chip, tier === t && styles.chipActive]}>
                      <Text>
                        Tier {t} ×{save.sigils.filter((s) => s === t).length}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.subtitle}>Heroes</Text>
                <View style={styles.chips}>
                  {availableHeroes(save).map((hero) => (
                    <Pressable
                      key={hero.id}
                      onPress={() => toggle(hero.id)}
                      style={[styles.chip, heroIds.includes(hero.id) && styles.chipActive]}
                    >
                      <Text>
                        {heroClasses[hero.classId].emoji} {hero.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {odds && (
                  <Text style={styles.odds}>
                    Estimated success: {Math.round(odds.success * 100)}% · {oddsBand(odds.success)}
                  </Text>
                )}
                <Text style={styles.warning}>
                  ⚠️ One attempt only. Win or lose, the Sigil is spent and this Sanctum closes for you until it refreshes.
                </Text>
                {problem && <Text style={styles.problem}>{problemText[problem](distance)}</Text>}
              </>
            )}

            {result && (
              <View style={styles.log}>
                {result.log.slice(0, shown).map((line, i) => (
                  <Text key={i} style={styles.logLine}>
                    {line}
                  </Text>
                ))}
                {finished && (
                  <Text style={[styles.outcome, { color: result.win ? colors.wood : colors.danger }]}>
                    {result.win ? 'Victory!' : 'Defeat.'} You gain {rewardText}.
                  </Text>
                )}
              </View>
            )}
          </ScrollView>
          <View style={styles.actions}>
            {!result && <Button title="Challenge" disabled={problem !== null} onPress={start} />}
            <Button title={result && !finished ? 'Skip' : 'Close'} onPress={() => (result && !finished ? setShown(result.log.length) : onClose())} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.parchment,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    maxHeight: '85%',
  },
  content: { gap: 6, paddingBottom: 12 },
  title: { fontSize: 22 },
  subtitle: { fontSize: 17, marginTop: 8 },
  muted: { color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 2, borderColor: colors.ink, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { backgroundColor: colors.highlight },
  odds: { fontSize: 17, marginTop: 8 },
  warning: { color: colors.danger, marginTop: 4 },
  problem: { color: colors.muted, fontStyle: 'italic' },
  log: { gap: 6, marginTop: 8 },
  logLine: { fontSize: 15 },
  outcome: { fontSize: 18, marginTop: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
