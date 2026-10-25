import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { Row, SectionTitle } from '@/components/Row';
import { Text } from '@/components/Text';
import { dungeons } from '@/content/dungeons';
import { heroClasses } from '@/content/heroes';
import { dungeonById, itemById, materialById, recipeById } from '@/content/lookup';
import { successChance, teamPower } from '@/game/expeditions/expeditions';
import { isOnExpedition } from '@/game/team/team';
import { useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';

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

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useFocusEffect(useCallback(() => () => markReportsSeen(), [markReportsSeen]));

  const available = save.heroes.filter((h) => !isOnExpedition(save, h.id));
  const party = selected.filter((id) => available.some((h) => h.id === id));
  const toggle = (heroId: string) =>
    setSelected((current) => (current.includes(heroId) ? current.filter((id) => id !== heroId) : [...current, heroId]));

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {save.expeditions.length > 0 && <SectionTitle>Under way</SectionTitle>}
      {save.expeditions.map((expedition) => {
        const dungeon = dungeonById[expedition.dungeonId];
        const names = save.heroes.filter((h) => expedition.heroIds.includes(h.id)).map((h) => h.name);
        return (
          <Row
            key={expedition.id}
            emoji={dungeon.emoji}
            title={dungeon.name}
            subtitle={names.join(', ')}
            right={formatDuration(expedition.endsAt - now)}
          />
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

      <SectionTitle>Dungeons</SectionTitle>
      {dungeons.map((dungeon) => {
        const chance = party.length > 0 ? successChance(teamPower(save, party, dungeon), dungeon.difficulty) : 0;
        return (
          <Row
            key={dungeon.id}
            emoji={dungeon.emoji}
            title={dungeon.name}
            subtitle={[
              formatDuration(dungeon.durationMinutes * 60_000 * durationScale),
              `${Math.round(chance * 100)}% success`,
              dungeon.hazard ? `${dungeon.hazard} hazard` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            right={
              <Button title="Send" disabled={party.length === 0} onPress={() => start(dungeon.id, party, durationScale)} />
            }
          />
        );
      })}

      <SectionTitle>Reports</SectionTitle>
      {save.reports.length === 0 && <Text style={styles.empty}>No expeditions have returned yet.</Text>}
      {save.reports.map((report) => {
        const dungeon = dungeonById[report.dungeonId];
        const loot = [
          report.gold > 0 ? `🪙 ${report.gold}` : null,
          ...report.materials.map((m) => `${materialById[m.materialId].emoji} ${m.amount}`),
          report.recipeId ? `📜 ${itemById[recipeById[report.recipeId].itemId].name}` : null,
          `+${report.xp} XP`,
        ]
          .filter(Boolean)
          .join('  ');
        return (
          <View key={report.id} style={[styles.report, !report.seen && styles.reportNew]}>
            <Text style={styles.reportTitle}>
              {dungeon.emoji} {dungeon.name} · {report.success ? 'Success' : 'Failure'}
              {report.seen ? '' : ' · NEW'}
            </Text>
            {report.log.map((line, i) => (
              <Text key={i} style={styles.logLine}>
                {line}
              </Text>
            ))}
            <Text style={styles.loot}>{loot}</Text>
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
});
