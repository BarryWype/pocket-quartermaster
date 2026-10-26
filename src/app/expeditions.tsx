import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Row, SectionTitle } from '@/components/Row';
import { Text } from '@/components/Text';
import { TutorialHint } from '@/components/TutorialHint';
import { abilityText } from '@/content/abilities';
import { tutorialRules } from '@/content/tutorial';
import { heroClasses } from '@/content/heroes';
import { dungeonById, materialById, recipeById, recipeOutput } from '@/content/lookup';
import { modifierById } from '@/content/modifiers';
import { tagInfo } from '@/content/rotation';
import { countersFor } from '@/game/dungeons/counters';
import { shardId } from '@/game/elements';
import { guildRank, partySize } from '@/game/guild/guild';
import { modifierFor, nextRotationAt, rotationDay, withModifier } from '@/game/dungeons/rotation';
import { dungeonTags } from '@/game/dungeons/tags';
import { bossBonusAvailable, expeditionMinutes, isDungeonAvailable, isDungeonUnlocked } from '@/game/expeditions/expeditions';
import { estimateOdds, oddsBand } from '@/game/expeditions/odds';
import { prepareParty } from '@/game/expeditions/simulate';
import { isOnExpedition } from '@/game/team/team';
import { useLanguage } from '@/hooks/useLanguage';
import { syncPlan } from '@/hooks/useNotifications';
import { formatDuration, formatPercent, t, tr } from '@/i18n';
import { deviceNotifications } from '@/services/notifications';
import { currentRotation, debugEnabled, useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';

export default function ExpeditionsScreen() {
  useLanguage();
  const save = useGameStore((state) => state.save);
  const start = useGameStore((state) => state.startExpedition);
  const markReportsSeen = useGameStore((state) => state.markReportsSeen);
  const askedPermission = useSettingsStore((state) => state.askedNotificationPermission);
  const setSettings = useSettingsStore((state) => state.set);
  const fastExpeditions = useDebugStore((state) => debugEnabled(state) && state.fastExpeditions);
  const durationScale = fastExpeditions ? 1 / 60 : 1;
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState<string[]>(() =>
    save.heroes.filter((h) => !isOnExpedition(save, h.id)).slice(0, partySize(save)).map((h) => h.id),
  );
  /** The expedition whose progress bar is open. */
  const [following, setFollowing] = useState<string | null>(null);
  /** The dungeon card tapped last: heroes who are good there get a badge. */
  const [focused, setFocused] = useState<string | null>(null);
  /** Scouting report (Guild Hall): tomorrow's rotation. */
  const [showTomorrow, setShowTomorrow] = useState(false);
  // Re-read when the day changes or a debug override does.
  const day = rotationDay(now);
  const dayOffset = useDebugStore((state) => state.rotationDayOffset);
  const forcedSlots = useDebugStore((state) => state.forcedSlots);
  const forcedModifiers = useDebugStore((state) => state.forcedModifiers);
  const rotation = useMemo(
    () => currentRotation(now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [day, dayOffset, forcedSlots, forcedModifiers],
  );

  /** The first launch asks, in game, before the OS permission prompt. */
  const send = async (dungeonId: string, party: string[]) => {
    start(dungeonId, party, durationScale);
    if (askedPermission) return;
    setSettings({ askedNotificationPermission: true });
    const permission = await deviceNotifications.getPermission().catch(() => null);
    if (!permission || permission.granted || !permission.canAskAgain) return;
    Alert.alert(t('expeditions.askTitle'), t('expeditions.askBody'), [
      { text: t('expeditions.notNow'), style: 'cancel' },
      { text: t('expeditions.yes'), onPress: () => deviceNotifications.requestPermission().then(syncPlan, () => {}) },
    ]);
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      // Bring finished expeditions home right away rather than on the app-wide check.
      const { save: current, resolveDue } = useGameStore.getState();
      if (current.expeditions.some((e) => e.endsAt <= Date.now())) resolveDue();
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useFocusEffect(useCallback(() => () => markReportsSeen(), [markReportsSeen]));

  const party = useMemo(
    () => selected.filter((id) => !isOnExpedition(save, id)).slice(0, partySize(save)),
    [selected, save],
  );

  // Today's open dungeons per unlocked tier, with their modifier; the tutorial's stays until it's done.
  const open = useMemo(() => {
    const ids = Object.values(rotation.tiers).flatMap((t) => [t.short, t.long, t.boss]);
    if (save.tutorial.step !== 'done' && !ids.includes(tutorialRules.firstExpedition.dungeonId)) {
      ids.unshift(tutorialRules.firstExpedition.dungeonId);
    }
    return ids
      .map((id) => withModifier(dungeonById[id], modifierFor(rotation, id)))
      .filter((d) => isDungeonUnlocked(save, d))
      .sort((a, b) => a.tier - b.tier);
  }, [rotation, save]);

  // Simulated runs per open dungeon; recomputed only when the party, the save or the rotation changes.
  const odds = useMemo(
    () => Object.fromEntries(open.map((d) => [d.id, estimateOdds(save, party, d)])),
    [save, party, open],
  );

  const focusedDungeon = open.find((d) => d.id === focused);
  const counters = (heroId: string) =>
    focusedDungeon ? countersFor(prepareParty(save, [heroId])[0].abilities, focusedDungeon) : [];

  /** Parties are capped: a hero can only join while there's room. */
  const toggle = (heroId: string) => {
    if (party.includes(heroId)) return setSelected((current) => current.filter((id) => id !== heroId));
    if (party.length >= partySize(save)) return;
    setSelected([...party, heroId]);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TutorialHint screen="expeditions" />
      {save.expeditions.length > 0 && <SectionTitle>{t('expeditions.underWay')}</SectionTitle>}
      {save.expeditions.map((expedition) => {
        const dungeon = dungeonById[expedition.dungeonId];
        const names = save.heroes.filter((h) => expedition.heroIds.includes(h.id)).map((h) => h.name);
        const progress = Math.min(1, Math.max(0, (now - expedition.startedAt) / (expedition.endsAt - expedition.startedAt)));
        const open = following === expedition.id;
        return (
          <Pressable
            key={expedition.id}
            onPress={() => setFollowing(open ? null : expedition.id)}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Row
              emoji={dungeon.emoji}
              title={tr(dungeon.name)}
              subtitle={names.join(', ')}
              right={formatDuration(expedition.endsAt - now)}
            />
            {open && (
              <View style={styles.progress}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
                </View>
                <Text style={styles.progressText}>
                  {progress >= 1 ? t('expeditions.comingHome') : t('expeditions.explored', { percent: formatPercent(progress) })}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}

      <SectionTitle>{t('expeditions.party', { count: party.length, max: partySize(save) })}</SectionTitle>
      <View style={styles.chips}>
        {save.heroes.map((hero) => {
          const away = isOnExpedition(save, hero.id);
          const active = party.includes(hero.id);
          const good = counters(hero.id);
          return (
            <Pressable
              key={hero.id}
              disabled={away}
              onPress={() => toggle(hero.id)}
              style={[styles.chip, active && styles.chipActive, away && styles.chipAway]}
            >
              <Text>
                {heroClasses[hero.classId].emoji} {hero.name}
                {away ? t('common.away') : ''}
              </Text>
              {good.length > 0 && (
                <Pressable
                  onPress={() => Alert.alert(t('expeditions.goodHereTitle', { name: hero.name }), good.map(abilityText).join('\n'))}
                  style={styles.goodHere}
                >
                  <Text style={styles.goodHereText}>{t('expeditions.goodHere')}</Text>
                </Pressable>
              )}
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.empty}>
        {t('expeditions.tapDungeon', { time: formatDuration(nextRotationAt(now) - now) })}
      </Text>
      {guildRank(save, 'scouting') > 0 && (
        <Button title={showTomorrow ? t('expeditions.hideTomorrow') : t('expeditions.tomorrow')} onPress={() => setShowTomorrow(!showTomorrow)} />
      )}
      {showTomorrow &&
        Object.entries(currentRotation(nextRotationAt(now)).tiers)
          .filter(([, slots]) => isDungeonUnlocked(save, dungeonById[slots.boss]))
          .map(([tier, slots]) => {
            const modifier = slots.modifier ? modifierById[slots.modifier.modifierId] : null;
            const name = (id: string) => `${dungeonById[id].emoji} ${tr(dungeonById[id].name)}`;
            return (
              <Text key={tier} style={styles.empty}>
                {t('expeditions.tomorrowLine', { tier, short: name(slots.short), long: name(slots.long) })}
                {modifier
                  ? t('expeditions.tomorrowModifier', {
                      modifier: `${modifier.emoji} ${tr(modifier.name)}`,
                      dungeon: tr(dungeonById[slots.modifier!.dungeonId].name),
                    })
                  : ''}
              </Text>
            );
          })}

      {open.map((dungeon, i) => {
        const chance = odds[dungeon.id].success;
        const available = isDungeonAvailable(save, dungeon, rotation);
        const modifier = modifierFor(rotation, dungeon.id);
        const tags = dungeonTags(dungeon);
        const fresh = dungeon.slot && !save.firstClears.includes(dungeon.id);
        return (
          <View key={dungeon.id}>
            {open[i - 1]?.tier !== dungeon.tier && <SectionTitle>{t('expeditions.tierDungeons', { tier: dungeon.tier })}</SectionTitle>}
            <Pressable
              onPress={() => setFocused(focused === dungeon.id ? null : dungeon.id)}
              style={[focused === dungeon.id && styles.focused]}
            >
              <Row
                emoji={dungeon.emoji}
                title={`${tr(dungeon.name)}${dungeon.isBoss ? t('expeditions.boss') : dungeon.slot === 'short' ? t('expeditions.short') : t('expeditions.long')}`}
                subtitle={[
                  [
                    formatDuration(expeditionMinutes(save, dungeon) * 60_000 * durationScale),
                    party.length === 0 ? null : `${formatPercent(chance)} · ${t(`odds.${oddsBand(chance)}`)}`,
                    available ? null : t('expeditions.afterTutorial'),
                  ]
                    .filter(Boolean)
                    .join(' · '),
                  tags.map((tag) => `${tagInfo[tag].emoji} ${tr(tagInfo[tag].name)}`).join('  '),
                  modifier ? `${modifier.emoji} ${tr(modifier.name)}: ${tr(modifier.description)}` : null,
                  fresh ? t('expeditions.neverCleared') : null,
                  dungeon.isBoss
                    ? t(bossBonusAvailable(save, dungeon.id, now) ? 'expeditions.bossBonusAvailable' : 'expeditions.bossBonusClaimed')
                    : null,
                ]
                  .filter(Boolean)
                  .join('\n')}
                right={
                  <Button
                    title={t('expeditions.send')}
                    disabled={!available || party.length === 0}
                    onPress={() => send(dungeon.id, party)}
                  />
                }
              />
            </Pressable>
          </View>
        );
      })}

      <SectionTitle>{t('expeditions.reports')}</SectionTitle>
      {save.reports.length === 0 && <Text style={styles.empty}>{t('expeditions.noReports')}</Text>}
      {save.reports.map((report) => {
        const dungeon = dungeonById[report.dungeonId];
        const loot = [
          report.gold > 0 ? `🪙 ${report.gold}` : null,
          ...report.materials.map((m) => `${materialById[m.materialId].emoji} ${m.amount}`),
          report.recipeId ? `📜 ${tr(recipeOutput(recipeById[report.recipeId]).name)}` : null,
          report.firstClear ? t('expeditions.firstClear', { gold: report.firstClear.gold }) : null,
          ...(report.mainRewards ?? []).map((reward) => {
            if (reward.kind === 'goldPouch') return `👛 +${reward.gold}`;
            if (reward.kind === 'sigil') return t('expeditions.sigil', { tier: reward.tier });
            if (reward.kind === 'treasureMap') return t('expeditions.treasureMap');
            if (reward.kind === 'mapGold') return `🗺️ +${reward.gold}`;
            if (reward.kind === 'shards') return `${materialById[shardId(reward.element)].emoji} ${reward.amount}`;
            return t('expeditions.lure');
          }),
          `+${report.xp} XP`,
        ]
          .filter(Boolean)
          .join('  ');
        return (
          <View key={report.id} style={[styles.report, !report.seen && styles.reportNew]}>
            <Text style={styles.reportTitle}>
              {dungeon.emoji} {tr(dungeon.name)} · {t(`expeditions.outcome.${report.outcome}`)} ({report.encountersCleared}/
              {report.encounterCount}){report.seen ? '' : t('expeditions.new')}
            </Text>
            {report.log.map((line, i) => (
              <Text key={i} style={styles.logLine}>
                {line}
              </Text>
            ))}
            <Text style={styles.loot}>{loot}</Text>
            <Text style={styles.hp}>
              {report.heroHp
                .map(({ heroId, hp, maxHp }) => t('expeditions.hp', { name: save.heroes.find((h) => h.id === heroId)?.name ?? heroId, hp, max: maxHp }))
                .join(' · ')}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 2, borderColor: '#3b2a1a', paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { backgroundColor: '#fff6a8' },
  chipAway: { opacity: 0.4 },
  goodHere: { marginTop: 4, alignSelf: 'flex-start', backgroundColor: '#2f7d32', borderRadius: 6, paddingHorizontal: 6 },
  goodHereText: { color: '#fff', fontSize: 12 },
  focused: { backgroundColor: '#fff6a8' },
  empty: { color: '#666', paddingVertical: 8 },
  report: { borderWidth: 2, borderColor: '#ccc', padding: 10, marginBottom: 10, gap: 4 },
  reportNew: { borderColor: '#c99a00', backgroundColor: '#fffbe6' },
  reportTitle: { fontWeight: '600', fontSize: 15 },
  logLine: { fontSize: 14 },
  loot: { marginTop: 4, color: '#3b2a1a' },
  hp: { color: '#666', fontSize: 13 },
  pressed: { opacity: 0.7 },
  progress: { paddingBottom: 10, gap: 4 },
  progressTrack: { height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#3b2a1a', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#c99a00' },
  progressText: { fontSize: 13, color: '#666' },
});
