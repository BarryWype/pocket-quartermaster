import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FillBar } from '@/components/motion';
import { Text } from '@/components/Text';
import { WoodButton } from '@/components/ui';
import { clockConfig } from '@/content/clockConfig';
import { heroClasses } from '@/content/heroes';
import { materialById } from '@/content/lookup';
import { supplyRules, tradeInfo } from '@/content/supplyLines';
import { distanceMeters } from '@/game/generation/geo';
import { tileCenter } from '@/game/generation/tiles';
import type { LatLng } from '@/game/generation/types';
import { mainAction } from '@/game/places/mainAction';
import { effectivePath, effectiveRoute } from '@/game/supply/autoRoute';
import { buildingEmoji, buildingNameKey, isLastDay, timeLeftShare } from '@/game/supply/buildings';
import { loopPreview } from '@/game/supply/cart';
import { orderPlaceName } from '@/game/supply/orders';
import { serves } from '@/game/supply/planner';
import { collectProblem } from '@/game/supply/postings';
import { buildingCap, buildingRateParts, buildingStockTotal, settleBuilding } from '@/game/supply/production';
import { tradeLevel } from '@/game/supply/trades';
import { tavernNameOf } from '@/game/taverns/taverns';
import { formatDistance, formatDuration, t, tr } from '@/i18n';
import { useNow } from '@/hooks/useNow';
import { feel } from '@/services/feel';
import { debugEnabled, useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
import { useWorldStore } from '@/store/worldStore';
import { colors, ui } from '@/theme';

import { MapSheet, mapSheetStatus, type MapSheetAction, type MapSheetSecondary, type MapSheetView } from './MapSheet';
import { GoodsRow, InfoRow, PortraitSlot, stars } from './network/networkBits';
import { PostHeroList } from './PostHeroList';
import { RaidBanner } from './RaidBanner';

type Props = { id: string; player: LatLng; onClose: () => void };

const HOUR = 3_600_000;
const round2 = (n: number) => String(Math.round(n * 100) / 100);

/**
 * A building on the map sheet template. The summary line says the three
 * things that matter: what it makes, how full it is, how often the cart calls.
 * The main action is the next useful step: post a hero, then add it to the
 * delivery route, then collect when the player is there. Tabs: Making, People
 * (the posted hero as a portrait slot that opens the hero picker), Details.
 */
export function SupplyCampPanel({ id, player, onClose }: Props) {
  const building = useGameStore((s) => s.save.supply.buildings.find((entry) => entry.id === id)) ?? null;
  const save = useGameStore((s) => s.save);
  const debugOn = useDebugStore(debugEnabled);
  const now = useNow(clockConfig.minutesMs);
  const [picking, setPicking] = useState(false);
  const noteTips = useGameStore((s) => s.noteTips);
  // The first time a building's sheet opens, its tip waits for the map.
  useEffect(() => {
    noteTips(['supplyBuildingSheet']);
  }, [noteTips]);
  if (!building) return null;

  const name = t(buildingNameKey[building.kind]);
  const settled = settleBuilding(save, building, now);
  const parts = buildingRateParts(save, building, now);
  const posted = settled.heroId ? (save.heroes.find((h) => h.id === settled.heroId) ?? null) : null;
  const stock = buildingStockTotal(settled);
  const cap = buildingCap(building);
  const full = stock >= cap;
  const closed = now < building.closedUntil;
  const last = isLastDay(building.expiresAt, now);
  const distance = distanceMeters(player, building.position);
  const range = supplyRules.production.collectMeters;
  const goods = Object.keys(supplyRules.buildings.kinds[building.kind].makes);
  const mainGood = tr(materialById[goods[0]]?.name ?? goods[0]).toLowerCase();

  // The route the cart drives next (a change mid-loop counts from the next departure).
  const cart = save.supply.cart;
  const route = effectiveRoute(save);
  const stopIndex = route.findIndex((point) => 'building' in point && point.building === building.id);
  const onRoute = stopIndex !== -1;
  const loopMinutes = onRoute ? Math.round(loopPreview(save, route, effectivePath(save), now).minutes) : 0;
  const nextCall = cart.loop?.events.find((event) => event.kind === 'building' && event.buildingId === building.id && event.at > now)?.at ?? null;
  // The places after it on the route that want what it makes.
  const goesTo = onRoute
    ? route.slice(stopIndex + 1).flatMap((point, i) => {
        if (!('place' in point)) return [];
        const order = save.supply.orders[point.place];
        return order && serves(order.wants, building.kind) ? [{ name: orderPlaceName(order, tavernNameOf), n: stopIndex + i + 2 }] : [];
      })
    : [];

  const making = closed
    ? t('networkSheet.building.closed', { time: formatDuration(building.closedUntil - now, false) })
    : full
      ? t('networkSheet.building.fullNothing')
      : t('networkSheet.building.making', { rate: round2(parts.rate), good: mainGood });
  const stored = t('networkSheet.building.stored', { n: stock, cap });
  const cartLine = !onRoute
    ? t('networkSheet.building.nothingCollects')
    : cart.loop
      ? t('networkSheet.building.callsEvery', { minutes: loopMinutes })
      : t('networkSheet.building.cartParked');

  const openRoute = (withThis: boolean) => {
    useMapPanels.getState().openRouteMode(withThis && !onRoute ? [...route, { building: building.id }] : route);
  };
  const recall = (heroId: string) => useGameStore.getState().recallPosted(heroId);
  const problem = collectProblem(save, building.id, player, now);

  const collect: MapSheetAction = {
    state: mainAction({ player, target: building.position, range, problem: problem === 'unknown' ? null : problem }),
    verb: t('networkSheet.building.collectVerb', { n: stock }),
    label: t('networkSheet.building.collect', { n: stock }),
    blockedLabel: t('supply.building.collectEmpty'),
    onPress: () => {
      useGameStore.getState().collectBuilding(building.id, player);
      feel('reward');
    },
    onWalk: () => useWorldStore.getState().set({ focusPlace: { latitude: building.position.latitude, longitude: building.position.longitude } }),
  };

  const action = (view: MapSheetView): MapSheetAction => {
    if (view.full && view.tab === 'people') {
      return {
        state: { kind: 'act' },
        verb: '',
        label: posted ? t('networkSheet.building.changeWorker') : t('supply.building.post'),
        onPress: () => setPicking(!picking),
      };
    }
    // In the last day, what is stored is lost unless collected: that comes before anything else.
    if (last && stock > 0) return collect;
    if (!posted) {
      return {
        state: { kind: 'act' },
        verb: '',
        label: t('supply.building.post'),
        onPress: () => {
          setPicking(true);
          view.open('people');
        },
      };
    }
    if (!onRoute) {
      return { state: { kind: 'act' }, verb: '', label: t('networkSheet.addToRoute'), onPress: () => openRoute(true) };
    }
    return collect;
  };

  const secondary = (view: MapSheetView): MapSheetSecondary[] => {
    if (view.full && view.tab === 'people') {
      return posted ? [{ key: 'recall', title: t('networkSheet.building.recall', { name: posted.name }), onPress: () => recall(posted.id) }] : [];
    }
    if (!onRoute && (!posted || (last && stock > 0))) return [{ key: 'route', title: t('networkSheet.addToRoute'), onPress: () => openRoute(true) }];
    if (onRoute) return [{ key: 'route', title: t('networkSheet.editRoute'), onPress: () => openRoute(false) }];
    return [];
  };

  const hall = save.supply.hall;
  const makingTab = () => (
    <View style={styles.tab}>
      <FillBar value={cap > 0 ? stock / cap : 0} />
      <Text style={styles.line}>
        {full
          ? `${stored} · ${t('networkSheet.building.makingNothing')}`
          : parts.rate > 0
            ? `${stored} · ${t('networkSheet.building.fullIn', { time: formatDuration(((cap - stock) / parts.rate) * HOUR, false) })}`
            : stored}
      </Text>
      <GoodsRow goods={settled.stock} size={20} />
      <InfoRow label={t('networkSheet.building.goesTo')}>
        {goesTo.length > 0
          ? goesTo.map((place) => t('networkSheet.building.goesToStop', { name: place.name, n: place.n })).join(', ')
          : onRoute
            ? t('networkSheet.building.goesHome')
            : t('networkSheet.building.notOnRoute')}
      </InfoRow>
      <InfoRow label={t('networkSheet.building.nextCall')}>
        {nextCall !== null
          ? t('networkSheet.building.in', { time: formatDuration(nextCall - now, false) })
          : onRoute
            ? t('networkSheet.building.cartParked')
            : t('networkSheet.building.youCollect')}
      </InfoRow>
    </View>
  );

  const peopleTab = () => (
    <View style={styles.tab}>
      <View style={styles.people}>
        <PortraitSlot
          emoji={posted ? heroClasses[posted.classId].emoji : undefined}
          icon={posted ? heroClasses[posted.classId].icon : undefined}
          accessibilityLabel={posted ? t('networkSheet.building.slotPosted', { name: posted.name }) : t('networkSheet.building.slotEmpty')}
          onPress={() => setPicking(!picking)}
        />
        <View style={styles.peopleText}>
          {posted ? (
            <>
              <Text style={styles.line}>{posted.name}</Text>
              <Text style={styles.muted}>
                {t('networkSheet.building.postedLine', {
                  trade: tr(tradeInfo[posted.trade.id].name),
                  level: tradeLevel(posted.trade.hours),
                  bonus: Math.round(parts.tradeBonus * 100),
                  rate: round2(parts.rate),
                  good: mainGood,
                })}
              </Text>
            </>
          ) : (
            <Text style={styles.muted}>
              {t('supply.building.localsLine', {
                share: Math.round(supplyRules.production.localsShare * 100),
                trade: tr(tradeInfo[supplyRules.matchingTrade[building.kind]].name),
                bonus: Math.round(supplyRules.production.tradeBonus[2] * 100),
              })}
            </Text>
          )}
        </View>
      </View>
      {picking && <PostHeroList building={settled} />}
    </View>
  );

  const detailsTab = () => (
    <View style={styles.tab}>
      <InfoRow label={t('networkSheet.building.ground')}>{t('networkSheet.building.groundLine', { stars: stars(building.quality), n: building.quality })}</InfoRow>
      {hall && <InfoRow label={t('networkSheet.fromHall')}>{formatDistance(distanceMeters(tileCenter(hall.cell), building.position))}</InfoRow>}
      <InfoRow label={t('networkSheet.leaves')}>{formatDuration(Math.max(0, building.expiresAt - now), false)}</InfoRow>
      <Text style={styles.muted}>{t('networkSheet.building.lifeRule')}</Text>
      {debugOn && (
        <View style={styles.debugRow}>
          <WoodButton compact title={t('supply.building.expireNow')} onPress={() => useGameStore.getState().debugExpireBuilding(building.id)} />
          <WoodButton compact title={t('supply.raid.debug')} onPress={() => useGameStore.getState().debugRaid(building.id)} />
        </View>
      )}
    </View>
  );

  return (
    <MapSheet
      onClose={onClose}
      emoji={buildingEmoji[building.kind]}
      ring={{ kind: 'time', left: timeLeftShare(building.builtAt, building.expiresAt, now), last }}
      title={name}
      status={`${stars(building.quality)} · ${mapSheetStatus({ distance, range, expiresAt: building.expiresAt, now })}`}
      summary={
        <View style={styles.summary}>
          <Text style={styles.summaryLine}>{[making, stored, cartLine].join(' · ')}</Text>
          <RaidBanner buildingId={building.id} />
          {last && (
            <View style={styles.lastDay}>
              <Text style={styles.lastDayText}>
                {posted
                  ? `${t('supply.building.lastDayLoss')} ${t('supply.building.lastDayHero', { hero: posted.name })}`
                  : t('supply.building.lastDayLoss')}
              </Text>
            </View>
          )}
        </View>
      }
      action={action}
      secondary={secondary}
      tabs={[
        { key: 'making', label: t('networkSheet.building.tabs.making'), render: makingTab },
        { key: 'people', label: t('networkSheet.building.tabs.people'), render: peopleTab },
        { key: 'details', label: t('networkSheet.tabs.details'), render: detailsTab },
      ]}
      inRange={distance <= range}
    />
  );
}

const styles = StyleSheet.create({
  summary: { gap: 8 },
  summaryLine: { color: ui.ink, fontSize: 18 },
  tab: { gap: 10 },
  line: { color: ui.ink },
  muted: { color: ui.inkMuted, fontSize: 16 },
  people: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  peopleText: { flex: 1, gap: 2 },
  lastDay: { padding: 8, borderWidth: 2, borderColor: colors.danger, backgroundColor: ui.parchmentShade },
  lastDayText: { color: ui.ink },
  debugRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
