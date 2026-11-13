import { Fragment, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import PagerView from 'react-native-pager-view';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { IconLabel } from '@/components/IconLabel';
import { Price } from '@/components/Price';
import { Text } from '@/components/Text';
import { guildBuildings, guildTrackById, guildTracks, type GuildBuildingId, type GuildTrack } from '@/content/guild';
import { materialById } from '@/content/lookup';
import { guildRank, isGuildUnlocked, rankGate, rankPrice, rankProblem } from '@/game/guild/guild';
import type { MaterialStack } from '@/game/types';
import { useLanguage } from '@/hooks/useLanguage';
import type { MotionLevel } from '@/content/motion';
import { useLiveChange } from '@/hooks/useLiveChange';
import { spring, timing, useMotion } from '@/hooks/useMotion';
import { t, tr } from '@/i18n';
import { useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { fonts, ui } from '@/theme';

import { Deferred, DiamondRail, EmberButton, GhostScreen, ParchmentCard, useLazyPages, type RailItem } from '@/components/ui';
import { timed } from '@/components/timed';

const BUILDINGS = Object.keys(guildBuildings) as GuildBuildingId[];

const materialsText = (materials: MaterialStack[]) =>
  materials.map(({ materialId, amount }) => `${amount} ${tr(materialById[materialId].name).toLowerCase()}`);

/** The next rank's full cost; whatever the player is short of is in red. */
function PriceLine({ price }: { price: ReturnType<typeof rankPrice> }) {
  const save = useGameStore((state) => state.save);
  return (
    <View style={styles.priceLineRow}>
      <Price amount={price.gold} short={save.gold < price.gold} size={18} textStyle={styles.price} />
      {price.materials.map(({ materialId, amount }) => {
        const short = (save.materials[materialId] ?? 0) < amount;
        return (
          <Fragment key={materialId}>
            <Text style={styles.price}> · </Text>
            <IconLabel
              emoji={materialById[materialId].emoji}
              icon={materialById[materialId].icon}
              label={`${amount} ${tr(materialById[materialId].name).toLowerCase()}`}
              size={18}
              labelStyle={[styles.price, short && styles.short]}
            />
          </Fragment>
        );
      })}
    </View>
  );
}

/**
 * A rank pip: a small brass-filled diamond when bought, parchment when not.
 * Bought on screen, its brass pops in (Full) or fades in (Reduced); only then
 * is an animated view mounted, so the guild's many pips cost plain views.
 */
function RankPip({ on }: { on: boolean }) {
  const { level } = useMotion();
  const change = useLiveChange(on ? 1 : 0);
  if (!change.live || !on || level === 'off') return <View style={[styles.pip, on && styles.pipOn]} />;
  return <FillingPip key={change.changes} level={level} />;
}

function FillingPip({ level }: { level: MotionLevel }) {
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.set(level === 'full' ? withSpring(1, spring('pop')) : withTiming(1, timing('small')));
    // It fills once, when the purchase mounts it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const filling = useAnimatedStyle(() => (level === 'full' ? { transform: [{ scale: fill.value }] } : { opacity: fill.value }));
  return (
    <View style={styles.pip}>
      <Animated.View style={[styles.pipFill, filling]} />
    </View>
  );
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

/** The guild buildings as rail items, shared by the content and the ghost's first frame. */
export function guildRailItems(): RailItem[] {
  return BUILDINGS.map((id) => ({
    key: id,
    label: tr(guildBuildings[id].name),
    emoji: guildBuildings[id].emoji,
  }));
}

/** Gold upgrades: five buildings on a rail, each with a few tracks bought rank by rank, gated by tier bosses. */
function GuildScreen() {
  useLanguage();
  const save = useGameStore((state) => state.save);
  if (!isGuildUnlocked(save)) {
    return (
      <View style={styles.lockedScreen}>
        <ParchmentCard style={styles.lockedCard}>
          <Text style={styles.lockedText}>{t('guild.hallLocked')}</Text>
        </ParchmentCard>
      </View>
    );
  }
  const railItems = guildRailItems();
  return (
    <Deferred
      name="guild"
      ghost={<GhostScreen variant="cards" rail={<DiamondRail items={railItems} selected="warRoom" onSelect={() => {}} />} />}
    >
      <GuildContent />
    </Deferred>
  );
}

function GuildContent() {
  const buy = useGameStore((state) => state.buyRank);
  const [building, setBuilding] = useState<GuildBuildingId>('warRoom');
  const pager = useRef<PagerView>(null);
  const railItems = guildRailItems();

  const pagerPages = useLazyPages({
    keys: BUILDINGS,
    active: building,
    variant: 'cards',
    render: (id) => (
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
    ),
  });

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
          ref={pager}
          style={styles.pager}
          initialPage={0}
          onPageSelected={({ nativeEvent }) => setBuilding(BUILDINGS[nativeEvent.position])}
        >
          {pagerPages}
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
  pipFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: ui.brass },
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

export default timed('screen: guild', GuildScreen);
