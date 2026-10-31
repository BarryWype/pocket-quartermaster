import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { elementInfo } from '@/content/elements';
import { sanctumGuardian } from '@/content/enemies';
import { heroClasses } from '@/content/heroes';
import { sanctumRules } from '@/content/sanctums';
import { oddsBand, type Odds } from '@/game/expeditions/odds';
import { fightOddsKey, cachedOdds, storeOdds } from '@/game/expeditions/oddsCache';
import { recordTiming } from '@/services/timings';
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
import { formatPercent, t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors, pixel } from '@/theme';

import { Button } from './Button';
import { EnemyTags } from './EnemyTags';
import { Overlay } from './Overlay';
import { Text } from './Text';

const LINE_DELAY_MS = 600;

const problemText: Record<ChallengeProblem, (distance: number) => string> = {
  used: () => t('sanctum.used'),
  expired: () => t('sanctum.expired'),
  noSigil: () => t('sanctum.noSigil'),
  tooFar: (distance) =>
    t('common.tooFar', { radius: sanctumRules.interactionMeters, action: t('sanctum.open'), distance: Math.round(distance) }),
  noHeroes: () => t('sanctum.noHeroes'),
  heroAway: () => t('sanctum.heroAway'),
};

type Props = {
  spawn: SanctumSpawn;
  player: LatLng;
  onClose: () => void;
};

export function SanctumPanel({ spawn, player, onClose }: Props) {
  const save = useGameStore((state) => state.save);
  const challenge = useGameStore((state) => state.challengeSanctum);
  const sanctum = sanctumById[spawn.sanctumId];
  const element = elementInfo[sanctum.element];
  const tiers = [...new Set(save.sigils)].sort((a, b) => a - b);
  const [tier, setTier] = useState<number | null>(tiers[0] ?? null);
  const [heroIds, setHeroIds] = useState(availableHeroes(save).map((h) => h.id));
  const [result, setResult] = useState<SanctumResult | null>(null);
  const [shown, setShown] = useState(0);
  const [openedAt] = useState(() => Date.now());

  // The odds are computed off the first frame (issue 12's approach): the panel
  // opens at once, shows "…" until they land, and odds already held for exactly
  // these inputs (same sanctum, tier, party, minute) show immediately.
  const oddsKey = useMemo(
    () => (tier && heroIds.length > 0 ? fightOddsKey(save, heroIds, { id: sanctum.id, kind: `sanctum:${sanctum.id}` }, tier, false, openedAt) : null),
    [save, heroIds, sanctum, tier, openedAt],
  );
  const [computed, setComputed] = useState<{ key: string; odds: Odds } | null>(() => {
    if (oddsKey === null) return null;
    const held = cachedOdds(oddsKey);
    return held ? { key: oddsKey, odds: held } : null;
  });
  useEffect(() => {
    if (oddsKey === null || computed?.key === oddsKey) return;
    const timer = setTimeout(() => {
      const odds = recordTiming('odds: sanctum', () => sanctumOdds(save, heroIds, sanctum, tier!, undefined, openedAt));
      storeOdds(oddsKey, odds);
      setComputed({ key: oddsKey, odds });
    });
    return () => clearTimeout(timer);
    // The key covers the save, the sanctum, the tier, the party and the minute: rerun only when it moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oddsKey, computed?.key]);
  const odds = computed?.key === oddsKey ? computed.odds : (oddsKey !== null ? (cachedOdds(oddsKey) ?? null) : null);

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
      t('sanctum.confirmTitle', { guardian: tr(sanctum.guardian.name) }),
      t('sanctum.confirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('sanctum.challenge'), style: 'destructive', onPress: () => tier && setResult(challenge(spawn, tier, heroIds, player)) },
      ],
    );

  const finished = result && shown >= result.log.length;
  const rewardText = result
    ? [
        result.reward.shards > 0 && t('sanctum.shards', { count: result.reward.shards, element: tr(element.name).toLowerCase() }),
        result.reward.stones > 0 && t('sanctum.stones', { count: result.reward.stones, element: tr(element.name).toLowerCase() }),
      ]
        .filter(Boolean)
        .join(t('common.and'))
    : '';

  return (
    <Overlay onClose={onClose} position="bottom">
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>
              {sanctum.emoji} {tr(sanctum.name)}
            </Text>
            <Text style={styles.muted}>
              {element.emoji} {tr(element.name)} · {tr(sanctum.description)}
            </Text>
            <Text style={styles.subtitle}>{t('sanctum.guardian', { name: tr(sanctum.guardian.name) })}</Text>
            <EnemyTags mob={sanctumGuardian(sanctum, tier ?? 1)} named={false} />
            <Text style={styles.muted}>{tr(sanctum.guardian.description)}</Text>

            {!result && (
              <>
                <Text style={styles.subtitle}>{t('sanctum.sigil')}</Text>
                <View style={styles.chips}>
                  {tiers.length === 0 && <Text style={styles.muted}>{t('sanctum.noSigilHeld')}</Text>}
                  {tiers.map((sigilTier) => (
                    <Pressable
                      key={sigilTier}
                      onPress={() => setTier(sigilTier)}
                      style={[styles.chip, tier === sigilTier && styles.chipActive]}
                    >
                      <Text>{t('sanctum.tier', { tier: sigilTier, count: save.sigils.filter((s) => s === sigilTier).length })}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.subtitle}>{t('sanctum.heroes')}</Text>
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
                {heroIds.length > 0 &&
                  (odds ? (
                    <Text style={styles.odds}>
                      {t('sanctum.estimate', { percent: formatPercent(odds.success), band: t(`odds.${oddsBand(odds.success)}`) })}
                    </Text>
                  ) : (
                    <Text style={styles.odds}>…</Text>
                  ))}
                <Text style={styles.warning}>{t('sanctum.warning')}</Text>
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
                    {t(result.win ? 'sanctum.victory' : 'sanctum.defeat', { reward: rewardText })}
                  </Text>
                )}
              </View>
            )}
          </ScrollView>
          <View style={styles.actions}>
            {!result && <Button title={t('sanctum.challenge')} disabled={problem !== null} onPress={start} />}
            <Button
              title={result && !finished ? t('sanctum.skip') : t('common.close')}
              onPress={() => (result && !finished ? setShown(result.log.length) : onClose())} />
          </View>
        </View>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.parchment,
    borderTopWidth: pixel.outline + 1,
    borderColor: colors.ink,
    padding: 16,
    maxHeight: '85%',
  },
  content: { gap: 6, paddingBottom: 12 },
  title: { fontSize: 26 },
  subtitle: { fontSize: 21, marginTop: 8 },
  muted: { color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: pixel.outline, borderColor: colors.woodDark, paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { borderColor: colors.ink, backgroundColor: colors.highlight },
  odds: { fontSize: 21, marginTop: 8 },
  warning: { color: colors.danger, marginTop: 4 },
  problem: { color: colors.muted, fontStyle: 'italic' },
  log: { gap: 6, marginTop: 8 },
  logLine: { fontSize: 19 },
  outcome: { fontSize: 22, marginTop: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
