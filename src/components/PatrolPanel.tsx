import { useCallback, useMemo, useState } from 'react';
import { rosterRules } from '@/content/roster';
import { StyleSheet, View } from 'react-native';

import { frPatrolTexts } from '@/content/fr/patrols';
import { patrolFights, patrolRules, patrolTexts } from '@/content/patrols';
import { patrolThreat } from '@/content/threats';
import { tagInfo } from '@/content/rotation';
import { isElitePatrolKind } from '@/content/enemies';
import { fightOddsKey } from '@/game/expeditions/oddsCache';
import type { SaveData } from '@/game/save';
import { dungeonTags } from '@/game/dungeons/tags';
import { dungeonFoes } from '@/game/enemies/tags';

import type { LatLng } from '@/game/generation/types';
import { isPatrolKind, type PatrolSpawn } from '@/game/patrols/generate';
import { patrolDungeon, patrolFightProblem, patrolOdds, type PatrolFightProblem } from '@/game/patrols/fight';
import { distanceTo } from '@/game/patrols/visibility';
import { formatDuration, localized, t, tr } from '@/i18n';
import { syncBackground } from '@/hooks/useAutoGather';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';
import { colors } from '@/theme';

import { EnemyTags } from './EnemyTags';
import { DifficultyChip, EmberButton, WoodButton } from './ui';
import { Overlay } from './Overlay';
import { PartyDialog } from './PartyDialog';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { ThreatChip } from './ThreatChip';
import { PartsLine } from './IconLabel';
import { asRecalled, recallWorkingHeroes } from './workingHeroes';

const problemText: Record<Exclude<PatrolFightProblem, null>, (distance: number) => string> = {
  tooFar: (distance) => t('patrols.walkCloser', { distance: Math.round(distance) }),
  gone: () => t('patrols.gone'),
  away: () => t('sanctum.heroAway'),
  exhausted: () => t('patrols.exhausted'),
  partySize: () => t('patrols.partyMax'),
  empty: () => t('sanctum.noHeroes'),
};

type Props = {
  spawn: PatrolSpawn;
  player: LatLng;
  now: number;
  onClose: () => void;
};

/** The patrol engage sheet: what it is, what it pays, and the heroes to send at it. */
export function PatrolPanel({ spawn, player, now, onClose }: Props) {
  const save = useGameStore((state) => state.save);
  const engagePatrol = useGameStore((state) => state.engagePatrol);
  const [openedAt] = useState(() => Date.now());
  const kind = isPatrolKind(spawn.kind) ? spawn.kind : null;
  const difficulty = kind ? spawn.difficulty : null;
  const [picking, setPicking] = useState(false);
  const texts = localized({ en: patrolTexts, fr: frPatrolTexts });
  const briefing = useMemo(
    () => ({ threats: kind ? [patrolThreat(spawn)] : [], restriction: null, opportunity: null }),
    [kind, spawn],
  );
  const oddsOf = useCallback(
    (dressed: SaveData, heroIds: string[]) => ({
      key: fightOddsKey(dressed, heroIds, spawn, spawn.tier, kind ? isElitePatrolKind(kind) : false, openedAt),
      run: () => patrolOdds(dressed, spawn, heroIds, openedAt),
    }),
    [spawn, kind, openedAt],
  );

  if (!kind || difficulty === null) return null;

  const tier = spawn.tier;
  const elite = isElitePatrolKind(kind);
  const dungeon = patrolDungeon(spawn, tier, elite);
  // Working heroes are recalled on send, so the problem sees them as free.
  const problemOf = (state: SaveData, heroIds: string[]) => patrolFightProblem(asRecalled(state, heroIds), spawn, heroIds, player, now);
  // Before a party is picked, only the place's own problems count (distance, gone).
  const problem = problemOf(save, []);
  const placeProblem = problem === 'empty' ? null : problem;
  const far = distanceTo(spawn, player, now) > patrolRules.engageMeters;
  const escortId = save.escort?.heroId;

  const fight = (heroIds: string[]) => {
    // The pure fight rule refuses working heroes: recall them first, in the same tap.
    recallWorkingHeroes(heroIds);
    engagePatrol(spawn, heroIds, player);
    syncBackground();
    useWorldStore
      .getState()
      .set({ patrolMessage: { text: t('patrols.sent', { minutes: dungeon.durationMinutes }), at: now } });
    onClose();
  };

  return (
    <Overlay onClose={onClose} position="bottom">
      <Sheet
        variant="wood"
        emoji={dungeon.emoji}
        title={texts.kinds[kind]}
        bodyStyle={styles.content}
        footer={
          <View style={styles.actions}>
            <EmberButton title={t('patrols.fight')} disabled={placeProblem !== null} onPress={() => setPicking(true)} />
            <WoodButton title={t('common.close')} onPress={onClose} />
          </View>
        }
      >
        <PartsLine
          parts={[
            `${t('expeditions.tier', { tier })}${elite ? ` ★ ${t('patrols.eliteX2')}` : ''}`,
            { emoji: '⏳', text: formatDuration(dungeon.durationMinutes * 60_000) },
            t('patrols.recommended', { count: patrolFights[difficulty].party }),
          ]}
          labelStyle={styles.muted}
        />
        <DifficultyChip difficulty={difficulty} />
        {!far && (
          <>
          <Text style={styles.muted}>{t(`patrols.rewards.${kind}`)}</Text>
          <ThreatChip threat={patrolThreat(spawn)} />
          <PartsLine
            parts={dungeonTags(dungeon).map((tag) => ({ emoji: tagInfo[tag].emoji, icon: tagInfo[tag].icon, text: tr(tagInfo[tag].name) }))}
            labelStyle={styles.muted}
          />
          <Text style={styles.subtitle}>{t('expeditions.foes')}</Text>
          {dungeonFoes(dungeon).map((mob) => (
            <EnemyTags key={mob.id} mob={mob} />
          ))}
          {escortId !== undefined && <Text style={styles.muted}>{t('patrols.escortNote')}</Text>}
          </>
        )}
        {placeProblem && <Text style={styles.problem}>{problemText[placeProblem](distanceTo(spawn, player, now))}</Text>}
        {far && <Text style={styles.muted}>{t('places.tooFarToSee')}</Text>}
      </Sheet>
      {picking && (
        <PartyDialog
          title={texts.kinds[kind]}
          subtitle={`${t('expeditions.tier', { tier })}${elite ? ` ★ ${t('patrols.eliteX2')}` : ''} · ${formatDuration(dungeon.durationMinutes * 60_000)} · ${t('patrols.recommended', { count: patrolFights[difficulty].party })}`}
          slots={rosterRules.partySize}
          draftKey={`patrol:${spawn.id}`}
          briefing={briefing}
          oddsOf={oddsOf}
          now={now}
          sendLabel={t('patrols.fight')}
          problem={(state, heroIds) => {
            const found = heroIds.length > 0 ? problemOf(state, heroIds) : null;
            return found ? problemText[found](distanceTo(spawn, player, now)) : null;
          }}
          onSend={fight}
          onClose={() => setPicking(false)}
        />
      )}
    </Overlay>
  );
}

const styles = StyleSheet.create({
  content: { gap: 6, paddingBottom: 12 },
  subtitle: { fontSize: 21, marginTop: 8 },
  muted: { color: colors.muted },
  problem: { color: colors.muted, fontStyle: 'italic' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
