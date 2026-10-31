import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { heroClasses } from '@/content/heroes';
import { opportunityById } from '@/content/lookup';
import { placeFightRules } from '@/content/placeFights';
import { placeInfo } from '@/content/places';
import { highestUnlockedTier } from '@/game/expeditions/expeditions';
import { fightOddsKey, cachedOdds, storeOdds } from '@/game/expeditions/oddsCache';
import { oddsBand, type Odds } from '@/game/expeditions/odds';
import { distanceMeters } from '@/game/generation/geo';
import type { LatLng } from '@/game/generation/types';
import type { PlaceSpawn } from '@/game/places/generate';
import { dungeonFoes } from '@/game/enemies/tags';
import { isFightPlace, placeFightBriefing, placeFightDungeon, placeFightOdds, placeFightProblem, type PlaceFightProblem } from '@/game/places/fights';
import { currentHp, isExhausted, maxHp } from '@/game/team/health';
import { isAway } from '@/game/team/team';
import { formatDuration, formatPercent, t, tr } from '@/i18n';
import { syncBackground } from '@/hooks/useAutoGather';
import { recordTiming } from '@/services/timings';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';
import { colors, pixel } from '@/theme';

import { Button } from './Button';
import { EnemyTags } from './EnemyTags';
import { leavesIn } from './PlacePanel';
import { GameIcon } from './GameIcon';
import { Overlay } from './Overlay';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { ThreatChip } from './ThreatChip';

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
  const candidates = save.heroes.filter((hero) => !isAway(save, hero.id) && !isExhausted(hero, now));
  const [heroIds, setHeroIds] = useState<string[]>(() => candidates.slice(0, rules?.party ?? 0).map((hero) => hero.id));

  // The odds are computed off the first frame (issue 12's approach): the panel
  // opens at once, shows "…" until they land, and odds already held for exactly
  // these inputs (same place, party, minute) show immediately.
  const oddsKey = useMemo(
    () =>
      kind && heroIds.length > 0
        ? fightOddsKey(save, heroIds, place, highestUnlockedTier(save), placeFightRules.kinds[kind].elite, openedAt)
        : null,
    [save, place, heroIds, openedAt, kind],
  );
  const [computed, setComputed] = useState<{ key: string; odds: Odds } | null>(() => {
    if (oddsKey === null) return null;
    const held = cachedOdds(oddsKey);
    return held ? { key: oddsKey, odds: held } : null;
  });
  useEffect(() => {
    if (oddsKey === null || computed?.key === oddsKey) return;
    const timer = setTimeout(() => {
      const odds = recordTiming('odds: placeFight', () => placeFightOdds(save, place, heroIds, openedAt));
      storeOdds(oddsKey, odds);
      setComputed({ key: oddsKey, odds });
    });
    return () => clearTimeout(timer);
    // The key covers the save, the place, the party and the minute: rerun only when it moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oddsKey, computed?.key]);
  const odds = computed?.key === oddsKey ? computed.odds : (oddsKey !== null ? (cachedOdds(oddsKey) ?? null) : null);
  if (!kind || !rules) return null;

  const briefing = placeFightBriefing(save, place);
  const foes = dungeonFoes(placeFightDungeon(place, highestUnlockedTier(save)));
  const problem = placeFightProblem(save, place, heroIds, player, now);
  const info = placeInfo[kind];
  const toggle = (heroId: string) =>
    setHeroIds((ids) => (ids.includes(heroId) ? ids.filter((id) => id !== heroId) : ids.length < rules.party ? [...ids, heroId] : ids));

  const fight = () => {
    engage(place, heroIds, player);
    syncBackground();
    useWorldStore.getState().set({ patrolMessage: { text: t('places.sent', { minutes: rules.minutes }), at: now } });
    onClose();
  };

  return (
    <Overlay onClose={onClose} position="bottom">
      <Sheet
        title={`${info.emoji} ${tr(info.name)}`}
        bodyStyle={styles.content}
        footer={
          <View style={styles.actions}>
            <Button title={t('places.fight')} disabled={problem !== null} onPress={fight} />
            <Button title={t('common.close')} color={colors.muted} onPress={onClose} />
          </View>
        }
      >
        <Text style={styles.muted}>{tr(info.description)}</Text>
        <Text style={styles.muted}>
          {t('expeditions.tier', { tier: highestUnlockedTier(save) })}
          {rules.elite ? ' ★' : ''} · ⏳ {formatDuration(rules.minutes * 60_000)} · {t('places.party', { min, max: rules.party })}
        </Text>
        <Text style={styles.muted}>{leavesIn(place.expiresAt - now)}</Text>
        {briefing.threats.map((threat) => (
          <ThreatChip key={threat.id} threat={threat} />
        ))}
        {briefing.opportunity && (
          <Text style={styles.muted}>
            {opportunityById[briefing.opportunity].emoji} {tr(opportunityById[briefing.opportunity].name)}:{' '}
            {tr(opportunityById[briefing.opportunity].description)}
          </Text>
        )}
        <Text style={styles.subtitle}>{t('expeditions.foes')}</Text>
        {foes.map((mob) => (
          <EnemyTags key={mob.id} mob={mob} />
        ))}
        <Text style={styles.subtitle}>{t('sanctum.heroes')}</Text>
        <View style={styles.chips}>
          {candidates.map((hero) => (
            <Pressable key={hero.id} onPress={() => toggle(hero.id)} style={[styles.chip, heroIds.includes(hero.id) && styles.chipActive]}>
              <GameIcon emoji={heroClasses[hero.classId].emoji} size={20} />
              <Text>
                {hero.name} · {formatPercent(currentHp(save, hero, now) / maxHp(save, hero))}
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
        {problem && <Text style={styles.problem}>{problemText[problem](distanceMeters(player, place.position))}</Text>}
      </Sheet>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  content: { gap: 6, paddingBottom: 12 },
  subtitle: { fontSize: 21, marginTop: 8 },
  muted: { color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: pixel.outline, borderColor: colors.woodDark, paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { borderColor: colors.ink, backgroundColor: colors.highlight },
  odds: { fontSize: 21, marginTop: 8 },
  problem: { color: colors.muted, fontStyle: 'italic' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
