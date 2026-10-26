import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { SectionTitle } from '@/components/Row';
import { Text } from '@/components/Text';
import { guildBuildings, guildTrackById, guildTracks, type GuildBuildingId, type GuildTrack } from '@/content/guild';
import { materialById } from '@/content/lookup';
import { guildRank, isGuildUnlocked, rankPrice, rankProblem, type RankPrice, type RankProblem } from '@/game/guild/guild';
import type { MaterialStack } from '@/game/types';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

const materialsText = (materials: MaterialStack[]) =>
  materials.map(({ materialId, amount }) => `${amount} ${materialById[materialId].name.toLowerCase()}`);

const priceText = (price: RankPrice) =>
  [`🪙 ${price.gold}`, ...materialsText(price.materials), price.charters ? `📜 ${price.charters} charter` : null]
    .filter(Boolean)
    .join(' · ');

function problemText(problem: RankProblem) {
  switch (problem.kind) {
    case 'hallLocked':
      return 'Beat the Bandit Stockade to open the Guild Hall.';
    case 'maxed':
      return 'Maxed';
    case 'gate':
      return `Beat the ${problem.boss} to unlock.`;
    case 'requires':
      return `Needs ${guildTrackById[problem.track].name} first.`;
    case 'missing': {
      const parts = [
        problem.gold ? `${problem.gold} gold` : null,
        ...materialsText(problem.materials),
        problem.charters ? `${problem.charters} charter` : null,
      ].filter(Boolean);
      return `Missing ${parts.join(', ')}.`;
    }
  }
}

/** Gold upgrades: three buildings, each with a few tracks bought rank by rank. */
export default function GuildScreen() {
  const save = useGameStore((state) => state.save);
  const buy = useGameStore((state) => state.buyRank);
  const [justBought, setJustBought] = useState<string | null>(null);

  useEffect(() => {
    if (!justBought) return;
    const timer = setTimeout(() => setJustBought(null), 1500);
    return () => clearTimeout(timer);
  }, [justBought]);

  const purchase = (track: GuildTrack) => {
    const done = () => {
      buy(track.id);
      setJustBought(track.id);
    };
    if (!track.milestone) return done();
    const price = rankPrice(track, guildRank(save, track.id) + 1);
    Alert.alert(`Buy ${track.name}?`, `${track.describe(1)}. Costs ${priceText(price)}. Purchases are permanent.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Buy', onPress: done },
    ]);
  };

  const row = (track: GuildTrack) => {
    const rank = guildRank(save, track.id);
    const maxed = rank >= track.ranks;
    const problem = rankProblem(save, track.id);
    return (
      <View key={track.id} style={[styles.track, justBought === track.id && styles.bought]}>
        <View style={styles.header}>
          <Text style={styles.name}>
            {track.milestone ? '⭐ ' : ''}
            {track.name}
          </Text>
          <Text style={styles.dots}>{'●'.repeat(rank) + '○'.repeat(track.ranks - rank)}</Text>
        </View>
        <Text>{maxed ? track.describe(rank) : `${track.describe(rank)} → ${track.describe(rank + 1)}`}</Text>
        {!maxed && (
          <View style={styles.header}>
            <Text style={styles.muted}>{priceText(rankPrice(track, rank + 1))}</Text>
            <Button title="Buy" disabled={problem !== null} onPress={() => purchase(track)} />
          </View>
        )}
        {problem && problem.kind !== 'maxed' && <Text style={styles.problem}>{problemText(problem)}</Text>}
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.wallet}>
        🪙 {save.gold} gold · 📜 {save.charters} charter{save.charters === 1 ? '' : 's'}
      </Text>
      {!isGuildUnlocked(save) && <Text style={styles.problem}>Beat the Bandit Stockade to open the Guild Hall.</Text>}
      <Text style={styles.muted}>
        Charters come from the first win against each tier boss, and sometimes from Sanctum wins.
      </Text>
      {(Object.keys(guildBuildings) as GuildBuildingId[]).map((building) => (
        <View key={building}>
          <SectionTitle>{`${guildBuildings[building].emoji} ${guildBuildings[building].name}`}</SectionTitle>
          {guildTracks.filter((t) => t.building === building).map(row)}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 6 },
  wallet: { fontSize: 18 },
  track: { gap: 4, paddingVertical: 10, paddingHorizontal: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.muted },
  bought: { backgroundColor: colors.highlight, borderRadius: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontSize: 17 },
  dots: { fontSize: 14, color: colors.wood, letterSpacing: 2 },
  muted: { color: colors.muted },
  problem: { color: colors.muted, fontStyle: 'italic' },
});
