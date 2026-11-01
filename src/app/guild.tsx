import { Fragment, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import PagerView from 'react-native-pager-view';

import { IconLabel } from '@/components/IconLabel';
import { Text } from '@/components/Text';
import { guildBuildings, guildTrackById, guildTracks, type GuildBuildingId, type GuildTrack } from '@/content/guild';
import { materialById } from '@/content/lookup';
import { guildRank, isGuildUnlocked, rankGate, rankPrice, rankProblem } from '@/game/guild/guild';
import type { MaterialStack } from '@/game/types';
import { useLanguage } from '@/hooks/useLanguage';
import { t, tr } from '@/i18n';
import { useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { fonts, ui } from '@/theme';
import { priceLabel } from '@/components/PriceTag';

import { DiamondRail, EmberButton, ParchmentCard, type RailItem } from '@/components/ui';

const BUILDINGS = Object.keys(guildBuildings) as GuildBuildingId[];

const materialsText = (materials: MaterialStack[]) =>
  materials.map(({ materialId, amount }) => `${amount} ${tr(materialById[materialId].name).toLowerCase()}`);

/** The next rank's full cost; whatever the player is short of is in red. */
function PriceLine({ price }: { price: ReturnType<typeof rankPrice> }) {
  const save = useGameStore((state) => state.save);
  const parts = [
    { key: 'gold', emoji: undefined, text: priceLabel(price.gold), short: save.gold < price.gold },
    ...price.materials.map(({ materialId, amount }) => ({
      key: materialId,
      emoji: materialById[materialId].emoji,
      text: `${amount} ${tr(materialById[materialId].name).toLowerCase()}`,
      short: (save.materials[materialId] ?? 0) < amount,
    })),
  ];
  return (
    <View style={styles.priceLineRow}>
      {parts.map((part, i) => (
        <Fragment key={part.key}>
          {part.emoji ? (
            <IconLabel emoji={part.emoji} label={part.text} size={18} labelStyle={[styles.price, part.short && styles.short]} />
          ) : (
            <Text style={[styles.price, part.short && styles.short]}>{part.text}</Text>
          )}
          {i > 0 ? <Text style={styles.price}> · </Text> : null}
        </Fragment>
      ))}
    </View>
  );
}

/** A rank pip: a small brass-filled diamond when bought, parchment when not. */
function RankPip({ on }: { on: boolean }) {
  return <View style={[styles.pip, on && styles.pipOn]} />;
}

/** One upgrade: rank diamonds, the current and next effect, then the cost with Buy or a locked note. */
function UpgradeCard({ track, onBuy }: { track: GuildTrack; onBuy: () => void }) {
  const save = useGameStore((state) => state.save);
  const gatesOpen = useDebugStore((state) => state.guildGatesOpen);
  const rank = guildRank(save, track.id);
  const maxed = rank >= track.ranks;
  const problem = rankProblem(save, track.id, undefined, gatesOpen);
  const locked = !maxed && (problem?.kind === 'gate' || problem?.kind === 'requires');
  const missing = !maxed && !locked && problem?.kind === 'missing';
  const lockedText =
    problem?.kind === 'requires'
      ? t('guild.requires', { track: tr(guildTrackById[problem.track].name) })
      : !maxed
        ? t('guild.rankGate', { rank: rank + 1, tier: rankGate(track, rank + 1) })
        : null;
  return (
    <ParchmentCard style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.name}>{tr(track.name)}</Text>
        <View style={styles.pips}>
          {Array.from({ length: track.ranks }, (_, i) => (
            <RankPip key={i} on={i < rank} />
          ))}
        </View>
      </View>
      <Text style={styles.effect}>
        <Text style={styles.effectLabel}>{t('guild.now')} </Text>
        {track.describe(rank)}
      </Text>
      {!maxed && (
        <Text style={styles.effect}>
          <Text style={styles.effectLabel}>{t('guild.next')} </Text>
          <Text style={styles.next}>{track.describe(rank + 1)}</Text>
        </Text>
      )}
      {maxed ? (
        <Text style={styles.maxed}>{t('guild.max')}</Text>
      ) : locked ? (
        <Text style={styles.lockedNote}>{lockedText}</Text>
      ) : (
        <View style={styles.buyRow}>
          <View style={styles.priceWrap}>
            <PriceLine price={rankPrice(track, rank + 1)} />
          </View>
          <EmberButton title={t('guild.buy')} compact disabled={problem !== null} onPress={onBuy} />
        </View>
      )}
      {missing && problem.kind === 'missing' && (
        <Text style={styles.problem}>
          {t('guild.missing', {
            parts: [
              problem.gold ? t('guild.missingGold', { gold: problem.gold }) : null,
              ...materialsText(problem.materials),
            ]
              .filter(Boolean)
              .join(', '),
          })}
        </Text>
      )}
    </ParchmentCard>
  );
}

/** Gold upgrades: five buildings on a rail, each with a few tracks bought rank by rank, gated by tier bosses. */
export default function GuildScreen() {
  useLanguage();
  const save = useGameStore((state) => state.save);
  const buy = useGameStore((state) => state.buyRank);
  const [building, setBuilding] = useState<GuildBuildingId>('warRoom');
  const pager = useRef<PagerView>(null);

  const railItems: RailItem[] = BUILDINGS.map((id) => ({
    key: id,
    label: tr(guildBuildings[id].name),
    emoji: guildBuildings[id].emoji,
  }));

  if (!isGuildUnlocked(save)) {
    return (
      <View style={styles.lockedScreen}>
        <ParchmentCard style={styles.lockedCard}>
          <Text style={styles.lockedText}>{t('guild.hallLocked')}</Text>
        </ParchmentCard>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.body}>
        <DiamondRail
          items={railItems}
          selected={building}
          onSelect={(key) => {
            pager.current?.setPage(BUILDINGS.indexOf(key as GuildBuildingId));
            setBuilding(key as GuildBuildingId);
          }}
        />
        <PagerView
          style={styles.pager}
          initialPage={0}
          onPageSelected={({ nativeEvent }) => setBuilding(BUILDINGS[nativeEvent.position])}
        >
          {BUILDINGS.map((id) => (
            <View key={id} collapsable={false}>
              <ScrollView style={styles.content} contentContainerStyle={styles.page}>
                <View>
                  <Text style={styles.pageTitle}>{tr(guildBuildings[id].name)}</Text>
                  <Text style={styles.pageSub}>{t(`guild.sub.${id}`)}</Text>
                </View>
                {guildTracks
                  .filter((track) => track.building === id)
                  .map((track) => (
                    <UpgradeCard key={track.id} track={track} onBuy={() => buy(track.id)} />
                  ))}
              </ScrollView>
            </View>
          ))}
        </PagerView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.woodDark },
  body: { flex: 1, flexDirection: 'row' },
  pager: { flex: 1 },
  content: { flex: 1, backgroundColor: ui.woodDark },
  page: { paddingVertical: 14, paddingHorizontal: 14, gap: 12 },
  lockedScreen: { flex: 1, backgroundColor: ui.woodDark, alignItems: 'center', justifyContent: 'center', padding: 16 },
  lockedCard: { alignSelf: 'center', width: '100%' },
  lockedText: { fontFamily: fonts.serif, fontSize: 15, color: ui.ink },
  pageTitle: { fontSize: 21, color: ui.brassLight },
  pageSub: { fontFamily: fonts.serif, fontSize: 13, color: ui.onWoodMuted },
  card: { gap: 7 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 21, lineHeight: 24, color: ui.ink },
  pips: { flexDirection: 'row', gap: 10 },
  pip: { width: 11, height: 11, transform: [{ rotate: '45deg' }], borderWidth: 2, borderColor: ui.outline, backgroundColor: ui.parchmentShade },
  pipOn: { backgroundColor: ui.brass },
  effect: { fontFamily: fonts.serif, fontSize: 14, color: ui.ink },
  effectLabel: { fontFamily: fonts.serif, fontSize: 14, color: ui.inkMuted },
  next: { fontFamily: fonts.serifBold, color: ui.good },
  maxed: { fontFamily: fonts.serifBold, fontSize: 14, color: ui.inkMuted },
  buyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceWrap: { flex: 1 },
  priceLineRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  price: { fontFamily: fonts.serifBold, fontSize: 15, color: ui.ink },
  short: { color: ui.bad },
  lockedNote: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: ui.brassDim,
    backgroundColor: ui.parchmentShade,
    fontFamily: fonts.serifBold,
    fontSize: 13,
    color: ui.inkMuted,
  },
  problem: { fontFamily: fonts.serif, fontSize: 13, color: ui.inkMuted, fontStyle: 'italic' },
});
