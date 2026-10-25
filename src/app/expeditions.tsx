import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Row, SectionTitle } from '@/components/Row';
import { Text } from '@/components/Text';
import { TutorialHint } from '@/components/TutorialHint';
import { dungeons } from '@/content/dungeons';
import { heroClasses } from '@/content/heroes';
import { dungeonById, materialById, recipeById, recipeOutput } from '@/content/lookup';
import { expeditionMinutes, isDungeonAvailable, isDungeonUnlocked } from '@/game/expeditions/expeditions';
import { estimateOdds, oddsBand } from '@/game/expeditions/odds';
import { isOnExpedition } from '@/game/team/team';
import type { ExpeditionOutcome } from '@/game/types';
import { useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';

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
  const fastExpeditions = useDebugStore((state) => state.fastExpeditions);
  const durationScale = __DEV__ && fastExpeditions ? 1 / 60 : 1;
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState<string[]>(save.heroes.map((h) => h.id));
  /** The expedition whose progress bar is open. */
  const [following, setFollowing] = useState<string | null>(null);

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

  const party = useMemo(() => selected.filter((id) => !isOnExpedition(save, id)), [selected, save]);

  // Simulated runs per unlocked dungeon; recomputed only when the party or the save changes.
  const odds = useMemo(
    () =>
      Object.fromEntries(
        dungeons.filter((d) => isDungeonUnlocked(save, d)).map((d) => [d.id, estimateOdds(save, party, d)]),
      ),
    [save, party],
  );

  const toggle = (heroId: string) =>
    setSelected((current) => (current.includes(heroId) ? current.filter((id) => id !== heroId) : [...current, heroId]));

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

      <SectionTitle>Party</SectionTitle>
      <View style={styles.chips}>
        {save.heroes.map((hero) => {
          const away = isOnExpedition(save, hero.id);
          const active = !away && selected.includes(hero.id);
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
            </Pressable>
          );
        })}
      </View>

      {dungeons
        .filter((dungeon) => isDungeonUnlocked(save, dungeon))
        .map((dungeon, i, unlocked) => {
          const chance = odds[dungeon.id].success;
          const available = isDungeonAvailable(save, dungeon);
          const element =
            dungeon.boss.element ?? dungeon.encounters.flatMap((e) => (e.type === 'trap' && e.element ? [e.element] : []))[0];
          return (
            <View key={dungeon.id}>
              {unlocked[i - 1]?.tier !== dungeon.tier && <SectionTitle>{`Tier ${dungeon.tier} dungeons`}</SectionTitle>}
              <Row
                emoji={dungeon.emoji}
                title={dungeon.isBoss ? `${dungeon.name} (boss)` : dungeon.name}
                subtitle={[
                  formatDuration(expeditionMinutes(save, dungeon) * 60_000 * durationScale),
                  party.length === 0 ? null : `${Math.round(chance * 100)}% · ${oddsBand(chance)}`,
                  element ? `${element} damage` : null,
                  available ? null : 'after the tutorial',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                right={
                  <Button
                    title="Send"
                    disabled={!available || party.length === 0}
                    onPress={() => start(dungeon.id, party, durationScale)}
                  />
                }
              />
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
