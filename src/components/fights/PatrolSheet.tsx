import { useCallback, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { isElitePatrolKind } from '@/content/enemies';
import { frPatrolTexts } from '@/content/fr/patrols';
import { patrolFights, patrolRules, patrolTexts } from '@/content/patrols';
import { rosterRules } from '@/content/roster';
import { tagInfo } from '@/content/rotation';
import { patrolThreat } from '@/content/threats';
import { dungeonTags } from '@/game/dungeons/tags';
import { dungeonFoes } from '@/game/enemies/tags';
import { fightOddsKey } from '@/game/expeditions/oddsCache';
import { distanceMeters } from '@/game/generation/geo';
import type { LatLng } from '@/game/generation/types';
import { patrolDungeon, patrolFightProblem, patrolOdds, type PatrolFightProblem } from '@/game/patrols/fight';
import { isPatrolKind, patrolPositionAt, type PatrolSpawn } from '@/game/patrols/generate';
import { mainAction } from '@/game/places/mainAction';
import type { SaveData } from '@/game/save';
import { syncBackground } from '@/hooks/useAutoGather';
import { formatDuration, localized, t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';
import { ui } from '@/theme';

import { PartsLine } from '../IconLabel';
import { MapSheet, mapSheetStatus } from '../MapSheet';
import { PartyDialog } from '../PartyDialog';
import { Text } from '../Text';
import { TrophyLine } from '../TrophyLine';
import { asRecalled, recallWorkingHeroes } from '../workingHeroes';
import { fightBlocked, ringTime, walkToward } from './fightBits';
import { FightSummary } from './FightSummary';
import { FoeList } from './FoeList';

const problemText: Record<Exclude<PatrolFightProblem, null>, () => string> = {
  tooFar: () => t('fightSheet.blocked.tooFar'),
  gone: () => t('patrols.gone'),
  away: () => t('sanctum.heroAway'),
  exhausted: () => t('patrols.exhausted'),
  partySize: () => t('patrols.partyMax'),
  empty: () => t('sanctum.noHeroes'),
};

type Props = { spawn: PatrolSpawn; player: LatLng; now: number; onClose: () => void };

/** A patrol on the map sheet template: its foes, threat and drops in the peek; Fight picks the party. */
export function PatrolSheet({ spawn, player, now, onClose }: Props) {
  const save = useGameStore((state) => state.save);
  const [openedAt] = useState(() => Date.now());
  const [picking, setPicking] = useState(false);
  const kind = isPatrolKind(spawn.kind) ? spawn.kind : null;
  const texts = localized({ en: patrolTexts, fr: frPatrolTexts });
  const briefing = useMemo(() => ({ threats: kind ? [patrolThreat(spawn)] : [], restriction: null, opportunity: null }), [kind, spawn]);
  const oddsOf = useCallback(
    (dressed: SaveData, heroIds: string[]) => ({
      key: fightOddsKey(dressed, heroIds, spawn, spawn.tier, kind ? isElitePatrolKind(kind) : false, openedAt),
      run: () => patrolOdds(dressed, spawn, heroIds, openedAt),
    }),
    [spawn, kind, openedAt],
  );
  if (!kind || spawn.difficulty === null) return null;

  const difficulty = spawn.difficulty;
  const elite = isElitePatrolKind(kind);
  const dungeon = patrolDungeon(spawn, spawn.tier, elite);
  const foes = dungeonFoes(dungeon);
  const at = patrolPositionAt(spawn, now);
  const distance = distanceMeters(player, at);
  const range = patrolRules.engageMeters;
  // Working heroes are recalled on send, so the problem sees them as free.
  const problemOf = (state: SaveData, heroIds: string[]) => patrolFightProblem(asRecalled(state, heroIds), spawn, heroIds, player, now);
  const own = problemOf(save, []);
  const state = mainAction({ player, target: at, range, problem: own === 'empty' ? null : own });
  const meta = `${t('expeditions.tier', { tier: spawn.tier })}${elite ? ` ★ ${t('patrols.eliteX2')}` : ''} · ${formatDuration(dungeon.durationMinutes * 60_000)} · ${t('patrols.recommended', { count: patrolFights[difficulty].party })}`;

  const fight = (heroIds: string[]) => {
    // The pure fight rule refuses working heroes: recall them first, in the same tap.
    recallWorkingHeroes(heroIds);
    useGameStore.getState().engagePatrol(spawn, heroIds, player);
    syncBackground();
    useWorldStore.getState().set({ patrolMessage: { text: t('patrols.sent', { minutes: dungeon.durationMinutes }), at: now } });
    onClose();
  };

  return (
    <>
      <MapSheet
        onClose={onClose}
        emoji={dungeon.emoji}
        ring={{ kind: 'difficulty', difficulty, time: ringTime(spawn.startsAt, spawn.endsAt, now) }}
        title={texts.kinds[kind]}
        status={mapSheetStatus({ distance, range, expiresAt: spawn.endsAt, now })}
        summary={<FightSummary foes={foes} threats={briefing.threats} source="patrol" />}
        action={{
          state,
          verb: t('mapSheet.verbs.fight'),
          label: t('patrols.fight'),
          blockedLabel: state.kind === 'blocked' ? fightBlocked(state.reason) : undefined,
          onPress: () => setPicking(true),
          onWalk: walkToward(at),
        }}
        tabs={[
          {
            key: 'foes',
            label: t('expeditions.foes'),
            render: () => (
              <FoeList foes={foes}>
                <PartsLine
                  parts={dungeonTags(dungeon).map((tag) => ({ emoji: tagInfo[tag].emoji, icon: tagInfo[tag].icon, text: tr(tagInfo[tag].name) }))}
                  labelStyle={styles.muted}
                />
              </FoeList>
            ),
          },
          {
            key: 'details',
            label: t('placeSheet.tabs.details'),
            render: () => (
              <>
                <Text style={styles.muted}>{meta}</Text>
                <Text style={styles.muted}>{t(`patrols.rewards.${kind}`)}</Text>
                {save.escort?.heroId !== undefined && <Text style={styles.muted}>{t('patrols.escortNote')}</Text>}
                <TrophyLine source="patrol" />
              </>
            ),
          },
        ]}
        inRange={distance <= range}
      />
      {picking && (
        <PartyDialog
          title={texts.kinds[kind]}
          subtitle={meta}
          slots={rosterRules.partySize}
          draftKey={`patrol:${spawn.id}`}
          briefing={briefing}
          oddsOf={oddsOf}
          now={now}
          sendLabel={t('patrols.fight')}
          problem={(current, heroIds) => {
            const found = heroIds.length > 0 ? problemOf(current, heroIds) : null;
            return found ? problemText[found]() : null;
          }}
          onSend={fight}
          onClose={() => setPicking(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({ muted: { color: ui.inkMuted } });
