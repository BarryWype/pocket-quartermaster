import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { opportunityById } from '@/content/lookup';
import { placeFightRules } from '@/content/placeFights';
import { placeInfo, placeRules } from '@/content/places';
import { highestUnlockedTier } from '@/game/expeditions/expeditions';
import { fightOddsKey } from '@/game/expeditions/oddsCache';
import { distanceMeters } from '@/game/generation/geo';
import type { LatLng } from '@/game/generation/types';
import type { PlaceSpawn } from '@/game/places/generate';
import { dungeonFoes } from '@/game/enemies/tags';
import { isFightPlace, placeFightBriefing, placeFightDungeon, placeFightOdds, placeFightProblem, type PlaceFightProblem } from '@/game/places/fights';
import type { SaveData } from '@/game/save';
import { formatDuration, t, tr } from '@/i18n';
import { syncBackground } from '@/hooks/useAutoGather';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';
import { colors } from '@/theme';

import { EnemyTags } from './EnemyTags';
import { DifficultyChip, EmberButton, WoodButton } from './ui';
import { leavesIn } from './PlacePanel';
import { Overlay } from './Overlay';
import { PartyDialog } from './PartyDialog';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { ThreatChip } from './ThreatChip';
import { TrophyLine } from './TrophyLine';
import { IconLabel, PartsLine } from './IconLabel';
import { asRecalled, recallWorkingHeroes } from './workingHeroes';

const problemText: Record<Exclude<PlaceFightProblem, null>, (distance: number) => string> = {
  tooFar: (distance) => t('patrols.walkCloser', { distance: Math.round(distance) }),
  gone: () => t('patrols.gone'),
  away: () => t('sanctum.heroAway'),
  exhausted: () => t('patrols.exhausted'),
  partySize: () => t('patrols.partyMax'),
  empty: () => t('sanctum.noHeroes'),
};

type Props = { place: PlaceSpawn; player: LatLng; now: number; onClose: () => void };

/** A fight event or monster lair: its threat, how long it stays, and the heroes to send, like a patrol. */
export function PlaceFightPanel({ place, player, now, onClose }: Props) {
  const save = useGameStore((state) => state.save);
  const engage = useGameStore((state) => state.engagePlaceFight);
  const [openedAt] = useState(() => Date.now());
  const kind = isFightPlace(place.kind) ? place.kind : null;
  const rules = kind ? placeFightRules.kinds[kind] : null;
  const min = kind === 'monsterLair' ? placeFightRules.lair.minParty : 1;
  const [picking, setPicking] = useState(false);
  const tier = highestUnlockedTier(save);
  const oddsOf = useCallback(
    (dressed: SaveData, heroIds: string[]) => ({
      key: fightOddsKey(dressed, heroIds, place, tier, kind ? placeFightRules.kinds[kind].elite : false, openedAt),
      run: () => placeFightOdds(dressed, place, heroIds, openedAt),
    }),
    [place, kind, openedAt, tier],
  );
  const briefing = useMemo(() => (kind ? placeFightBriefing(save, place) : null), [kind, save, place]);
  if (!kind || !rules || !briefing) return null;

  const foes = dungeonFoes(placeFightDungeon(place, highestUnlockedTier(save)));
  // Working heroes are recalled on send, so the problem sees them as free.
  const problemOf = (state: SaveData, heroIds: string[]) => placeFightProblem(asRecalled(state, heroIds), place, heroIds, player, now);
  // Before a party is picked, only the place's own problems count (distance, gone).
  const problem = problemOf(save, []);
  const placeProblem = problem === 'empty' ? null : problem;
  const far = distanceMeters(player, place.position) > placeRules.interactionMeters;
  const info = placeInfo[kind];

  const fight = (heroIds: string[]) => {
    // The pure fight rule refuses working heroes: recall them first, in the same tap.
    recallWorkingHeroes(heroIds);
    engage(place, heroIds, player);
    syncBackground();
    useWorldStore.getState().set({ patrolMessage: { text: t('places.sent', { minutes: rules.minutes }), at: now } });
    onClose();
  };

  return (
    <Overlay onClose={onClose} position="bottom">
      <Sheet
        variant="wood"
        emoji={info.emoji}
        title={tr(info.name)}
        bodyStyle={styles.content}
        footer={
          <View style={styles.actions}>
            <EmberButton title={t('places.fight')} disabled={placeProblem !== null} onPress={() => setPicking(true)} />
            <WoodButton title={t('common.close')} onPress={onClose} />
          </View>
        }
      >
        <DifficultyChip difficulty={rules.difficulty} />
        {!far && <Text style={styles.muted}>{tr(info.description)}</Text>}
        <PartsLine
          parts={[
            `${t('expeditions.tier', { tier: highestUnlockedTier(save) })}${rules.elite ? ' ★' : ''}`,
            { emoji: '⏳', text: formatDuration(rules.minutes * 60_000) },
            t('places.party', { min, max: rules.party }),
          ]}
          labelStyle={styles.muted}
        />
        <Text style={styles.muted}>{leavesIn(place.expiresAt - now)}</Text>
        {!far && (
          <>
          {briefing.threats.map((threat) => (
            <ThreatChip key={threat.id} threat={threat} />
          ))}
          {briefing.opportunity && (
            <IconLabel
              emoji={opportunityById[briefing.opportunity].emoji}
              label={`${tr(opportunityById[briefing.opportunity].name)}: ${tr(opportunityById[briefing.opportunity].description)}`}
              labelStyle={styles.muted}
            />
          )}
          <Text style={styles.subtitle}>{t('expeditions.foes')}</Text>
          {foes.map((mob) => (
            <EnemyTags key={mob.id} mob={mob} />
          ))}
          <TrophyLine source={kind} />
          </>
        )}
        {placeProblem && <Text style={styles.problem}>{problemText[placeProblem](distanceMeters(player, place.position))}</Text>}
        {far && <Text style={styles.muted}>{t('places.tooFarToSee')}</Text>}
      </Sheet>
      {picking && (
        <PartyDialog
          title={tr(info.name)}
          subtitle={`${t('expeditions.tier', { tier: highestUnlockedTier(save) })}${rules.elite ? ' ★' : ''} · ${formatDuration(rules.minutes * 60_000)} · ${t('places.party', { min, max: rules.party })}`}
          slots={rules.party}
          briefing={briefing}
          oddsOf={oddsOf}
          now={now}
          sendLabel={t('places.fight')}
          problem={(state, heroIds) => {
            const found = heroIds.length > 0 ? problemOf(state, heroIds) : null;
            return found ? problemText[found](distanceMeters(player, place.position)) : null;
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
