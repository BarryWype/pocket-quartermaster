import { useCallback, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';

import { opportunityById } from '@/content/lookup';
import { placeFightRules } from '@/content/placeFights';
import { placeInfo, placeRules } from '@/content/places';
import { dungeonFoes } from '@/game/enemies/tags';
import { highestUnlockedTier } from '@/game/expeditions/expeditions';
import { fightOddsKey } from '@/game/expeditions/oddsCache';
import { distanceMeters } from '@/game/generation/geo';
import { isFightPlace, placeFightBriefing, placeFightDungeon, placeFightOdds, placeFightProblem, type PlaceFightProblem } from '@/game/places/fights';
import { mainAction } from '@/game/places/mainAction';
import type { SaveData } from '@/game/save';
import { syncBackground } from '@/hooks/useAutoGather';
import { formatDuration, t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';
import { ui } from '@/theme';

import { IconLabel } from '../IconLabel';
import { MapSheet, mapSheetStatus } from '../MapSheet';
import { PartyDialog } from '../PartyDialog';
import type { PlaceSheetProps } from '../places/usePlaceSheet';
import { Text } from '../Text';
import { TrophyLine } from '../TrophyLine';
import { asRecalled, recallWorkingHeroes } from '../workingHeroes';
import { fightBlocked, ringTime, walkToward } from './fightBits';
import { FightSummary } from './FightSummary';
import { FoeList } from './FoeList';

const problemText: Record<Exclude<PlaceFightProblem, null>, () => string> = {
  tooFar: () => t('fightSheet.blocked.tooFar'),
  gone: () => t('patrols.gone'),
  away: () => t('sanctum.heroAway'),
  exhausted: () => t('patrols.exhausted'),
  partySize: () => t('patrols.partyMax'),
  empty: () => t('sanctum.noHeroes'),
};

/** A fight event or monster lair on the map sheet template: its foes, threats and drops, and Fight to pick the party. */
export function PlaceFightSheet({ place, player, now, onClose }: PlaceSheetProps) {
  const save = useGameStore((state) => state.save);
  const [openedAt] = useState(() => Date.now());
  const [picking, setPicking] = useState(false);
  const kind = isFightPlace(place.kind) ? place.kind : null;
  const tier = highestUnlockedTier(save);
  const oddsOf = useCallback(
    (dressed: SaveData, heroIds: string[]) => ({
      key: fightOddsKey(dressed, heroIds, place, tier, kind ? placeFightRules.kinds[kind].elite : false, openedAt),
      run: () => placeFightOdds(dressed, place, heroIds, openedAt),
    }),
    [place, kind, openedAt, tier],
  );
  const briefing = useMemo(() => (kind ? placeFightBriefing(save, place) : null), [kind, save, place]);
  if (!kind || !briefing) return null;

  const rules = placeFightRules.kinds[kind];
  const info = placeInfo[kind];
  const min = kind === 'monsterLair' ? placeFightRules.lair.minParty : 1;
  const foes = dungeonFoes(placeFightDungeon(place, tier));
  const distance = distanceMeters(player, place.position);
  const range = placeRules.interactionMeters;
  // Working heroes are recalled on send, so the problem sees them as free.
  const problemOf = (state: SaveData, heroIds: string[]) => placeFightProblem(asRecalled(state, heroIds), place, heroIds, player, now);
  const own = problemOf(save, []);
  const state = mainAction({ player, target: place.position, range, problem: own === 'empty' ? null : own });
  const meta = `${t('expeditions.tier', { tier })}${rules.elite ? ' ★' : ''} · ${formatDuration(rules.minutes * 60_000)} · ${t('places.party', { min, max: rules.party })}`;

  const fight = (heroIds: string[]) => {
    // The pure fight rule refuses working heroes: recall them first, in the same tap.
    recallWorkingHeroes(heroIds);
    useGameStore.getState().engagePlaceFight(place, heroIds, player);
    syncBackground();
    useWorldStore.getState().set({ patrolMessage: { text: t('places.sent', { minutes: rules.minutes }), at: now } });
    onClose();
  };

  return (
    <>
      <MapSheet
        onClose={onClose}
        emoji={info.emoji}
        ring={{ kind: 'difficulty', difficulty: rules.difficulty, time: ringTime(place.startsAt, place.expiresAt, now) }}
        title={tr(info.name)}
        status={mapSheetStatus({ distance, range, expiresAt: place.expiresAt, now })}
        summary={<FightSummary foes={foes} threats={briefing.threats} source={kind} />}
        action={{
          state,
          verb: t('mapSheet.verbs.fight'),
          label: t('places.fight'),
          blockedLabel: state.kind === 'blocked' ? fightBlocked(state.reason) : undefined,
          onPress: () => setPicking(true),
          onWalk: walkToward(place.position),
        }}
        tabs={[
          {
            key: 'foes',
            label: t('expeditions.foes'),
            render: () => (
              <FoeList foes={foes}>
                {briefing.opportunity && (
                  <IconLabel
                    emoji={opportunityById[briefing.opportunity].emoji}
                    label={`${tr(opportunityById[briefing.opportunity].name)}: ${tr(opportunityById[briefing.opportunity].description)}`}
                    labelStyle={styles.muted}
                  />
                )}
              </FoeList>
            ),
          },
          {
            key: 'details',
            label: t('placeSheet.tabs.details'),
            render: () => (
              <>
                <Text style={styles.muted}>{tr(info.description)}</Text>
                <Text style={styles.muted}>{meta}</Text>
                <TrophyLine source={kind} />
              </>
            ),
          },
        ]}
        inRange={distance <= range}
      />
      {picking && (
        <PartyDialog
          title={tr(info.name)}
          subtitle={meta}
          slots={rules.party}
          draftKey={`place:${place.id}`}
          briefing={briefing}
          oddsOf={oddsOf}
          now={now}
          sendLabel={t('places.fight')}
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
