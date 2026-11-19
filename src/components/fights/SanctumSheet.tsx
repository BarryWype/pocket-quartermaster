import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { elementInfo } from '@/content/elements';
import { sanctumGuardian } from '@/content/enemies';
import { rosterRules } from '@/content/roster';
import { sanctumRules } from '@/content/sanctums';
import { shardId, stoneId } from '@/game/elements';
import { fightOddsKey } from '@/game/expeditions/oddsCache';
import { distanceMeters } from '@/game/generation/geo';
import type { LatLng } from '@/game/generation/types';
import { lootTiles } from '@/game/loot/tiles';
import { emptyLoot } from '@/game/loot/types';
import { mainAction } from '@/game/places/mainAction';
import { challengeProblem, sanctumById, sanctumOdds, type ChallengeProblem, type SanctumResult, type SanctumSpawn } from '@/game/sanctums/sanctums';
import type { SaveData } from '@/game/save';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { fonts, ui } from '@/theme';

import { EnemyTags } from '../EnemyTags';
import { IconLabel } from '../IconLabel';
import { LootGrid } from '../LootGrid';
import { MapSheet, mapSheetStatus, type MapSheetAction } from '../MapSheet';
import { PressScale } from '../motion';
import { PartyDialog } from '../PartyDialog';
import { Text } from '../Text';
import { TrophyLine } from '../TrophyLine';
import { asRecalled, includesWorking, recallWorkingHeroes } from '../workingHeroes';
import { fightBlocked, walkToward } from './fightBits';
import { DropTiles } from './FightSummary';

const LINE_DELAY_MS = 600;
/** A Sanctum's guardian brings no threats to answer: the dialog shows only the party's families. */
const NO_THREATS = { threats: [], restriction: null, opportunity: null };

const problemText: Record<ChallengeProblem, () => string> = {
  used: () => t('sanctum.used'),
  expired: () => t('sanctum.expired'),
  noSigil: () => t('sanctum.noSigil'),
  tooFar: () => t('fightSheet.blocked.tooFar'),
  noHeroes: () => t('sanctum.noHeroes'),
  heroAway: () => t('sanctum.heroAway'),
};

type Props = { spawn: SanctumSpawn; player: LatLng; now: number; onClose: () => void };

/**
 * A Sanctum on the map sheet template: the guardian, its element and drops in
 * the peek; the sigil to spend in the first tab; Challenge picks the party.
 * The fight plays out line by line in the sheet, as before.
 */
export function SanctumSheet({ spawn, player, now, onClose }: Props) {
  const save = useGameStore((state) => state.save);
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
  const own = problemOf(save, []);
  const distance = distanceMeters(player, spawn.position);
  const range = sanctumRules.interactionMeters;
  const finished = !!result && shown >= result.log.length;

  const start = (heroIds: string[]) =>
    Alert.alert(t('sanctum.confirmTitle', { guardian: tr(sanctum.guardian.name) }), t('sanctum.confirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: includesWorking(save, heroIds) ? t('jobs.recallAndSend') : t('sanctum.challenge'),
        style: 'destructive',
        onPress: () => {
          if (!tier) return;
          // The pure challenge rule refuses working heroes: recall them first, in the same tap.
          recallWorkingHeroes(heroIds);
          setPicking(false);
          setResult(useGameStore.getState().challengeSanctum(spawn, tier, heroIds, player));
        },
      },
    ]);

  const challengeState = mainAction({ player, target: spawn.position, range, problem: own === 'noHeroes' ? null : own });
  const action: MapSheetAction = result
    ? finished
      ? { state: { kind: 'act' }, verb: '', label: t('fightSheet.done'), onPress: onClose }
      : { state: { kind: 'act' }, verb: '', label: t('sanctum.skip'), onPress: () => setShown(result.log.length) }
    : {
        state: challengeState,
        verb: t('mapSheet.verbs.challenge'),
        label: t('sanctum.challenge'),
        blockedLabel: challengeState.kind === 'blocked' ? fightBlocked(challengeState.reason) : undefined,
        onPress: () => setPicking(true),
        onWalk: walkToward(spawn.position),
      };

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

  const summary = (
    <View style={styles.summary}>
      <View style={styles.row}>
        <IconLabel emoji={element.emoji} label={tr(element.name)} labelStyle={styles.line} />
        <Text style={styles.line}>· {t('sanctum.guardian', { name: tr(sanctum.guardian.name) })}</Text>
      </View>
      {!result && <DropTiles source="sanctum" />}
      {result && (
        <View style={styles.log}>
          {result.log.slice(0, shown).map((line, i) => (
            <Text key={i} style={styles.logLine}>
              {line}
            </Text>
          ))}
          {finished && (
            <>
              <Text style={styles.outcome}>{t(result.win ? 'sanctum.victory' : 'sanctum.defeat')}</Text>
              {tiles.length > 0 && <LootGrid tiles={tiles} reveal />}
            </>
          )}
        </View>
      )}
    </View>
  );

  return (
    <>
      <MapSheet
        onClose={onClose}
        emoji={sanctum.emoji}
        ring={{ kind: 'difficulty', difficulty: 'hard' }}
        title={tr(sanctum.name)}
        status={mapSheetStatus({ distance, range, expiresAt: spawn.expiresAt, now })}
        summary={summary}
        action={action}
        tabs={
          result
            ? undefined
            : [
                {
                  key: 'sigil',
                  label: t('fightSheet.tabs.sigil'),
                  render: () => (
                    <View style={styles.list}>
                      {tiers.length === 0 && <Text style={styles.muted}>{t('sanctum.noSigilHeld')}</Text>}
                      <View style={styles.chips}>
                        {tiers.map((sigilTier) => {
                          const on = tier === sigilTier;
                          return (
                            <PressScale
                              key={sigilTier}
                              accessibilityRole="radio"
                              accessibilityState={{ selected: on }}
                              onPress={() => setTier(sigilTier)}
                              style={[styles.chip, on && styles.chipOn]}
                            >
                              <Text style={on ? styles.chipTextOn : undefined}>
                                {on ? '▸ ' : ''}
                                {t('sanctum.tier', { tier: sigilTier, count: save.sigils.filter((s) => s === sigilTier).length })}
                              </Text>
                            </PressScale>
                          );
                        })}
                      </View>
                      <IconLabel emoji="⚠️" label={t('sanctum.warning')} labelStyle={styles.warning} />
                    </View>
                  ),
                },
                {
                  key: 'guardian',
                  label: t('fightSheet.tabs.guardian'),
                  render: () => (
                    <View style={styles.list}>
                      <EnemyTags mob={sanctumGuardian(sanctum, tier ?? 1)} named={false} />
                      <Text style={styles.muted}>{tr(sanctum.guardian.description)}</Text>
                      <Text style={styles.muted}>{tr(sanctum.description)}</Text>
                      <TrophyLine source="sanctum" />
                    </View>
                  ),
                },
              ]
        }
        inRange={distance <= range}
      />
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
          problem={(current, heroIds) => {
            const found = heroIds.length > 0 ? problemOf(current, heroIds) : null;
            return found ? problemText[found]() : null;
          }}
          onSend={start}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  summary: { gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  line: { fontSize: 19, color: ui.ink },
  list: { gap: 8 },
  muted: { color: ui.inkMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, justifyContent: 'center', borderWidth: 2, borderColor: ui.parchmentRule, paddingHorizontal: 12 },
  chipOn: { borderColor: ui.ink, borderLeftWidth: 6, backgroundColor: ui.parchmentShade },
  chipTextOn: { fontFamily: fonts.serifBold },
  warning: { color: ui.bad },
  log: { gap: 6, marginTop: 4 },
  logLine: { fontSize: 17 },
  outcome: { fontSize: 22, marginTop: 6, fontFamily: fonts.serifBold },
});
