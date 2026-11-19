import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { FillBar, PressScale } from '@/components/motion';

import { GameIcon } from '@/components/GameIcon';
import { Text } from '@/components/Text';
import { IconLabel } from '@/components/IconLabel';
import { LootGrid } from '@/components/LootGrid';
import { EmberButton, ParchmentCard, WoodButton } from '@/components/ui';
import { clockConfig } from '@/content/clockConfig';
import { materials } from '@/content/materials';
import { placeInfo } from '@/content/places';
import { supplyRules } from '@/content/supplyLines';
import { cellAt } from '@/game/discovery/cells';
import { distanceMeters } from '@/game/generation/geo';
import { tileCenter } from '@/game/generation/tiles';
import type { LatLng } from '@/game/generation/types';
import type { PlaceSpawn } from '@/game/places/generate';
import { lootTiles } from '@/game/loot/tiles';
import { compassDirection } from '@/game/quests/targets';
import type { SaveData } from '@/game/save';
import { routePreview } from '@/game/supply/cart';
import { buildingCap, buildingStockTotal, settleBuilding } from '@/game/supply/production';
import { buildingEmoji, buildingNameKey, buildingReach, isLastDay } from '@/game/supply/buildings';
import { isDiscovered, networkPlacesAround } from '@/game/supply/discovery';
import { FIRST_CHAIN_STEPS, isSiteId, type FirstChainStep } from '@/game/supply/firstChain';import { hallMovesLeft } from '@/game/supply/hall';
import { isOrderKind, orderPlaceName, orderProgress, reachedSteps, type Order } from '@/game/supply/orders';
import { isAnnounced } from '@/game/supply/raids';
import { personalSites, siteQuality, sitesAround } from '@/game/supply/sites';
import type { Building, RoutePoint } from '@/game/supply/types';
import { personalTaverns } from '@/game/taverns/personal';
import { generateTavernsAround, tavernNameOf } from '@/game/taverns/taverns';
import { formatDistance, formatDuration, formatPercent, t } from '@/i18n';
import { useNow } from '@/hooks/useNow';
import { navigate } from '@/services/navigation';
import { useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
import { useWorldStore } from '@/store/worldStore';
import { ui } from '@/theme';

/** The Expeditions screen's Network tab: what to do next, how the goods flow, then each piece as a card. */
export function NetworkTab() {
  const save = useGameStore((s) => s.save);
  const player = useWorldStore((s) => s.player);
  const now = useNow(clockConfig.minutesMs);
  const hall = save.supply.hall;
  const buildings = save.supply.buildings;
  const orders = Object.values(save.supply.orders).sort((a, b) => a.expiresAt - b.expiresAt);
  // A stop the route still names but the world no longer holds: a gone building or an expired order.
  const route = save.supply.cart.nextRoute ?? save.supply.cart.route;
  const routeLeft = route.some(
    (point) =>
      ('building' in point && !buildings.some((building) => building.id === point.building)) ||
      ('place' in point && ((save.supply.orders[point.place]?.expiresAt ?? 0) <= now)),
  );
  // Whatever is in its last day leaves the two lists below and comes first, soonest at the top.
  const leaving = [
    ...buildings.filter((building) => isLastDay(building.expiresAt, now)).map((building) => ({
      expiresAt: building.expiresAt,
      card: <BuildingCard key={building.id} building={building} now={now} />,
    })),
    ...orders
      .filter((order) => isLastDay(order.expiresAt, now))
      .map((order) => ({ expiresAt: order.expiresAt, card: <OrderCard key={order.placeId} order={order} now={now} /> })),
  ].sort((a, b) => a.expiresAt - b.expiresAt);
  const stayingBuildings = buildings.filter((building) => !isLastDay(building.expiresAt, now));
  const stayingOrders = orders.filter((order) => !isLastDay(order.expiresAt, now));

  return (
    <View style={styles.body}>
      {save.supply.firstChain.doneAt === null ? (
        <FirstStepsCard save={save} player={player} now={now} />
      ) : (
        <NextStepCard save={save} player={player} now={now} />
      )}
      <FlowPicture save={save} now={now} />
      {leaving.length > 0 && (
        <>
          <IconLabel emoji="⏳" label={t('supply.network.leavingSoonest')} labelStyle={styles.sectionTitle} />
          {leaving.map(({ card }) => card)}
        </>
      )}
      <Text style={styles.sectionTitle}>{t('supply.network.buildings')}</Text>
      {buildings.length === 0 ? (
        <Text style={styles.line}>{t('supply.network.emptyBuildings')}</Text>
      ) : (
        stayingBuildings.map((building) => <BuildingCard key={building.id} building={building} now={now} />)
      )}
      <Text style={styles.sectionTitle}>{t('supply.order.places')}</Text>
      {orders.length === 0 ? (
        <Text style={styles.line}>{t('supply.order.empty')}</Text>
      ) : (
        stayingOrders.map((order) => <OrderCard key={order.placeId} order={order} now={now} />)
      )}
      <CartCard now={now} />
      <View style={styles.hallRow}>
        <Text style={[styles.line, styles.hallText]}>
          {hall ? t('supply.network.hallMoves', { n: hallMovesLeft(save, now) }) : t('supply.network.noHall')}
        </Text>
        {player && (
          <WoodButton
            compact
            title={hall ? t('supply.hall.move') : t('supply.hall.place')}
            disabled={hall?.cell === cellAt(player)}
            onPress={() => openOnMap(() => useMapPanels.getState().openHall(cellAt(player)))}
          />
        )}
      </View>
      {routeLeft && (
        <View style={styles.routeLeftRow}>
          <GameIcon emoji="⚠️" size={18} />
          <Text style={[styles.line, styles.routeLeftText]}>{t('supply.network.routeLeft')}</Text>
          <WoodButton compact title={t('supply.cart.setRoute')} onPress={() => openOnMap(() => useMapPanels.getState().openRoutePlanner(route))} />
        </View>
      )}
    </View>
  );
}

/** Opens a panel over the map: the panel store first, then the jump to the map. */
const openOnMap = (open: () => void) => {
  open();
  navigate('/');
};

/** The position the network's places are regenerated around: the hall's centre, else the player. */
const aroundOf = (save: SaveData, player: LatLng | null): LatLng | null =>
  save.supply.hall ? tileCenter(save.supply.hall.cell) : player;

/** The nearest of the places, by distance from `from`; the first when there is none. */
function nearest(places: PlaceSpawn[], from: LatLng | null): PlaceSpawn | null {
  if (places.length === 0) return null;
  if (from === null) return places[0];
  return places.reduce((best, place) => (distanceMeters(from, place.position) < distanceMeters(from, best.position) ? place : best));
}

/** The order's place spawn, regenerated around the hall or the player; null once the world no longer holds it. */
function placeSpawnOf(save: SaveData, placeId: string, around: LatLng | null, now: number): PlaceSpawn | null {
  if (!around) return null;
  return networkPlacesAround(save, around, now).find((place) => place.id === placeId) ?? null;
}


/**
 * Centres the map on an order's place, where the player taps its marker: a
 * regenerated spawn isn't placed on walkable ground like the map's, so its
 * sheet is opened from the marker, not from here. Falls back on the route's
 * stored position once the world no longer holds it.
 */
function openOrderPlace(order: Order, save: SaveData, around: LatLng | null, now: number) {
  const spawn = placeSpawnOf(save, order.placeId, around, now);
  if (spawn) {
    useWorldStore.getState().set({ focusPlace: spawn.position });
    return;
  }
  const route = save.supply.cart.nextRoute ?? save.supply.cart.route;
  const at = route.find((point) => 'place' in point && point.place === order.placeId);
  if (at && 'place' in at) useWorldStore.getState().set({ focusPlace: at.position });
}

/** The nearest live site: the world's within 1.5 km plus the personal and debug ones, undiscovered; `any` drops both filters. */
function nearestSite(save: SaveData, player: LatLng | null, now: number, any: boolean): PlaceSpawn | null {
  if (!player) return null;
  const live = (site: PlaceSpawn) => site.startsAt <= now && now < site.expiresAt;
  const fresh = (site: PlaceSpawn) => any || !isDiscovered(save, site.id);
  const near = (site: PlaceSpawn) => any || distanceMeters(player, site.position) <= 1500;
  return nearest(
    [
      ...sitesAround(player, now).filter((site) => live(site) && fresh(site) && near(site)),
      ...personalSites(save, now).filter((site) => live(site) && fresh(site)),
      ...useDebugStore.getState().debugSites.filter((site) => live(site) && fresh(site)),
    ],
    player,
  );
}

/** The nearest discovered site's spawn, for the sheet the farm step opens. */
function nearestDiscoveredSite(save: SaveData, around: LatLng | null, now: number): PlaceSpawn | null {
  if (!around) return null;
  return nearest(
    networkPlacesAround(save, around, now).filter((place) => place.kind === 'site' && isDiscovered(save, place.id)),
    around,
  );
}

/** The nearest discovered site with no building on it, for the build step. */
function nearestFreeSite(save: SaveData, around: LatLng | null, now: number): PlaceSpawn | null {
  if (!around) return null;
  return nearest(
    networkPlacesAround(save, around, now).filter(
      (place) =>
        place.kind === 'site' &&
        isDiscovered(save, place.id) &&
        !save.supply.buildings.some((building) => building.siteId === place.id),
    ),
    around,
  );
}

/** The nearest undiscovered tavern: the world's around the player plus the personal one. */
function nearestUndiscoveredTavern(save: SaveData, player: LatLng | null, now: number): PlaceSpawn | null {
  if (!player) return null;
  const live = (tavern: PlaceSpawn) => tavern.startsAt <= now && now < tavern.expiresAt && !isDiscovered(save, tavern.id);
  return nearest([...generateTavernsAround(player, now), ...personalTaverns(save, now)].filter(live), player);
}

/** The planner's starting route: every building, then every discovered order place the world still holds. */
function plannerRoute(save: SaveData, around: LatLng | null, now: number): RoutePoint[] {
  const points: RoutePoint[] = save.supply.buildings.map((building) => ({ building: building.id }));
  if (around) {
    for (const place of networkPlacesAround(save, around, now)) {
      if (isOrderKind(place.kind) && place.id in save.supply.orders) points.push({ place: place.id, position: place.position });
    }
  }
  return points;
}

/** The live order whose place is nearest, by the position the world or the route holds. */
function nearestLiveOrder(save: SaveData, around: LatLng | null, now: number): Order | null {
  const route = save.supply.cart.nextRoute ?? save.supply.cart.route;
  const positionOf = (order: Order): LatLng | null => {
    const spawn = placeSpawnOf(save, order.placeId, around, now);
    if (spawn) return spawn.position;
    const at = route.find((point) => 'place' in point && point.place === order.placeId);
    return at && 'place' in at ? at.position : null;
  };
  const live = Object.values(save.supply.orders).filter((order) => order.expiresAt > now && orderProgress(order) < 1);
  let best: { order: Order; at: LatLng } | null = null;
  for (const order of live) {
    const at = positionOf(order);
    if (!at) continue;
    if (!best || (around && distanceMeters(around, at) < distanceMeters(around, best.at))) best = { order, at };
  }
  return best?.order ?? null;
}

/** Where the current step's button takes the player: the right spot, then the map. */
function firstChainStep(step: FirstChainStep, save: SaveData, player: LatLng | null, now: number) {
  const panels = useMapPanels.getState();
  const world = useWorldStore.getState();
  const around = aroundOf(save, player);
  switch (step) {
    case 'hall':
      // "Place hall here": the player's own cell, at once; the checklist moves on.
      if (player) useGameStore.getState().placeHall(cellAt(player));
      return;
    case 'site': {
      const site = nearestSite(save, player, now, false) ?? nearestSite(save, player, now, true);
      if (site) world.set({ focusPlace: site.position });
      break;
    }
    case 'farm': {
      const site = nearestDiscoveredSite(save, around, now);
      if (site) world.set({ focusPlace: site.position });
      break;
    }
    case 'tavern': {
      const tavern = nearestUndiscoveredTavern(save, player, now);
      if (tavern) world.set({ focusPlace: tavern.position });
      break;
    }
    case 'route':
      panels.openRoutePlanner(plannerRoute(save, around, now));
      break;
    case 'delivery': {
      const order = nearestLiveOrder(save, around, now);
      if (order) openOrderPlace(order, save, around, now);
      break;
    }
  }
  navigate('/');
}

/** The first chain as a checklist: done steps ticked, the current one in bold with its button, the later ones muted. */
function FirstStepsCard({ save, player, now }: { save: SaveData; player: LatLng | null; now: number }) {
  const step = FIRST_CHAIN_STEPS[save.supply.firstChain.step] ?? 'hall';
  return (
    <ParchmentCard title={t('supply.firstChain.title')} contentStyle={styles.card}>
      {FIRST_CHAIN_STEPS.map((id, index) => (
        <View key={id}>
          <View style={styles.chainRow}>
            <Text style={styles.chainMark}>{index < save.supply.firstChain.step ? '✓' : '·'}</Text>
            <Text
              style={[
                styles.chainLine,
                index === save.supply.firstChain.step && styles.chainCurrent,
                index > save.supply.firstChain.step && styles.chainLater,
              ]}
            >
              {t(`supply.firstChain.${id}`)}
            </Text>
          </View>
          {index === save.supply.firstChain.step && (
            <EmberButton
              compact
              style={styles.stepButton}
              title={t(`supply.firstChain.buttons.${id}`)}
              onPress={() => firstChainStep(step, save, player, now)}
            />
          )}
        </View>
      ))}
    </ParchmentCard>
  );
}

/** One next step: its line and its button, by priority; the steady line with no button when nothing applies. */
function nextStep(save: SaveData, player: LatLng | null, now: number): { line: string; label?: string; onPress?: () => void } {
  const panels = useMapPanels.getState();
  const world = useWorldStore.getState();
  const around = aroundOf(save, player);
  const raid = save.supply.raid;
  const raided = raid && isAnnounced(save, raid, now) ? save.supply.buildings.find((b) => b.id === raid.buildingId) : undefined;
  if (raid && raided) {
    return {
      line: t('supply.network.next.raid', {
        building: t(buildingNameKey[raided.kind]),
        time: formatDuration(Math.max(0, raid.landsAt - now), false),
      }),
      label: t('supply.network.next.raidButton'),
      onPress: () => openOnMap(() => panels.openSupplyBuilding(raided.id)),
    };
  }
  if (!save.supply.hall) {
    return {
      line: t('supply.firstChain.hall'),
      label: t('supply.firstChain.buttons.hall'),
      onPress: () => player && useGameStore.getState().placeHall(cellAt(player)),
    };
  }
  if (!Object.keys(save.supply.discovered).some(isSiteId)) {
    const site = nearestSite(save, player, now, false) ?? nearestSite(save, player, now, true);
    if (site && player) {
      return {
        line: t('supply.network.next.discoverSite', {
          distance: formatDistance(distanceMeters(player, site.position)),
          direction: compassDirection(player, site.position),
        }),
        label: t('supply.network.next.showSite'),
        onPress: () => openOnMap(() => world.set({ focusPlace: site.position })),
      };
    }
  }
  const freeSite = save.supply.buildings.length < buildingReach(save).count ? nearestFreeSite(save, around, now) : null;
  if (freeSite) {
    return {
      line: t('supply.network.next.build', { stars: siteQuality(freeSite) }),
      label: t('supply.site.build'),
      onPress: () => openOnMap(() => world.set({ focusPlace: freeSite.position })),
    };
  }
  const served = new Set(save.supply.buildings.map((building) => supplyRules.buildings.kinds[building.kind].for));
  if (!Object.values(save.supply.orders).some((order) => order.expiresAt > now && served.has(order.kind))) {
    const place = around
      ? nearest(
          networkPlacesAround(save, around, now).filter((spawn) => isOrderKind(spawn.kind) && !isDiscovered(save, spawn.id)),
          around,
        )
      : null;
    return {
      line: t('supply.network.next.findPlace'),
      label: t('supply.network.next.findPlaceButton'),
      onPress: () => openOnMap(() => place && world.set({ focusPlace: place.position })),
    };
  }
  const route = save.supply.cart.nextRoute ?? save.supply.cart.route;
  if (route.length === 0) {
    return {
      line: t('supply.cart.noRoute'),
      label: t('supply.firstChain.buttons.route'),
      onPress: () => openOnMap(() => panels.openRoutePlanner(plannerRoute(save, around, now))),
    };
  }
  if (!save.supply.cart.crew.driver) {
    return {
      line: t('supply.network.next.crew'),
      label: t('supply.network.next.crewButton'),
      onPress: () => openOnMap(() => panels.openCart()),
    };
  }
  const locals = save.supply.buildings.find((building) => building.heroId === null);
  if (locals) {
    return {
      line: t('supply.network.next.postHero', {
        building: t(buildingNameKey[locals.kind]),
        pct: formatPercent(supplyRules.production.localsShare),
      }),
      label: t('supply.building.post'),
      onPress: () => openOnMap(() => panels.openSupplyBuilding(locals.id)),
    };
  }
  const claim = Object.values(save.supply.orders).find((order) => reachedSteps(order).some((i) => !order.steps[i].claimed));
  if (claim) {
    const at = reachedSteps(claim).find((i) => !claim.steps[i].claimed)!;
    return {
      line: t('supply.network.next.claim', { pct: formatPercent(claim.steps[at].at), place: orderPlaceName(claim, tavernNameOf) }),
      label: t('supply.network.next.claimButton'),
      onPress: () => openOnMap(() => openOrderPlace(claim, save, around, now)),
    };
  }
  return { line: t('supply.network.next.steady') };
}

/** The next-step card: one line, one ember button — the most useful thing to do now. */
function NextStepCard({ save, player, now }: { save: SaveData; player: LatLng | null; now: number }) {
  // Finding the next step regenerates the places around: once per save change, position and clock tick.
  const next = useMemo(() => nextStep(save, player, now), [save, player?.latitude, player?.longitude, now]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ParchmentCard contentStyle={styles.card}>
      <Text style={styles.line}>
        <Text style={styles.bold}>{t('supply.network.nextPrefix')}</Text>
        {' '}
        {next.line}
      </Text>
      {next.onPress && next.label && <EmberButton compact style={styles.stepButton} title={next.label} onPress={next.onPress} />}
    </ParchmentCard>
  );
}

/** One node of the flow picture: an emoji beside its own words. */
function FlowNode({ emoji, text }: { emoji: string; text: string }) {
  return (
    <View style={styles.flowNode}>
      <GameIcon emoji={emoji} size={18} />
      <Text style={styles.flowName}>{text}</Text>
    </View>
  );
}

/** The flow picture: the buildings' stock flows into the cart, its load out to the places' orders. */
function FlowPicture({ save, now }: { save: SaveData; now: number }) {
  const buildings = save.supply.buildings;
  const orders = Object.values(save.supply.orders)
    .filter((order) => order.expiresAt > now)
    .sort((a, b) => a.expiresAt - b.expiresAt);
  if (buildings.length === 0 && orders.length === 0) {
    return (
      <View style={styles.sketchCard}>
        <View style={styles.flow}>
          <View style={styles.flowCol}>
            <FlowNode emoji="🪧" text={t('supply.network.flow.building')} />
          </View>
          <Text style={styles.flowArrow}>→</Text>
          <View style={styles.flowCol}>
            <FlowNode emoji="🐴" text={t('supply.network.flow.cart')} />
          </View>
          <Text style={styles.flowArrow}>→</Text>
          <View style={styles.flowCol}>
            <FlowNode emoji="🍺" text={t('supply.network.flow.place')} />
          </View>
        </View>
        <Text style={styles.flowSketch}>{t('supply.network.flow.sketch')}</Text>
      </View>
    );
  }
  const cart = save.supply.cart;
  const stop = cart.loop ? cart.loop.events.find((event) => event.kind === 'place' && event.at > cart.settledAt) : undefined;
  const stopOrder = stop && 'placeId' in stop ? save.supply.orders[stop.placeId] : undefined;
  const cartText = stopOrder
    ? t('supply.network.flow.to', {
        name: orderPlaceName(stopOrder, tavernNameOf),
        time: formatDuration(Math.max(0, stop!.at - now), false),
      })
    : t('supply.network.flow.atHall');
  return (
    <ParchmentCard contentStyle={styles.card}>
      <View style={styles.flow}>
        <View style={styles.flowCol}>
          {buildings.slice(0, 3).map((building) => {
            const settled = settleBuilding(save, building, now);
            const stock = buildingStockTotal(settled);
            const cap = buildingCap(building);
            return (
              <View key={building.id} style={styles.flowNode}>
                <IconLabel emoji={buildingEmoji[building.kind]} label={String(stock)} size={16} />
                <View style={styles.flowMarks}>
                  <Text style={styles.flowName}>{t(buildingNameKey[building.kind])}</Text>
                  {isLastDay(building.expiresAt, now) && <GameIcon emoji="⏳" size={12} />}
                  {cap > 0 && stock >= cap && <Text style={styles.flowFull}>{t('supply.network.flow.full')}</Text>}
                </View>
              </View>
            );
          })}
          {buildings.length > 3 && <Text style={styles.flowMore}>{t('supply.network.flow.more', { n: buildings.length - 3 })}</Text>}
        </View>
        <Text style={styles.flowArrow}>→</Text>
        <View style={styles.flowCol}>
          <View style={styles.flowNode}>
            <GameIcon emoji="🐴" size={18} />
            <View style={styles.flowMarks}>
              {Object.entries(cart.cargo)
                .filter(([, amount]) => amount > 0)
                .map(([good, amount]) => (
                  <IconLabel key={good} emoji={materialEmoji(good)} label={String(amount)} size={14} />
                ))}
              <Text style={styles.flowName}>{cartText}</Text>
            </View>
          </View>
        </View>
        <Text style={styles.flowArrow}>→</Text>
        <View style={styles.flowCol}>
          {orders.slice(0, 3).map((order) => {
            const progress = orderProgress(order);
            return (
              <View key={order.placeId} style={styles.flowNode}>
                <GameIcon emoji={placeInfo[order.kind].emoji} size={16} />
                <View style={styles.flowMarks}>
                  <Text style={styles.flowName}>{orderPlaceName(order, tavernNameOf)}</Text>
                  {progress >= 1 ? (
                    <Text style={styles.flowName}>✓</Text>
                  ) : (
                    <Text style={styles.flowName}>{formatPercent(progress)}</Text>
                  )}
                  {isLastDay(order.expiresAt, now) && <GameIcon emoji="⏳" size={12} />}
                </View>
              </View>
            );
          })}
          {orders.length > 3 && <Text style={styles.flowMore}>{t('supply.network.flow.more', { n: orders.length - 3 })}</Text>}
        </View>
      </View>
    </ParchmentCard>
  );
}

/** A material's emoji, for the cart's load in the flow picture. */
const materialEmoji = (id: string) => materials.find((material) => material.id === id)?.emoji ?? '·';

/** The cart's card: where it is, its route in one line, its crew, and the way into its sheet. */
function CartCard({ now }: { now: number }) {
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
      <WoodButton compact title={t('supply.cart.open')} onPress={() => openOnMap(() => useMapPanels.getState().openCart())} />
    </ParchmentCard>
  );
}

/** One building's card: its stock against the cap on a thin bar, its stars and its time left; a tap opens its sheet on the map. */
function BuildingCard({ building, now }: { building: Building; now: number }) {
  const save = useGameStore((s) => s.save);
  const settled = settleBuilding(save, building, now);
  const stock = buildingStockTotal(settled);
  const cap = buildingCap(building);
  const last = isLastDay(building.expiresAt, now);
  const name = t(buildingNameKey[building.kind]);
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={() => openOnMap(() => useMapPanels.getState().openSupplyBuilding(building.id))}
    >
      <ParchmentCard contentStyle={styles.mini}>
        <View style={styles.miniRow}>
          <GameIcon emoji={buildingEmoji[building.kind]} size={22} />
          <View style={styles.miniText}>
            <Text style={styles.line}>
              {name} {'★'.repeat(building.quality)}
              {'☆'.repeat(3 - building.quality)}
              {!building.heroId && <Text style={styles.locals}>{` · ${t('supply.network.localsOnly')}`}</Text>}
            </Text>
            <FillBar value={cap > 0 ? stock / cap : 0} height={10} />
          </View>
          <Text style={styles.miniCount}>{`${stock} / ${cap}`}</Text>
          <View style={styles.miniLeft}>
            {last && <GameIcon emoji="⏳" size={14} />}
            <Text style={[styles.miniTime, last && styles.lastDayText]}>
              {t('supply.leavesIn', { time: formatDuration(Math.max(0, building.expiresAt - now), false) })}
            </Text>
            {last && <Text style={styles.lastDay}>{t('supply.lastDay')}</Text>}
          </View>
        </View>
      </ParchmentCard>
    </PressScale>
  );
}

/** One live order's card: its progress with its steps' notches, its headline tile and its time left; a tap opens its place's sheet. */
function OrderCard({ order, now }: { order: Order; now: number }) {
  const save = useGameStore((s) => s.save);
  const player = useWorldStore((s) => s.player);
  const progress = orderProgress(order);
  const last = isLastDay(order.expiresAt, now);
  const name = orderPlaceName(order, tavernNameOf);
  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={() => openOnMap(() => openOrderPlace(order, save, aroundOf(save, player), now))}
    >
      <ParchmentCard contentStyle={styles.mini}>
        <View style={styles.miniRow}>
          <GameIcon emoji={placeInfo[order.kind].emoji} size={22} />
          <View style={styles.miniText}>
            <Text style={styles.line}>{name}</Text>
            <View style={styles.barWrap}>
              <FillBar value={progress} height={10} />
              {supplyRules.orders.steps.slice(0, -1).map((at) => (
                <View key={at} style={[styles.notch, { left: `${at * 100}%` }]} />
              ))}
            </View>
          </View>
          <Text style={styles.miniCount}>{formatPercent(progress)}</Text>
          <LootGrid tiles={lootTiles(order.headline)} size={36} interactive={false} />
          <View style={styles.miniLeft}>
            {last && <GameIcon emoji="⏳" size={14} />}
            <Text style={[styles.miniTime, last && styles.lastDayText]}>
              {t('supply.leavesIn', { time: formatDuration(Math.max(0, order.expiresAt - now), false) })}
            </Text>
            {last && <Text style={styles.lastDay}>{t('supply.lastDay')}</Text>}
          </View>
        </View>
      </ParchmentCard>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  hallRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  hallText: { flex: 1 },
  body: { gap: 10 },
  card: { gap: 8 },
  chainRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chainMark: { color: ui.ink },
  chainLine: { color: ui.ink, flex: 1 },
  chainCurrent: { fontWeight: 'bold' },
  chainLater: { color: ui.inkMuted },
  stepButton: { alignSelf: 'flex-start', marginTop: 4 },
  bold: { fontWeight: 'bold' },
  line: { color: ui.ink },
  sectionTitle: { fontSize: 19, color: ui.brassLight },
  mini: { gap: 0 },
  miniRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  miniText: { flex: 1, minWidth: 0, gap: 2 },
  miniCount: { color: ui.ink },
  miniLeft: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniTime: { fontSize: 13, color: ui.ink },
  lastDayText: { color: ui.emberDark, fontWeight: 'bold' },
  locals: { color: ui.emberDark, fontSize: 13 },
  barWrap: { flex: 1, position: 'relative' },
  notch: { position: 'absolute', top: -2, bottom: -2, width: 2, backgroundColor: ui.outline },
  flow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flowCol: { flex: 1, gap: 6 },
  flowNode: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flowMarks: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  flowName: { fontSize: 13, color: ui.ink },
  flowFull: { fontSize: 11, color: ui.emberDark, fontWeight: 'bold', letterSpacing: 1 },
  flowMore: { fontSize: 13, color: ui.inkMuted },
  flowArrow: { fontSize: 18, color: ui.brassLight },
  flowSketch: { fontSize: 13, color: ui.inkMuted, textAlign: 'center' },
  sketchCard: { opacity: 0.6, padding: 10, gap: 8, borderWidth: 3, borderColor: ui.outline, backgroundColor: ui.parchment },
  routeLeftRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeLeftText: { flex: 1 },
  lastDay: { color: ui.onEmber, backgroundColor: ui.ember, fontSize: 12, letterSpacing: 1, paddingHorizontal: 4, paddingVertical: 2 },
});
