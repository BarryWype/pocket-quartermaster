import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { SectionTitle } from '@/components/Row';
import { Text } from '@/components/Text';
import { guildBuildings, guildTrackById, guildTracks, type GuildBuildingId, type GuildTrack } from '@/content/guild';
import { materialById } from '@/content/lookup';
import { bossBeaten, guildRank, isGuildUnlocked, rankGate, rankPrice, rankProblem, type RankPrice, type RankProblem } from '@/game/guild/guild';
import type { MaterialStack } from '@/game/types';
import { useLanguage } from '@/hooks/useLanguage';
import { t, tr } from '@/i18n';
import { useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { colors, pixel } from '@/theme';

const materialsText = (materials: MaterialStack[]) =>
  materials.map(({ materialId, amount }) => `${amount} ${tr(materialById[materialId].name).toLowerCase()}`);

function problemText(problem: RankProblem) {
  switch (problem.kind) {
    case 'hallLocked':
      return t('guild.hallLocked');
    case 'maxed':
      return t('guild.maxed');
    case 'gate':
      return null;
    case 'requires':
      return t('guild.requires', { track: tr(guildTrackById[problem.track].name) });
    case 'missing': {
      const parts = [
        problem.gold ? t('guild.missingGold', { gold: problem.gold }) : null,
        ...materialsText(problem.materials),
      ].filter(Boolean);
      return t('guild.missing', { parts: parts.join(', ') });
    }
  }
}

/** The next rank's full cost; whatever the player is short of is in red. */
function PriceLine({ price }: { price: RankPrice }) {
  const save = useGameStore((state) => state.save);
  const parts = [
    { key: 'gold', text: `🪙 ${price.gold}`, short: save.gold < price.gold },
    ...price.materials.map(({ materialId, amount }) => ({
      key: materialId,
      text: `${materialById[materialId].emoji} ${amount} ${tr(materialById[materialId].name).toLowerCase()}`,
      short: (save.materials[materialId] ?? 0) < amount,
    })),
  ];
  return (
    <Text style={[styles.price, styles.priceLine]}>
      {parts.map((part, i) => (
        <Text key={part.key} style={part.short && styles.short}>
          {i > 0 ? ' · ' : ''}
          {part.text}
        </Text>
      ))}
    </Text>
  );
}

/** Gold upgrades: five buildings, each with a few tracks bought rank by rank, gated by tier bosses. */
export default function GuildScreen() {
  useLanguage();
  const save = useGameStore((state) => state.save);
  const buy = useGameStore((state) => state.buyRank);
  const gatesOpen = useDebugStore((state) => state.guildGatesOpen);
  const [justBought, setJustBought] = useState<string | null>(null);

  useEffect(() => {
    if (!justBought) return;
    const timer = setTimeout(() => setJustBought(null), 1500);
    return () => clearTimeout(timer);
  }, [justBought]);

  const purchase = (track: GuildTrack) => {
    buy(track.id);
    setJustBought(track.id);
  };

  const row = (track: GuildTrack) => {
    const rank = guildRank(save, track.id);
    const maxed = rank >= track.ranks;
    const problem = rankProblem(save, track.id, undefined, gatesOpen);
    const gated = Array.from({ length: track.ranks - rank }, (_, i) => rank + i + 1).filter((r) => !bossBeaten(save, rankGate(track, r)));
    return (
      <View key={track.id} style={[styles.track, justBought === track.id && styles.bought]}>
        <View style={styles.header}>
          <Text style={styles.name}>{tr(track.name)}</Text>
          <Text style={styles.dots}>{'■'.repeat(rank) + '□'.repeat(track.ranks - rank)}</Text>
        </View>
        <Text>{maxed ? track.describe(rank) : `${track.describe(rank)} → ${track.describe(rank + 1)}`}</Text>
        {maxed ? (
          <Text style={styles.price}>{t('guild.max')}</Text>
        ) : (
          <View style={styles.header}>
            <PriceLine price={rankPrice(track, rank + 1)} />
            <Button title={t('guild.buy')} disabled={problem !== null} onPress={() => purchase(track)} />
          </View>
        )}
        {problem && problem.kind !== 'maxed' && problem.kind !== 'missing' && problem.kind !== 'gate' && (
          <Text style={styles.problem}>{problemText(problem)}</Text>
        )}
        {gated.map((r) => (
          <Text key={r} style={styles.problem}>
            {t('guild.rankGate', { rank: r, tier: rankGate(track, r) })}
          </Text>
        ))}
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.wallet}>{t('guild.wallet', { gold: save.gold })}</Text>
      {!isGuildUnlocked(save) && <Text style={styles.problem}>{t('guild.hallLocked')}</Text>}
      {(Object.keys(guildBuildings) as GuildBuildingId[]).map((building) => (
        <View key={building}>
          <SectionTitle>{`${guildBuildings[building].emoji} ${tr(guildBuildings[building].name)}`}</SectionTitle>
          {guildTracks.filter((track) => track.building === building).map(row)}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 6 },
  wallet: { fontSize: 22 },
  track: { gap: 4, marginBottom: 8, padding: 10, borderWidth: pixel.outline, borderColor: colors.ink, backgroundColor: colors.parchment },
  bought: { backgroundColor: colors.highlight },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontSize: 21 },
  dots: { fontSize: 18, color: colors.wood, letterSpacing: 2 },
  muted: { color: colors.muted },
  price: { fontSize: 19, color: colors.ink },
  priceLine: { flex: 1 },
  short: { color: colors.danger },
  problem: { color: colors.muted, fontStyle: 'italic' },
});
