import { useEffect, useMemo, useState } from 'react';
import { rosterRules } from '@/content/roster';
import { Pressable, StyleSheet, View } from 'react-native';

import { frPatrolTexts } from '@/content/fr/patrols';
import { heroClasses } from '@/content/heroes';
import { patrolKinds, patrolTexts } from '@/content/patrols';
import { patrolThreats } from '@/content/threats';
import { tagInfo } from '@/content/rotation';
import { highestUnlockedTier } from '@/game/expeditions/expeditions';
import { fightOddsKey, cachedOdds, storeOdds } from '@/game/expeditions/oddsCache';
import { oddsBand, type Odds } from '@/game/expeditions/odds';
import { dungeonTags } from '@/game/dungeons/tags';
import { dungeonFoes } from '@/game/enemies/tags';

import type { LatLng } from '@/game/generation/types';
import { isPatrolKind, patrolTier, type PatrolSpawn } from '@/game/patrols/generate';
import { patrolDungeon, patrolFightProblem, patrolOdds, type PatrolFightProblem } from '@/game/patrols/fight';
import { distanceTo } from '@/game/patrols/visibility';
import { currentHp, isExhausted, maxHp } from '@/game/team/health';
import { isAway } from '@/game/team/team';
import { formatDuration, formatPercent, localized, t, tr } from '@/i18n';
import { syncBackground } from '@/hooks/useAutoGather';
import { recordTiming } from '@/services/timings';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';
import { colors, pixel } from '@/theme';

import { Button } from './Button';
import { EnemyTags } from './EnemyTags';
import { Overlay } from './Overlay';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { ThreatChip } from './ThreatChip';

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
  // Home heroes who can still fight; the escort can be sent, and stops escorting if so.
  const candidates = save.heroes.filter((hero) => !isAway(save, hero.id) && !isExhausted(hero, now));
  const [heroIds, setHeroIds] = useState<string[]>(() =>
    kind ? candidates.slice(0, patrolKinds[kind].party).map((hero) => hero.id) : [],
  );
  const texts = localized({ en: patrolTexts, fr: frPatrolTexts });

  // The odds are computed off the first frame (issue 12's approach): the panel
  // opens at once, shows "…" until they land, and odds already held for exactly
  // these inputs (same patrol, party, minute) show immediately.
  const oddsKey = useMemo(
    () => {
      if (!kind || heroIds.length === 0) return null;
      const { tier, elite } = patrolTier(spawn, highestUnlockedTier(save));
      return fightOddsKey(save, heroIds, spawn, tier, elite, openedAt);
    },
    [save, spawn, heroIds, openedAt, kind],
  );
  const [computed, setComputed] = useState<{ key: string; odds: Odds } | null>(() => {
    if (oddsKey === null) return null;
    const held = cachedOdds(oddsKey);
    return held ? { key: oddsKey, odds: held } : null;
  });
  useEffect(() => {
    if (oddsKey === null || computed?.key === oddsKey) return;
    const timer = setTimeout(() => {
      const odds = recordTiming('odds: patrol', () => patrolOdds(save, spawn, heroIds, openedAt));
      storeOdds(oddsKey, odds);
      setComputed({ key: oddsKey, odds });
    });
    return () => clearTimeout(timer);
    // The key covers the save, the patrol, the party and the minute: rerun only when it moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oddsKey, computed?.key]);
  const odds = computed?.key === oddsKey ? computed.odds : (oddsKey !== null ? (cachedOdds(oddsKey) ?? null) : null);

  if (!kind) return null;

  const { tier, elite } = patrolTier(spawn, highestUnlockedTier(save));
  const dungeon = patrolDungeon(spawn, tier, elite);
  const problem = patrolFightProblem(save, spawn, heroIds, player, now);
  const escortId = save.escort?.heroId;
  const toggle = (heroId: string) =>
    setHeroIds((ids) =>
      ids.includes(heroId) ? ids.filter((id) => id !== heroId) : ids.length < rosterRules.partySize ? [...ids, heroId] : ids,
    );

  const fight = () => {
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
        title={`${dungeon.emoji} ${texts.kinds[kind]}`}
        bodyStyle={styles.content}
        footer={
          <View style={styles.actions}>
            <Button title={t('patrols.fight')} disabled={problem !== null} onPress={fight} />
            <Button title={t('common.close')} color={colors.muted} onPress={onClose} />
          </View>
        }
      >
        <Text style={styles.muted}>
          {t('expeditions.tier', { tier })}
          {elite ? ` ★ ${t('patrols.eliteX2')}` : ''} · ⏳ {formatDuration(dungeon.durationMinutes * 60_000)} ·{' '}
          {t('patrols.recommended', { count: patrolKinds[kind].party })}
        </Text>
        <Text style={styles.muted}>{t(`patrols.rewards.${kind}`)}</Text>
        <ThreatChip threat={patrolThreats[kind]} />
        <Text style={styles.muted}>
          {dungeonTags(dungeon)
            .map((tag) => `${tagInfo[tag].emoji} ${tr(tagInfo[tag].name)}`)
            .join(' · ')}
        </Text>
        <Text style={styles.subtitle}>{t('expeditions.foes')}</Text>
        {dungeonFoes(dungeon).map((mob) => (
          <EnemyTags key={mob.id} mob={mob} />
        ))}
        <Text style={styles.subtitle}>{t('sanctum.heroes')}</Text>
        <View style={styles.chips}>
          {candidates.map((hero) => (
            <Pressable
              key={hero.id}
              onPress={() => toggle(hero.id)}
              style={[styles.chip, heroIds.includes(hero.id) && styles.chipActive]}
            >
              <Text>
                {heroClasses[hero.classId].emoji} {hero.name}
                {hero.id === escortId ? t('common.escort') : ''} ·{' '}
                {formatPercent(currentHp(save, hero, now) / maxHp(save, hero))}
              </Text>
            </Pressable>
          ))}
        </View>
        {escortId !== undefined && heroIds.includes(escortId) && <Text style={styles.muted}>{t('patrols.escortNote')}</Text>}
        {heroIds.length > 0 &&
          (odds ? (
            <Text style={styles.odds}>
              {t('sanctum.estimate', { percent: formatPercent(odds.success), band: t(`odds.${oddsBand(odds.success)}`) })}
            </Text>
          ) : (
            <Text style={styles.odds}>…</Text>
          ))}
        {problem && <Text style={styles.problem}>{problemText[problem](distanceTo(spawn, player, now))}</Text>}
      </Sheet>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  content: { gap: 6, paddingBottom: 12 },
  subtitle: { fontSize: 21, marginTop: 8 },
  muted: { color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: pixel.outline, borderColor: colors.woodDark, paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { borderColor: colors.ink, backgroundColor: colors.highlight },
  odds: { fontSize: 21, marginTop: 8 },
  problem: { color: colors.muted, fontStyle: 'italic' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
