import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FillBar, PressScale } from '@/components/motion';

import { Text } from '@/components/Text';
import { IconLabel } from '@/components/IconLabel';
import { LootGrid } from '@/components/LootGrid';
import { ParchmentCard, WoodButton } from '@/components/ui';
import { clockConfig } from '@/content/clockConfig';
import { placeInfo } from '@/content/places';
import { supplyRules } from '@/content/supplyLines';
import { distanceMeters } from '@/game/generation/geo';
import { tileCenter } from '@/game/generation/tiles';
import { lootTiles } from '@/game/loot/tiles';
import { routePreview } from '@/game/supply/cart';
import { buildingEmoji, buildingNameKey, isLastDay } from '@/game/supply/buildings';
import { orderPlaceName, orderProgress, type Order } from '@/game/supply/orders';
import { buildingCap, buildingStockTotal, settleBuilding } from '@/game/supply/production';
import type { Building } from '@/game/supply/types';
import { tavernNameOf } from '@/game/taverns/taverns';
import { formatDistance, formatDuration, formatPercent, t } from '@/i18n';
import { raidText } from '@/hooks/useCartTick';
import { useNow } from '@/hooks/useNow';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';
import { ui } from '@/theme';

import { SupplyCampPanel } from './SupplyCampPanel';
import { SupplyCartPanel } from './SupplyCartPanel';
import { RaidBanner } from './RaidBanner';

/** A landed raid's outcome stays on the tab this long. */
const LAST_RAID_SHOWN_MS = 24 * 3_600_000;

/** The Expeditions screen's Network tab: the hall, every building's line of numbers, and the cart. */
export function NetworkTab() {
  const save = useGameStore((s) => s.save);
  const player = useWorldStore((s) => s.player);
  const now = useNow(clockConfig.minutesMs);
  const hall = save.supply.hall;
  const buildings = save.supply.buildings;
  const [cartOpen, setCartOpen] = useState(false);
  const [openBuilding, setOpenBuilding] = useState<string | null>(null);

  const lastRaid = save.supply.raidLog.at(-1);
  const orders = Object.values(save.supply.orders).sort((a, b) => a.expiresAt - b.expiresAt);
  // Whatever is in its last day leaves the two lists below and comes first, soonest at the top.
  const leaving = [
    ...buildings.filter((building) => isLastDay(building.expiresAt, now)).map((building) => ({
      expiresAt: building.expiresAt,
      card: <BuildingCard key={building.id} building={building} now={now} onOpen={() => setOpenBuilding(building.id)} />,
    })),
    ...orders
      .filter((order) => isLastDay(order.expiresAt, now))
      .map((order) => ({ expiresAt: order.expiresAt, card: <OrderCard key={order.placeId} order={order} now={now} /> })),
  ].sort((a, b) => a.expiresAt - b.expiresAt);
  const stayingBuildings = buildings.filter((building) => !isLastDay(building.expiresAt, now));
  const stayingOrders = orders.filter((order) => !isLastDay(order.expiresAt, now));

  return (
    <View style={styles.body}>
      <RaidBanner />
      {lastRaid && now - lastRaid.landsAt < LAST_RAID_SHOWN_MS && (
        <Text style={styles.line}>{`${raidText(lastRaid)} (${t('supply.cart.ago', { time: formatDuration(now - lastRaid.landsAt, false) })})`}</Text>
      )}
      {hall ? (
        <ParchmentCard title={t('supply.network.hall')} titleEmoji="🏠" contentStyle={styles.card}>
          {player && (
            <Text style={styles.line}>
              {t('supply.network.hallDistance', { distance: formatDistance(distanceMeters(player, tileCenter(hall.cell))) })}
            </Text>
          )}
        </ParchmentCard>
      ) : (
        <Text style={styles.line}>{t('supply.network.noHall')}</Text>
      )}
      {leaving.length > 0 && (
        <>
          <IconLabel emoji="⏳" label={t('supply.network.leavingSoonest')} labelStyle={styles.sectionTitle} />
          {leaving.map(({ card }) => card)}
        </>
      )}
      {buildings.length === 0 ? (
        <Text style={styles.line}>{t('supply.network.empty')}</Text>
      ) : (
        stayingBuildings.map((building) => (
          <BuildingCard key={building.id} building={building} now={now} onOpen={() => setOpenBuilding(building.id)} />
        ))
      )}
      <Text style={styles.sectionTitle}>{t('supply.order.places')}</Text>
      {orders.length === 0 ? (
        <Text style={styles.line}>{t('supply.order.empty')}</Text>
      ) : (
        stayingOrders.map((order) => <OrderCard key={order.placeId} order={order} now={now} />)
      )}
      <CartCard now={now} onOpen={() => setCartOpen(true)} />
      {cartOpen && <SupplyCartPanel onClose={() => setCartOpen(false)} />}
      {/* The building sheet wants the player's position; the hall's centre stands in while the map has none. */}
      {openBuilding && (player ?? (save.supply.hall ? tileCenter(save.supply.hall.cell) : null)) && (
        <SupplyCampPanel id={openBuilding} player={player ?? tileCenter(save.supply.hall!.cell)} onClose={() => setOpenBuilding(null)} />
      )}
    </View>
  );
}

/** The cart's card: where it is, its route in one line, its crew, and the way into its sheet. */
function CartCard({ now, onOpen }: { now: number; onOpen: () => void }) {
  const save = useGameStore((s) => s.save);
  const cart = save.supply.cart;
  const stops = cart.route.filter((point) => 'building' in point && save.supply.buildings.some((building) => building.id === point.building)).length;
  const preview = routePreview(save, cart.route, now);
  const crew = [cart.crew.driver, ...cart.crew.escorts]
    .map((id) => save.heroes.find((hero) => hero.id === id)?.name)
    .filter((name): name is string => !!name);
  const status = cart.loop
    ? t('supply.cart.running', { n: cart.loop.n, time: formatDuration(Math.max(0, cart.loop.endsAt - now), false) })
    : t(cart.waitingForCrew ? 'supply.cart.waitingShort' : 'supply.cart.parked');
  return (
    <ParchmentCard title={t('supply.cart.title')} titleEmoji="🐴" contentStyle={styles.card}>
      <Text style={styles.line}>{status}</Text>
      <Text style={styles.line}>
        {stops === 0
          ? t('supply.cart.noRoute')
          : t('supply.cart.routeLine', { count: stops, distance: formatDistance(preview.meters), minutes: Math.round(preview.loopMinutes) })}
      </Text>
      <Text style={styles.line}>{crew.length > 0 ? crew.join(', ') : t('supply.cart.noCrew')}</Text>
      <WoodButton title={t('supply.cart.open')} onPress={onOpen} />
    </ParchmentCard>
  );
}

/** One building's card: its quality, rate, stock and posting. */
function BuildingCard({ building, now, onOpen }: { building: Building; now: number; onOpen: () => void }) {
  const save = useGameStore((s) => s.save);
  const settled = settleBuilding(save, building, now);
  const stock = buildingStockTotal(settled);
  const cap = buildingCap(building);
  const last = isLastDay(building.expiresAt, now);

  return (
    <PressScale accessibilityRole="button" accessibilityLabel={t(buildingNameKey[building.kind])} onPress={onOpen}>
      <ParchmentCard
        title={t(buildingNameKey[building.kind])}
        titleEmoji={buildingEmoji[building.kind]}
        titleSub={`${'★'.repeat(building.quality)}${'☆'.repeat(3 - building.quality)}`}
        contentStyle={styles.card}
      >
        <View style={styles.stockRow}>
          <FillBar value={cap > 0 ? stock / cap : 0} />
          <Text style={styles.stockText}>{`${stock} / ${cap}`}</Text>
        </View>
        <Text style={styles.line}>
          {`${t('supply.leavesIn', { time: formatDuration(Math.max(0, building.expiresAt - now), false) })}${last ? ` · ${t('supply.lastDay')}` : ''}`}
        </Text>
      </ParchmentCard>
    </PressScale>
  );
}

/** One live order's card: its place, its progress with its steps' notches, its headline and its time left. */
function OrderCard({ order, now }: { order: Order; now: number }) {
  const progress = orderProgress(order);
  const last = isLastDay(order.expiresAt, now);
  return (
    <ParchmentCard title={orderPlaceName(order, tavernNameOf)} titleEmoji={placeInfo[order.kind].emoji} contentStyle={styles.card}>
      <View style={styles.progressRow}>
        <View style={styles.barWrap}>
          <FillBar value={progress} height={10} />
          {supplyRules.orders.steps.slice(0, -1).map((at) => (
            <View key={at} style={[styles.notch, { left: `${at * 100}%` }]} />
          ))}
        </View>
        <Text style={styles.stockText}>{formatPercent(progress)}</Text>
      </View>
      <View style={styles.orderRow}>
        <LootGrid tiles={lootTiles(order.headline)} size={40} interactive={false} />
        <Text style={styles.line}>{t('supply.leavesIn', { time: formatDuration(Math.max(0, order.expiresAt - now), false) })}</Text>
        {last && <Text style={styles.lastDay}>{t('supply.lastDay')}</Text>}
      </View>
    </ParchmentCard>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10 },
  card: { gap: 8 },
  line: { color: ui.ink },
  sectionTitle: { fontSize: 19, color: ui.brassLight },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stockText: { color: ui.ink },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barWrap: { flex: 1, position: 'relative' },
  notch: { position: 'absolute', top: -2, bottom: -2, width: 2, backgroundColor: ui.outline },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  lastDay: { color: ui.onEmber, backgroundColor: ui.ember, fontSize: 12, letterSpacing: 1, paddingHorizontal: 4, paddingVertical: 2 },
});
