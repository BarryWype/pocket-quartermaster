import { Fragment, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconLabel } from '@/components/IconLabel';
import { Text } from '@/components/Text';
import { WoodButton } from '@/components/ui';
import { clockConfig } from '@/content/clockConfig';
import { heroClasses } from '@/content/heroes';
import { materialById } from '@/content/lookup';
import { supplyRules } from '@/content/supplyLines';
import { effectivePath, effectiveRoute } from '@/game/supply/autoRoute';
import { buildingNameKey } from '@/game/supply/buildings';
import { cartCapacity, cartProblem, cartSpeedMps, crewProblem, loopPreview, settleCart } from '@/game/supply/cart';
import { orderPlaceName } from '@/game/supply/orders';
import type { CartLogLine, CartPlaceLine, RoutePoint } from '@/game/supply/types';
import { tavernNameOf } from '@/game/taverns/taverns';
import { currentHp, isExhausted, maxHp } from '@/game/team/health';
import { isBusy } from '@/game/team/team';
import type { SaveData } from '@/game/save';
import { formatDistance, formatDuration, formatPercent, t } from '@/i18n';
import { ambushText } from '@/hooks/useCartTick';
import { useNow } from '@/hooks/useNow';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
import { ui } from '@/theme';

import { MapSheet, type MapSheetAction, type MapSheetSecondary, type MapSheetView } from './MapSheet';
import { GoodsRow, PortraitSlot } from './network/networkBits';
import { HeroChoiceList } from './PostHeroList';
import { stopEmoji, stopName } from './routeMode/stops';
import { TradeLabel } from './TradeLabel';

type Slot = 'driver' | 0 | 1;

/** A place the cart unloaded at, by name: a tavern by its name, the rest by their kind. */
const placeName = (save: SaveData, placeId: string): string => {
  const order = save.supply.orders[placeId];
  return order ? orderPlaceName(order, tavernNameOf) : placeId;
};

/** The goods of an unload or a homecoming: one icon-and-count element each. */
function goodsElements(goods: Record<string, number>) {
  return Object.entries(goods)
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => <IconLabel key={id} emoji={materialById[id]?.emoji} icon={materialById[id]?.icon} label={String(amount)} size={14} />);
}

/** One loop of the log as a plain sentence: what went where, what came home, and the ambush if any. */
function LoopSentence({ save, line }: { save: SaveData; line: CartLogLine }) {
  const ambush = ambushText(line);
  const home = Object.entries(line.delivered).filter(([, amount]) => amount > 0);
  const empty = line.places.length === 0 && home.length === 0;
  return (
    <View style={styles.sentence}>
      {empty ? (
        <Text style={styles.line}>{t('supply.cart.logEmpty')}</Text>
      ) : (
        <View style={styles.sentenceParts}>
          {line.places.map((place: CartPlaceLine, i) => (
            <Fragment key={place.placeId}>
              {i > 0 && <Text style={styles.line}>{', '}</Text>}
              <Text style={styles.line}>{i === 0 ? `${t('supply.cart.logDelivered')} ` : ''}</Text>
              {goodsElements(place.goods)}
              <Text style={styles.line}>{` ${t('supply.cart.logTo', { place: placeName(save, place.placeId) })}`}</Text>
            </Fragment>
          ))}
          {home.length > 0 && (
            <>
              {line.places.length > 0 && <Text style={styles.line}>{', '}</Text>}
              {goodsElements(Object.fromEntries(home))}
              <Text style={styles.line}>{` ${t('supply.cart.logHome')}`}</Text>
            </>
          )}
        </View>
      )}
      {ambush && <Text style={styles.muted}>{ambush}</Text>}
    </View>
  );
}

/** The crew members too hurt to set out again. */
function hurtNames(save: SaveData, crew: string[], now: number): string {
  return save.heroes
    .filter((hero) => crew.includes(hero.id))
    .filter((hero) => isExhausted(hero, now) || currentHp(save, hero, now) < supplyRules.cart.minCrewHpShare * maxHp(save, hero))
    .map((hero) => hero.name)
    .join(', ');
}

/**
 * The cart on the map sheet template. The peek says where it is on the loop
 * and what it carries; the main action is the next useful step: plan the
 * delivery route, choose a driver, start, or edit the route while it runs.
 * Tabs: Route (the stops in order with what is loaded and delivered), Crew
 * (driver and escorts as portrait slots), Last loops.
 */
export function SupplyCartPanel({ onClose }: { onClose: () => void }) {
  const stored = useGameStore((s) => s.save);
  const setCrew = useGameStore((s) => s.setCrew);
  const startCart = useGameStore((s) => s.startCart);
  const stopCart = useGameStore((s) => s.stopCart);
  const now = useNow(clockConfig.minutesMs);
  const [picking, setPicking] = useState<Slot | null>(null);

  // Shown as of now without writing: the store settles the cart when its next event is due.
  const save = settleCart(stored, now);
  const cart = save.supply.cart;
  const loop = cart.loop;
  const crew = { driver: cart.crew.driver, escorts: cart.crew.escorts };
  const crewIds = [crew.driver, ...crew.escorts].filter((id): id is string => id !== null);
  const route = effectiveRoute(save);
  const stopPoints = route.filter((point): point is Exclude<RoutePoint, { via: unknown }> => 'building' in point || 'place' in point);
  const preview = loopPreview(save, route, effectivePath(save), now);
  const loopMinutes = Math.round(preview.minutes);
  const problem = cartProblem(save, now);
  const parked = loop === null;
  const stopping = loop !== null && cart.nextRoute !== null && cart.nextRoute.length === 0;
  const hasRoute = stopPoints.length > 0;

  const slotHero = (slot: Slot) => {
    const id = slot === 'driver' ? crew.driver : (crew.escorts[slot] ?? null);
    return id ? (save.heroes.find((hero) => hero.id === id) ?? null) : null;
  };
  const assign = (slot: Slot, heroId: string | null) => {
    const escorts = [...crew.escorts];
    let driver = crew.driver;
    if (slot === 'driver') driver = heroId;
    else if (heroId) escorts[slot] = heroId;
    else escorts.splice(slot, 1);
    const next = escorts.filter((id) => id);
    if (crewProblem(stored, driver, next, now) === null) setCrew(driver, next);
    setPicking(null);
  };
  const candidates = (slot: Slot) =>
    save.heroes
      .filter((hero) => !isBusy(save, hero.id) && !crewIds.includes(hero.id))
      .sort((a, b) => (slot === 'driver' ? Number(b.trade.id === 'teamster') - Number(a.trade.id === 'teamster') : 0));

  // The stop the loop is heading to next; the hall once it is only coming home.
  const nextEvent = loop?.events.find(
    (event): event is Extract<typeof event, { kind: 'building' | 'place' }> => event.at > now && (event.kind === 'building' || event.kind === 'place'),
  );
  const nextStopName = !nextEvent
    ? null
    : nextEvent.kind === 'building'
      ? (() => {
          const building = save.supply.buildings.find((b) => b.id === nextEvent.buildingId);
          return building ? t(buildingNameKey[building.kind]) : null;
        })()
      : placeName(save, nextEvent.placeId);
  // The next place the cargo is going to, for "Carrying ... to the Crooked Mug".
  const nextPlace = loop?.events.find((event): event is Extract<typeof event, { kind: 'place' }> => event.at > now && event.kind === 'place');
  const status = loop
    ? nextStopName
      ? t('supply.cart.onItsWay', { stop: nextStopName, time: formatDuration(Math.max(0, loop.endsAt - now), false) })
      : t('supply.cart.running', { n: loop.n, time: formatDuration(Math.max(0, loop.endsAt - now), false) })
    : cart.waitingForCrew
      ? t('supply.cart.waiting', { names: hurtNames(save, crewIds, now) })
      : t('supply.cart.parked');
  const risky = preview.riskyCells > 0 ? t('supply.routeMode.risky', { count: preview.riskyCells }) : t('supply.routeMode.noRisk');
  const hasCargo = Object.values(cart.cargo).some((amount) => amount > 0);

  const openRoute = () => useMapPanels.getState().openRouteMode(cart.nextRoute ?? cart.route);
  const pick = (view: MapSheetView, slot: Slot) => {
    setPicking(slot);
    view.open('crew');
  };

  const action = (view: MapSheetView): MapSheetAction => {
    const act = (label: string, onPress: () => void): MapSheetAction => ({ state: { kind: 'act' }, verb: '', label, onPress });
    if (problem === 'noHall') {
      return { state: { kind: 'blocked', reason: 'noHall' }, verb: '', label: '', blockedLabel: t('networkSheet.cart.blocked.noHall'), onPress: () => {} };
    }
    if (!hasRoute) return act(t('networkSheet.planRoute'), openRoute);
    if (!parked) return act(t('networkSheet.editRoute'), openRoute);
    if (crew.driver === null && !(view.full && view.tab === 'crew')) return act(t('networkSheet.cart.chooseDriver'), () => pick(view, 'driver'));
    if (problem === 'crewBusy' || problem === 'crewHurt') {
      return { state: { kind: 'blocked', reason: problem }, verb: '', label: '', blockedLabel: t(`networkSheet.cart.blocked.${problem}`), onPress: () => {} };
    }
    return act(t(cart.waitingForCrew ? 'supply.cart.startAgain' : 'networkSheet.cart.start'), startCart);
  };

  const secondary = (view: MapSheetView): MapSheetSecondary[] => {
    if (!parked) return stopping ? [] : [{ key: 'stop', title: t('supply.cart.stop'), onPress: stopCart }];
    if (!hasRoute) return [];
    const out: MapSheetSecondary[] = [];
    if (crew.driver === null && !(view.full && view.tab === 'crew') && problem === null) out.push({ key: 'start', title: t('networkSheet.cart.start'), onPress: startCart });
    out.push({ key: 'route', title: t('networkSheet.editRoute'), onPress: openRoute });
    return out;
  };

  const summary = (
    <View style={styles.summary}>
      {!hasRoute ? (
        <Text style={styles.summaryLine}>{t('networkSheet.cart.noRoute')}</Text>
      ) : loop ? (
        <View style={styles.goodsLine}>
          {hasCargo ? (
            <>
              <Text style={styles.summaryLine}>
                {nextPlace ? t('networkSheet.cart.carryingTo', { place: placeName(save, nextPlace.placeId) }) : t('networkSheet.cart.carrying')}
              </Text>
              <GoodsRow goods={cart.cargo} size={18} />
            </>
          ) : (
            <Text style={styles.summaryLine}>{t('networkSheet.cart.empty')}</Text>
          )}
          <Text style={styles.summaryLine}>{`· ${t('networkSheet.cart.loop', { minutes: loopMinutes })} · ${risky}`}</Text>
        </View>
      ) : (
        <Text style={styles.summaryLine}>{`${t('networkSheet.cart.ready', { count: stopPoints.length, minutes: loopMinutes })} · ${risky}`}</Text>
      )}
      {stopping && <Text style={styles.muted}>{t('supply.cart.stopping')}</Text>}
    </View>
  );

  const routeTab = () => (
    <View style={styles.tab}>
      {!hasRoute ? (
        <Text style={styles.muted}>{t('supply.cart.noRoute')}</Text>
      ) : (
        <>
          {stopPoints.map((point, i) => {
            const id = 'building' in point ? point.building : point.place;
            const planned = preview.stops.find((stop) => stop.point.buildingId === id || stop.point.placeId === id);
            const order = 'place' in point ? save.supply.orders[point.place] : undefined;
            return (
              <View key={`${id}-${i}`} style={styles.stopRow} accessible accessibilityLabel={t('networkSheet.cart.stopLabel', { n: i + 1, name: stopName(save, point) })}>
                <Text style={styles.stopNumber}>{String(i + 1)}</Text>
                <IconLabel emoji={stopEmoji(save, point)} label={stopName(save, point)} size={18} labelStyle={styles.line} />
                <View style={styles.stopGoods}>
                  {planned && <GoodsRow goods={planned.loads} mark="+" size={16} />}
                  {planned && <GoodsRow goods={planned.unloads} mark="−" size={16} />}
                  {order && preview.leaving.includes(order.placeId) && (
                    <Text style={styles.muted}>{t('networkSheet.cart.leavesIn', { time: formatDuration(Math.max(0, order.expiresAt - now), false) })}</Text>
                  )}
                </View>
              </View>
            );
          })}
          <Text style={styles.line}>{t('networkSheet.cart.stats', { minutes: loopMinutes, distance: formatDistance(preview.meters) })}</Text>
          <View style={styles.goodsLine}>
            <Text style={styles.muted}>{t('networkSheet.cart.home')}</Text>
            {Object.values(preview.home).some((n) => n > 0) ? <GoodsRow goods={preview.home} size={16} /> : <Text style={styles.muted}>{t('networkSheet.cart.nothingHome')}</Text>}
          </View>
          <Text style={styles.muted}>{`${risky} · ${t('supply.cart.ambushChance', { percent: formatPercent(preview.ambushChance) })}`}</Text>
        </>
      )}
    </View>
  );

  const slots: Slot[] = ['driver', ...Array.from({ length: supplyRules.cart.maxEscorts }, (_, i) => i as 0 | 1)];
  const crewTab = () => (
    <View style={styles.tab}>
      <Text style={styles.muted}>{t('supply.cart.pace', { speed: ((cartSpeedMps(save) * 3600) / 1000).toFixed(1), capacity: cartCapacity(save) })}</Text>
      {!parked && <Text style={styles.muted}>{t('supply.cart.crewLocked')}</Text>}
      <View style={styles.slots}>
        {slots.map((slot) => {
          const hero = slotHero(slot);
          const driver = slot === 'driver';
          return (
            <PortraitSlot
              key={String(slot)}
              emoji={hero ? heroClasses[hero.classId].emoji : undefined}
              icon={hero ? heroClasses[hero.classId].icon : undefined}
              caption={hero ? hero.name : t(driver ? 'supply.cart.driver' : 'supply.cart.escort')}
              accessibilityLabel={
                hero
                  ? t(driver ? 'networkSheet.cart.slotDriver' : 'networkSheet.cart.slotEscort', { name: hero.name })
                  : t(driver ? 'networkSheet.cart.slotEmptyDriver' : 'networkSheet.cart.slotEmptyEscort')
              }
              disabled={!parked}
              onPress={() => setPicking(picking === slot ? null : slot)}
            />
          );
        })}
      </View>
      {crew.driver === null && <Text style={styles.muted}>{t('networkSheet.cart.noDriverLine')}</Text>}
      {picking !== null && parked && (
        <View style={styles.picker}>
          <Text style={styles.line}>{t(picking === 'driver' ? 'supply.cart.driver' : 'supply.cart.escort')}</Text>
          {slotHero(picking) && <TradeLabel trade={slotHero(picking)!.trade.id} hours={slotHero(picking)!.trade.hours} />}
          <HeroChoiceList heroes={candidates(picking)} action={t('supply.cart.change')} onPick={(heroId) => assign(picking, heroId)} />
          {slotHero(picking) && <WoodButton compact title={t('supply.cart.leaveEmpty')} onPress={() => assign(picking, null)} />}
        </View>
      )}
    </View>
  );

  const logTab = () => (
    <View style={styles.tab}>
      {cart.log.length === 0 ? (
        <Text style={styles.muted}>{t('supply.cart.noLog')}</Text>
      ) : (
        [...cart.log].reverse().map((line) => <LoopSentence key={line.n} save={save} line={line} />)
      )}
    </View>
  );

  return (
    <MapSheet
      onClose={onClose}
      emoji="🐴"
      ring={null}
      title={t('supply.cart.title')}
      status={status}
      summary={summary}
      action={action}
      secondary={secondary}
      tabs={[
        { key: 'route', label: t('networkSheet.tabs.route'), render: routeTab },
        { key: 'crew', label: t('networkSheet.tabs.crew'), render: crewTab },
        { key: 'log', label: t('networkSheet.tabs.log'), render: logTab },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  summary: { gap: 6 },
  summaryLine: { color: ui.ink, fontSize: 18 },
  goodsLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  tab: { gap: 10 },
  line: { color: ui.ink },
  muted: { color: ui.inkMuted, fontSize: 16 },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, flexWrap: 'wrap' },
  stopNumber: { width: 26, height: 26, textAlign: 'center', lineHeight: 26, backgroundColor: ui.brass, color: ui.outline, fontSize: 16 },
  stopGoods: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginLeft: 'auto' },
  slots: { flexDirection: 'row', gap: 16 },
  picker: { gap: 6 },
  sentence: { gap: 2 },
  sentenceParts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
});
