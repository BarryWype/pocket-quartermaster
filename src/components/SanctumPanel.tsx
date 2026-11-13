import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { PressScale } from '@/components/motion';

import { elementInfo } from '@/content/elements';
import { sanctumGuardian } from '@/content/enemies';
import { rosterRules } from '@/content/roster';
import { sanctumRules } from '@/content/sanctums';
import { shardId, stoneId } from '@/game/elements';
import { fightOddsKey } from '@/game/expeditions/oddsCache';
import { lootTiles } from '@/game/loot/tiles';
import { emptyLoot } from '@/game/loot/types';
import type { SaveData } from '@/game/save';
import { distanceMeters } from '@/game/generation/geo';
import type { LatLng } from '@/game/generation/types';
import {
  challengeProblem,
  sanctumById,
  sanctumOdds,
  type ChallengeProblem,
  type SanctumResult,
  type SanctumSpawn,
} from '@/game/sanctums/sanctums';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors, pixel, ui } from '@/theme';

import { EnemyTags } from './EnemyTags';
import { DifficultyChip, EmberButton, WoodButton } from './ui';
import { Overlay } from './Overlay';
import { PartyDialog } from './PartyDialog';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { IconLabel } from './IconLabel';
import { LootGrid } from './LootGrid';
import { asRecalled, includesWorking, recallWorkingHeroes } from './workingHeroes';
import { TrophyLine } from './TrophyLine';

const LINE_DELAY_MS = 600;
/** A Sanctum's guardian brings no threats to answer: the dialog shows only the party's families. */
const NO_THREATS = { threats: [], restriction: null, opportunity: null };

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
  const [picking, setPicking] = useState(false);
  const [result, setResult] = useState<SanctumResult | null>(null);
  const [shown, setShown] = useState(0);
  const [openedAt] = useState(() => Date.now());
  const oddsOf = useCallback(
    (dressed: SaveData, heroIds: string[]) => ({
      key: fightOddsKey(dressed, heroIds, { id: sanctum.id, kind: `sanctum:${sanctum.id}` }, tier ?? 1, false, openedAt),
      run: () => sanctumOdds(dressed, heroIds, sanctum, tier ?? 1, undefined, openedAt),
    }),
    [sanctum, tier, openedAt],
  );

  // Reveal the fight one line at a time.
  useEffect(() => {
    if (!result || shown >= result.log.length) return;
    const timer = setTimeout(() => setShown((n) => n + 1), LINE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [result, shown]);

  // Working heroes are recalled on challenge, so the problem sees them as free.
  const problemOf = (state: SaveData, heroIds: string[]) => challengeProblem(asRecalled(state, heroIds), spawn, tier ?? 0, heroIds, player, openedAt);
  // Before a party is picked, only the Sanctum's own problems count (used, sigil, distance).
  const problem = problemOf(save, []);
  const placeProblem = problem === 'noHeroes' ? null : problem;
  const distance = distanceMeters(player, spawn.position);
  const far = distance > sanctumRules.interactionMeters;

  const start = (heroIds: string[]) =>
    Alert.alert(
      t('sanctum.confirmTitle', { guardian: tr(sanctum.guardian.name) }),
      t('sanctum.confirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: includesWorking(save, heroIds) ? t('jobs.recallAndSend') : t('sanctum.challenge'),
          style: 'destructive',
          onPress: () => {
            if (!tier) return;
            // The pure challenge rule refuses working heroes: recall them first, in the same tap.
            recallWorkingHeroes(heroIds);
            setPicking(false);
            setResult(challenge(spawn, tier, heroIds, player));
          },
        },
      ],
    );

  const finished = result && shown >= result.log.length;
  const tiles = result
    ? lootTiles({
        ...emptyLoot(),
        xp: result.reward.xp,
        materials: [
          { materialId: shardId(result.reward.element), amount: result.reward.shards },
          { materialId: stoneId(result.reward.element), amount: result.reward.stones },
        ],
      })
    : [];

  return (
    <Overlay onClose={onClose} position="bottom">
      <Sheet
        variant="wood"
        emoji={sanctum.emoji}
        title={tr(sanctum.name)}
        bodyStyle={styles.content}
        footer={
          <View style={styles.actions}>
            {!result && (
              <EmberButton title={t('sanctum.challenge')} disabled={placeProblem !== null} onPress={() => setPicking(true)} />
            )}
            <WoodButton
              title={result && !finished ? t('sanctum.skip') : t('common.close')}
              onPress={() => (result && !finished ? setShown(result.log.length) : onClose())}
            />
          </View>
        }
      >
        <DifficultyChip difficulty="hard" />
        {!far && (
          <>
          <View style={styles.elementRow}>
            <IconLabel emoji={element.emoji} label={tr(element.name)} labelStyle={styles.muted} />
            <Text style={styles.muted}> · {tr(sanctum.description)}</Text>
          </View>
          <Text style={styles.subtitle}>{t('sanctum.guardian', { name: tr(sanctum.guardian.name) })}</Text>
          <EnemyTags mob={sanctumGuardian(sanctum, tier ?? 1)} named={false} />
          <Text style={styles.muted}>{tr(sanctum.guardian.description)}</Text>
          <TrophyLine source="sanctum" />
          </>
        )}

        {!result && (
          <>
            {!far && (
              <>
              <Text style={styles.subtitle}>{t('sanctum.sigil')}</Text>
              <View style={styles.chips}>
                {tiers.length === 0 && <Text style={styles.muted}>{t('sanctum.noSigilHeld')}</Text>}
                {tiers.map((sigilTier) => (
                  <PressScale
                    key={sigilTier}
                    onPress={() => setTier(sigilTier)}
                    style={[styles.chip, tier === sigilTier && styles.chipActive]}
                  >
                    <Text>{t('sanctum.tier', { tier: sigilTier, count: save.sigils.filter((s) => s === sigilTier).length })}</Text>
                  </PressScale>
                ))}
              </View>
              </>
            )}
            <Text style={styles.warning}>{t('sanctum.warning')}</Text>
            {placeProblem && <Text style={styles.problem}>{problemText[placeProblem](distance)}</Text>}
            {far && <Text style={styles.muted}>{t('places.tooFarToSee')}</Text>}
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
              <>
                <Text style={[styles.outcome, { color: result.win ? colors.wood : colors.danger }]}>
                  {t(result.win ? 'sanctum.victory' : 'sanctum.defeat')}
                </Text>
                {tiles.length > 0 && <LootGrid tiles={tiles} reveal labelColor={ui.onWood} />}
              </>
            )}
          </View>
        )}
      </Sheet>
      {picking && (
        <PartyDialog
          title={tr(sanctum.name)}
          subtitle={`${tr(element.name)} · ${t('sanctum.guardian', { name: tr(sanctum.guardian.name) })}`}
          slots={rosterRules.partySize}
          draftKey={`sanctum:${spawn.id}`}
          briefing={NO_THREATS}
          oddsOf={oddsOf}
          now={openedAt}
          sendLabel={t('sanctum.challenge')}
          problem={(state, heroIds) => {
            const found = heroIds.length > 0 ? problemOf(state, heroIds) : null;
            return found ? problemText[found](distance) : null;
          }}
          onSend={start}
          onClose={() => setPicking(false)}
        />
      )}
    </Overlay>
  );
}

const styles = StyleSheet.create({
  elementRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  content: { gap: 6, paddingBottom: 12 },
  subtitle: { fontSize: 21, marginTop: 8 },
  muted: { color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: pixel.outline, borderColor: colors.woodDark, paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { borderColor: colors.ink, backgroundColor: colors.highlight },
  warning: { color: colors.danger, marginTop: 4 },
  problem: { color: colors.muted, fontStyle: 'italic' },
  log: { gap: 6, marginTop: 8 },
  logLine: { fontSize: 19 },
  outcome: { fontSize: 22, marginTop: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
