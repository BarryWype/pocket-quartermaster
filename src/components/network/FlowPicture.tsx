import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { GameIcon } from '@/components/GameIcon';
import { IconLabel } from '@/components/IconLabel';
import { PressScale } from '@/components/motion';
import { Text } from '@/components/Text';
import { materialById } from '@/content/lookup';
import { placeInfo } from '@/content/places';
import { effectivePath, effectiveRoute } from '@/game/supply/autoRoute';
import { buildingBadge } from '@/game/supply/badges';
import { buildingEmoji, buildingNameKey, isLastDay } from '@/game/supply/buildings';
import { loopPreview } from '@/game/supply/cart';
import { flowModel, mainCargo, type FlowLink } from '@/game/supply/flow';
import { orderPlaceName, orderProgress, stillNeeded, type Order } from '@/game/supply/orders';
import { buildingCap, buildingStockTotal, settleBuilding } from '@/game/supply/production';
import type { Building } from '@/game/supply/types';
import { tavernNameOf } from '@/game/taverns/taverns';
import type { SaveData } from '@/game/save';
import { formatDuration, t, tr } from '@/i18n';
import { ui } from '@/theme';

import { BadgeIcon, badgeLabel } from './NetworkBadge';

/** An item's box: tall enough for two short lines and a 44 pt target. */
const ROW = 60;
const ROW_GAP = 8;
const CART_W = 72;
/** The space between a column and the cart, where the lines run. */
const GUTTER = 22;
/** More than this many items in a column, and the rest are left to the cards below. */
const MAX_ITEMS = 5;
const STUB = 10;

type Props = {
  save: SaveData;
  now: number;
  onBuilding: (id: string) => void;
  onPlace: (order: Order) => void;
  onCart: () => void;
};

type Point = { x: number; y: number };

/**
 * One line of the picture, as plain views (the app has no SVG): solid for
 * what the delivery route carries, dashed for what it could, dotted for a
 * stub that goes nowhere. The style, not only the colour, tells them apart.
 */
function Segment({ from, to, kind }: { from: Point; to: Point; kind: 'carried' | 'possible' | 'stub' }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const thickness = kind === 'carried' ? 4 : 2;
  const place = {
    left: (from.x + to.x) / 2 - length / 2,
    top: (from.y + to.y) / 2 - thickness / 2,
    width: length,
    height: thickness,
    transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
  };
  if (kind === 'carried') return <View pointerEvents="none" style={[styles.segment, place, styles.carried]} />;
  const dash = kind === 'possible' ? 6 : 2;
  const space = kind === 'possible' ? 4 : 3;
  const count = Math.max(1, Math.floor(length / (dash + space)));
  return (
    <View pointerEvents="none" style={[styles.segment, place, styles.dashes]}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: dash, height: thickness, marginRight: space, backgroundColor: ui.inkMuted }} />
      ))}
    </View>
  );
}

/** One box of the picture: its icon, its name, its key number with its unit, and its badge. */
function FlowItem({
  emoji,
  icon,
  name,
  detail,
  badge,
  accessibilityLabel,
  onPress,
  style,
}: {
  emoji: string;
  icon?: Parameters<typeof GameIcon>[0]['icon'];
  name: string;
  detail: React.ReactNode;
  badge?: React.ReactNode;
  accessibilityLabel: string;
  onPress: () => void;
  style: object;
}) {
  return (
    <PressScale accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={[styles.item, style]}>
      <View style={styles.itemHead}>
        <GameIcon emoji={emoji} icon={icon} size={18} />
        <Text style={styles.itemName} numberOfLines={1}>
          {name}
        </Text>
      </View>
      {typeof detail === 'string' ? (
        <Text style={styles.itemDetail} numberOfLines={2}>
          {detail}
        </Text>
      ) : (
        detail
      )}
      {badge && <View style={styles.badgeAt}>{badge}</View>}
    </PressScale>
  );
}

/** The y of each item's middle in a column of `count`, centred in a picture `height` tall. */
const middles = (count: number, height: number): number[] => {
  const column = count * ROW + Math.max(0, count - 1) * ROW_GAP;
  const top = (height - column) / 2;
  return Array.from({ length: count }, (_, i) => top + i * (ROW + ROW_GAP) + ROW / 2);
};

/**
 * The Network tab's flow picture: the buildings on the left, the cart in the
 * middle, the places on the right, and a line for each good from where it is
 * made to where it is wanted, through the cart when the delivery route
 * carries it, straight across (dashed) when the route doesn't join them yet.
 * Badges sit on the item they concern. A tap on a building or a place opens
 * its sheet on the map; a tap on the cart opens route mode.
 */
export function FlowPicture({ save, now, onBuilding, onPlace, onCart }: Props) {
  const [width, setWidth] = useState(0);
  const model = useMemo(() => flowModel(save, now), [save, now]);
  const cartState = useMemo(() => {
    const route = effectiveRoute(save);
    const loop = save.supply.cart.loop;
    if (loop) return t('networkFlow.backIn', { time: formatDuration(Math.max(0, loop.endsAt - now), false) });
    if (route.length === 0) return t('networkFlow.noRoute');
    return t('networkFlow.parkedLoop', { minutes: Math.round(loopPreview(save, route, effectivePath(save), now).minutes) });
  }, [save, now]);

  const buildings = model.buildings.slice(0, MAX_ITEMS);
  const places = model.places.slice(0, MAX_ITEMS);
  const hidden = model.buildings.length - buildings.length + (model.places.length - places.length);
  const height = Math.max(buildings.length, places.length, 1) * (ROW + ROW_GAP) - ROW_GAP;
  const column = Math.max(0, (width - CART_W - 2 * GUTTER) / 2);
  const leftY = middles(buildings.length, height);
  const rightY = middles(places.length, height);
  const cartY = height / 2;
  const cartLeft = column + GUTTER;
  const cartRight = cartLeft + CART_W;
  const placeLeft = cartRight + GUTTER;

  const placeName = (order: Order) => orderPlaceName(order, tavernNameOf);
  const buildingName = (building: Building) => t(buildingNameKey[building.kind]);
  const linksOf = (pick: (link: FlowLink) => boolean) => model.links.filter(pick);

  // Lines: a building on the route to the cart, the cart to a place on the route that one of them feeds,
  // a dashed line straight across for a pair the route doesn't join, and a dotted stub for an item with no line.
  const lines: { key: string; from: Point; to: Point; kind: 'carried' | 'possible' | 'stub' }[] = [];
  if (width > 0) {
    buildings.forEach((building, i) => {
      const own = linksOf((link) => link.building === building.id);
      const from = { x: column, y: leftY[i] };
      if (model.onRoute.has(building.id)) lines.push({ key: `b-cart-${building.id}`, from, to: { x: cartLeft, y: cartY }, kind: 'carried' });
      own
        .filter((link) => link.kind === 'possible')
        .forEach((link) => {
          const j = places.findIndex((order) => order.placeId === link.place);
          if (j !== -1) lines.push({ key: `p-${building.id}-${link.place}`, from, to: { x: placeLeft, y: rightY[j] }, kind: 'possible' });
        });
      if (!model.onRoute.has(building.id) && own.length === 0) lines.push({ key: `s-${building.id}`, from, to: { x: column + STUB, y: leftY[i] }, kind: 'stub' });
    });
    places.forEach((order, j) => {
      const to = { x: placeLeft, y: rightY[j] };
      const fed = linksOf((link) => link.place === order.placeId);
      if (fed.some((link) => link.kind === 'carried')) lines.push({ key: `cart-p-${order.placeId}`, from: { x: cartRight, y: cartY }, to, kind: 'carried' });
      if (fed.length === 0) lines.push({ key: `s-${order.placeId}`, from: { x: placeLeft - STUB, y: rightY[j] }, to, kind: 'stub' });
    });
  }

  const names = (list: string[]) => list.join(', ');
  const cargo = mainCargo(save.supply.cart.cargo);

  return (
    <View style={styles.wrap} accessibilityLabel={t('networkFlow.label')}>
      <View style={[styles.picture, { height }]} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        {lines.map((line) => (
          <Segment key={line.key} from={line.from} to={line.to} kind={line.kind} />
        ))}
        {width > 0 &&
          buildings.map((building, i) => {
            const name = buildingName(building);
            const stock = buildingStockTotal(settleBuilding(save, building, now));
            const stored = t('networkSheet.building.stored', { n: stock, cap: buildingCap(building) });
            const badge = buildingBadge(save, building, now);
            const own = linksOf((link) => link.building === building.id);
            const carried = own.filter((link) => link.kind === 'carried').map((link) => placeName(save.supply.orders[link.place]));
            const possible = own.filter((link) => link.kind === 'possible').map((link) => placeName(save.supply.orders[link.place]));
            const where =
              carried.length > 0
                ? t('networkFlow.goesTo', { names: names(carried) })
                : possible.length > 0
                  ? t('networkFlow.couldGo', { names: names(possible) })
                  : t('networkFlow.nothingWants');
            return (
              <FlowItem
                key={building.id}
                emoji={buildingEmoji[building.kind]}
                name={name}
                detail={stored}
                badge={badge && <BadgeIcon badge={badge} />}
                accessibilityLabel={[name, stored, where, ...(badge ? [badgeLabel(save, building, badge, name, now)] : [])].join(', ')}
                onPress={() => onBuilding(building.id)}
                style={{ left: 0, top: leftY[i] - ROW / 2, width: column }}
              />
            );
          })}
        {width > 0 && (
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={t('networkFlow.cartLabel', { state: cartState })}
            onPress={onCart}
            style={[styles.item, styles.cart, { left: cartLeft, top: cartY - ROW / 2, width: CART_W }]}
          >
            <View style={styles.cartIcons}>
              <GameIcon emoji="🐴" size={22} />
              {cargo && <GameIcon emoji={materialById[cargo]?.emoji ?? '📦'} icon={materialById[cargo]?.icon} size={14} />}
            </View>
            <Text style={styles.cartText} numberOfLines={2}>
              {cartState}
            </Text>
          </PressScale>
        )}
        {width > 0 &&
          places.map((order, j) => {
            const name = placeName(order);
            const filled = orderProgress(order) >= 1;
            const needed = Object.entries(stillNeeded(order)).filter(([, n]) => n > 0);
            const good = needed[0]?.[0];
            const left = needed.reduce((sum, [, n]) => sum + n, 0);
            const wants = filled
              ? t('networkFlow.filled')
              : order.wants === null
                ? t('networkFlow.wantsAny', { n: order.total - Math.round(orderProgress(order) * order.total) })
                : t('networkFlow.wants', { n: left, good: tr(materialById[good ?? '']?.name ?? good ?? '').toLowerCase() });
            const fed = linksOf((link) => link.place === order.placeId);
            const from = (kind: FlowLink['kind']) =>
              fed
                .filter((link) => link.kind === kind)
                .map((link) => {
                  const building = save.supply.buildings.find((entry) => entry.id === link.building);
                  return building ? buildingName(building) : '';
                });
            const source =
              from('carried').length > 0
                ? t('networkFlow.fedBy', { names: names(from('carried')) })
                : from('possible').length > 0
                  ? t('networkFlow.couldGet', { names: names(from('possible')) })
                  : filled
                    ? null
                    : t('networkFlow.nothingFeeds');
            const last = isLastDay(order.expiresAt, now);
            return (
              <FlowItem
                key={order.placeId}
                emoji={placeInfo[order.kind].emoji}
                name={name}
                detail={
                  good && !filled && order.wants !== null ? (
                    <IconLabel emoji={materialById[good]?.emoji ?? '📦'} icon={materialById[good]?.icon} label={wants} size={12} labelStyle={styles.itemDetail} />
                  ) : (
                    wants
                  )
                }
                badge={last && <BadgeIcon badge="last" />}
                accessibilityLabel={[
                  name,
                  wants,
                  ...(source ? [source] : []),
                  ...(last
                    ? [t('supply.time.lastDayLabel'), t('supply.leavesIn', { time: formatDuration(Math.max(0, order.expiresAt - now), false) })]
                    : []),
                ].join(', ')}
                onPress={() => onPlace(order)}
                style={{ left: placeLeft, top: rightY[j] - ROW / 2, width: column }}
              />
            );
          })}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendRow}>
          <View style={[styles.legendLine, styles.carried]} />
          <Text style={styles.legendText}>{t('networkFlow.legendCarried')}</Text>
        </View>
        <View style={styles.legendRow}>
          <View style={styles.legendDashes}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.legendDash} />
            ))}
          </View>
          <Text style={styles.legendText}>{t('networkFlow.legendPossible')}</Text>
        </View>
        {hidden > 0 && <Text style={styles.legendText}>{t('networkFlow.more', { count: hidden })}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, padding: 10, borderWidth: 3, borderColor: ui.outline, backgroundColor: ui.parchment },
  picture: { position: 'relative' },
  segment: { position: 'absolute' },
  carried: { backgroundColor: ui.route },
  dashes: { flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  item: {
    position: 'absolute',
    height: ROW,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 2,
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: ui.outline,
    backgroundColor: ui.parchmentShade,
  },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  itemName: { flex: 1, fontSize: 13, color: ui.ink },
  itemDetail: { fontSize: 12, color: ui.inkMuted, lineHeight: 14 },
  badgeAt: { position: 'absolute', top: -9, right: -9 },
  cart: { alignItems: 'center', backgroundColor: ui.woodMid, borderColor: ui.outline },
  cartIcons: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  cartText: { fontSize: 11, color: ui.onWood, textAlign: 'center', lineHeight: 13 },
  legend: { gap: 4 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendLine: { width: 24, height: 4 },
  legendDashes: { width: 24, flexDirection: 'row', gap: 3 },
  legendDash: { width: 6, height: 2, backgroundColor: ui.inkMuted },
  legendText: { fontSize: 13, color: ui.inkMuted },
});
