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
import { rosterRules } from '@/content/roster';
import { tagInfo } from '@/content/rotation';
import { countersFor } from '@/game/dungeons/counters';
import { modifierFor, nextRotationAt, rotationDay, withModifier } from '@/game/dungeons/rotation';
import { dungeonTags } from '@/game/dungeons/tags';
import { expeditionMinutes, isDungeonAvailable, isDungeonUnlocked } from '@/game/expeditions/expeditions';
import { estimateOdds, oddsBand } from '@/game/expeditions/odds';
import { prepareParty } from '@/game/expeditions/simulate';
import { isOnExpedition } from '@/game/team/team';
import type { ExpeditionOutcome } from '@/game/types';
import { syncPlan } from '@/hooks/useNotifications';
import { deviceNotifications } from '@/services/notifications';
import { currentRotation, debugEnabled, useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';

const OUTCOME_LABELS: Record<ExpeditionOutcome, string> = {
  flawless: 'Flawless',
  success: 'Success',
  retreat: 'Retreat',
  defeat: 'Defeat',
};

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

export default function ExpeditionsScreen() {
  const save = useGameStore((state) => state.save);
  const start = useGameStore((state) => state.startExpedition);
  const markReportsSeen = useGameStore((state) => state.markReportsSeen);
  const askedPermission = useSettingsStore((state) => state.askedNotificationPermission);
  const setSettings = useSettingsStore((state) => state.set);
  const fastExpeditions = useDebugStore((state) => debugEnabled(state) && state.fastExpeditions);
  const durationScale = fastExpeditions ? 1 / 60 : 1;
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState<string[]>(() =>
    save.heroes.filter((h) => !isOnExpedition(save, h.id)).slice(0, rosterRules.partySize).map((h) => h.id),
  );
  /** The expedition whose progress bar is open. */
  const [following, setFollowing] = useState<string | null>(null);
  /** The dungeon card tapped last: heroes who are good there get a badge. */
  const [focused, setFocused] = useState<string | null>(null);
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
    Alert.alert('Want to know when your team is back?', 'You can change this any time in Settings.', [
      { text: 'Not now', style: 'cancel' },
      { text: 'Yes', onPress: () => deviceNotifications.requestPermission().then(syncPlan, () => {}) },
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
    () => selected.filter((id) => !isOnExpedition(save, id)).slice(0, rosterRules.partySize),
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
    if (party.length >= rosterRules.partySize) return;
    setSelected([...party, heroId]);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TutorialHint screen="expeditions" />
      {save.expeditions.length > 0 && <SectionTitle>Under way</SectionTitle>}
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
              title={dungeon.name}
              subtitle={names.join(', ')}
              right={formatDuration(expedition.endsAt - now)}
            />
            {open && (
              <View style={styles.progress}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
                </View>
                <Text style={styles.progressText}>
                  {progress >= 1 ? 'Coming home…' : `${Math.round(progress * 100)}% explored`}
                </Text>
              </View>
            )}
          </Pressable>
        );
      })}

      <SectionTitle>{`Party (${party.length}/${rosterRules.partySize})`}</SectionTitle>
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
                {away ? ' (away)' : ''}
              </Text>
              {good.length > 0 && (
                <Pressable
                  onPress={() => Alert.alert(`${hero.name} is good here`, good.map(abilityText).join('\n'))}
                  style={styles.goodHere}
                >
                  <Text style={styles.goodHereText}>Good here</Text>
                </Pressable>
              )}
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.empty}>
        Tap a dungeon to see who is good there. New dungeons in {formatDuration(nextRotationAt(now) - now)}.
      </Text>

      {open.map((dungeon, i) => {
        const chance = odds[dungeon.id].success;
        const available = isDungeonAvailable(save, dungeon, rotation);
        const modifier = modifierFor(rotation, dungeon.id);
        const tags = dungeonTags(dungeon);
        const fresh = dungeon.slot && !save.firstClears.includes(dungeon.id);
        return (
          <View key={dungeon.id}>
            {open[i - 1]?.tier !== dungeon.tier && <SectionTitle>{`Tier ${dungeon.tier} dungeons`}</SectionTitle>}
            <Pressable
              onPress={() => setFocused(focused === dungeon.id ? null : dungeon.id)}
              style={[focused === dungeon.id && styles.focused]}
            >
              <Row
                emoji={dungeon.emoji}
                title={`${dungeon.name}${dungeon.isBoss ? ' (boss)' : dungeon.slot === 'short' ? ' (short)' : ' (long)'}`}
                subtitle={[
                  [
                    formatDuration(expeditionMinutes(save, dungeon) * 60_000 * durationScale),
                    party.length === 0 ? null : `${Math.round(chance * 100)}% · ${oddsBand(chance)}`,
                    available ? null : 'after the tutorial',
                  ]
                    .filter(Boolean)
                    .join(' · '),
                  tags.map((tag) => `${tagInfo[tag].emoji} ${tagInfo[tag].name}`).join('  '),
                  modifier ? `${modifier.emoji} ${modifier.name}: ${modifier.description}` : null,
                  fresh ? '✨ Never cleared: first-clear bonus' : null,
                ]
                  .filter(Boolean)
                  .join('\n')}
                right={
                  <Button
                    title="Send"
                    disabled={!available || party.length === 0}
                    onPress={() => send(dungeon.id, party)}
                  />
                }
              />
            </Pressable>
          </View>
        );
      })}

      <SectionTitle>Reports</SectionTitle>
      {save.reports.length === 0 && <Text style={styles.empty}>No expeditions have returned yet.</Text>}
      {save.reports.map((report) => {
        const dungeon = dungeonById[report.dungeonId];
        const loot = [
          report.gold > 0 ? `🪙 ${report.gold}` : null,
          ...report.materials.map((m) => `${materialById[m.materialId].emoji} ${m.amount}`),
          report.recipeId ? `📜 ${recipeOutput(recipeById[report.recipeId]).name}` : null,
          report.firstClear ? `✨ First clear +${report.firstClear.gold}` : null,
          ...(report.mainRewards ?? []).map((reward) => {
            if (reward.kind === 'goldPouch') return `👛 +${reward.gold}`;
            if (reward.kind === 'sigil') return `🎟️ Sigil T${reward.tier}`;
            if (reward.kind === 'treasureMap') return '🗺️ Treasure map';
            return '🪤 Lure';
          }),
          `+${report.xp} XP`,
        ]
          .filter(Boolean)
          .join('  ');
        return (
          <View key={report.id} style={[styles.report, !report.seen && styles.reportNew]}>
            <Text style={styles.reportTitle}>
              {dungeon.emoji} {dungeon.name} · {OUTCOME_LABELS[report.outcome]} ({report.encountersCleared}/
              {report.encounterCount}){report.seen ? '' : ' · NEW'}
            </Text>
            {report.log.map((line, i) => (
              <Text key={i} style={styles.logLine}>
                {line}
              </Text>
            ))}
            <Text style={styles.loot}>{loot}</Text>
            <Text style={styles.hp}>
              {report.heroHp
                .map(({ heroId, hp, maxHp }) => `${save.heroes.find((h) => h.id === heroId)?.name ?? heroId} ${hp}/${maxHp} HP`)
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
