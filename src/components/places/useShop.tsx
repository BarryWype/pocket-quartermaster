import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { bossById } from '@/content/enemies';
import { gearName, itemById, materialById, recipeById } from '@/content/lookup';
import { weaknessByItem } from '@/content/weaknesses';
import { placeInfo, type SecretKind } from '@/content/places';
import { systemIcons } from '@/content/systemIcons';
import { wornBy } from '@/game/forging/salvage';
import { gearIconOf } from '@/game/gear/gearIcon';
import type { PlaceSpawn } from '@/game/places/generate';
import type { SheetAction } from '@/game/places/mainAction';
import {
  buyProblem,
  buysMaterials,
  gearSellPrice,
  materialSellPrice,
  placeStock,
  sellGearProblem,
  sellMaterialProblem,
  stockLeft,
  type BuyProblem,
  type SellGearProblem,
  type SellMaterialProblem,
  type StockLine,
} from '@/game/places/shops';
import type { GearInstance } from '@/game/types';
import { t, tr } from '@/i18n';
import { feel } from '@/services/feel';
import { useGameStore } from '@/store/gameStore';
import { fonts, ui } from '@/theme';

import { GearCard } from '../GearDetails';
import type { MapSheetAction, MapSheetSecondary, MapSheetTab, MapSheetView } from '../MapSheet';
import { PressScale } from '../motion';
import { formatPrice, Price } from '../Price';
import { RecipeInputs } from '../RecipeInputs';
import { Text } from '../Text';
import { ItemPopup, ItemSlot, WoodButton } from '../ui';
import { isStack, stockLook } from './placeText';
import type { usePlaceSheet } from './usePlaceSheet';

type Base = ReturnType<typeof usePlaceSheet>;
type Side = 'buy' | 'sell';
type ShopPick = { side: 'buy'; key: string } | { side: 'sell'; gear: string } | { side: 'sell'; material: string };

const TILE = 60;

/** A rule's problem in the main button's own words. */
export function blockedText(problem: string): string {
  switch (problem) {
    case 'soldOut':
      return t('placeSheet.blocked.soldOut');
    case 'gold':
      return t('placeSheet.blocked.gold');
    case 'known':
      return t('placeSheet.blocked.known');
    case 'worn':
      return t('placeSheet.blocked.worn');
    case 'notEnough':
      return t('placeSheet.blocked.notEnough');
    case 'notSmithy':
    case 'notMarket':
    case 'unsellable':
      return t('placeSheet.blocked.cantSell');
    case 'away':
      return t('placeSheet.blocked.away');
    case 'maxLevel':
      return t('placeSheet.blocked.maxLevel');
    case 'exhausted':
      return t('placeSheet.blocked.exhausted');
    default:
      return t('placeSheet.blocked.gone');
  }
}

/**
 * A place's shop, as a tab of tiles: Buy and, where the place buys, Sell.
 * Tapping a tile opens its card under the grid and turns the sheet's main
 * action into "Buy that"; stacks get a quantity, one-offs don't.
 */
export function useShop(place: PlaceSpawn, base: Base, now: number, { label, top }: { label?: string; top?: () => ReactNode } = {}) {
  const { save, decide, player } = base;
  const [side, setSide] = useState<Side>('buy');
  const [pick, setPick] = useState<ShopPick | null>(null);
  const [qty, setQty] = useState(1);
  const stock = placeStock(save, place, now);
  const sells = place.kind === 'smithy' || buysMaterials(place.kind);

  const sellGear = place.kind === 'smithy' ? save.gear.filter((g) => !wornBy(save, g.uid)) : [];
  const sellMaterials =
    place.kind !== 'smithy' && buysMaterials(place.kind)
      ? Object.entries(save.materials).filter(([id, count]) => count > 0 && materialSellPrice(id, place.kind) > 0)
      : [];

  const choose = (next: ShopPick | null) => {
    setPick(next);
    setQty(1);
  };

  const buyLine = pick?.side === 'buy' ? stock.find((line) => line.key === pick.key) : undefined;
  const gearPiece = pick && 'gear' in pick ? save.gear.find((g) => g.uid === pick.gear) : undefined;
  const material = pick && 'material' in pick ? pick.material : undefined;
  const held = material ? (save.materials[material] ?? 0) : 0;

  /** The most the stepper allows: what's left (and affordable) to buy, or what's held to sell. */
  const maxQty = buyLine
    ? Math.max(1, Math.min(stockLeft(save, place, buyLine), Math.floor(save.gold / Math.max(1, buyLine.price))))
    : material
      ? Math.max(1, held)
      : 1;
  const count = Math.min(qty, maxQty);

  /** The main action for the picked tile, or null when nothing is picked. */
  const pickedAction = (): MapSheetAction | null => {
    const actions = useGameStore.getState();
    if (buyLine) {
      const problem = buyProblem(save, place, buyLine.key, count, player, now);
      const name = stockLook(buyLine).name;
      const price = formatPrice(buyLine.price * count);
      return {
        state: decide<Exclude<BuyProblem, 'tooFar'>>(problem),
        verb: t('mapSheet.verbs.buy'),
        label: count > 1 ? t('placeSheet.buyCount', { count, name, price }) : t('placeSheet.buyOne', { name, price }),
        blockedLabel: problem ? blockedText(problem) : undefined,
        onPress: () => {
          actions.buyAtPlace(place, buyLine.key, count, player);
          feel('reward');
          // A one-off leaves the shelf; a stack stays picked, back to one.
          if (stockLeft(useGameStore.getState().save, place, buyLine) <= 0) choose(null);
          else setQty(1);
        },
        onWalk: base.onWalk,
      };
    }
    if (gearPiece) {
      const problem: SellGearProblem | null = sellGearProblem(save, place, gearPiece.uid, player, now);
      return {
        state: decide(problem),
        verb: t('mapSheet.verbs.sell'),
        label: t('placeSheet.sellOne', { name: gearName(gearPiece), price: formatPrice(gearSellPrice(gearPiece)) }),
        blockedLabel: problem ? blockedText(problem) : undefined,
        onPress: () => {
          actions.sellGearAtPlace(place, gearPiece.uid, player);
          feel('reward');
          choose(null);
        },
        onWalk: base.onWalk,
      };
    }
    if (material) {
      const problem: SellMaterialProblem | null = sellMaterialProblem(save, place, material, count, player, now);
      const name = tr(materialById[material].name);
      const price = formatPrice(materialSellPrice(material, place.kind) * count);
      return {
        state: decide(problem),
        verb: t('mapSheet.verbs.sell'),
        label: count > 1 ? t('placeSheet.sellCount', { count, name, price }) : t('placeSheet.sellOne', { name, price }),
        blockedLabel: problem ? blockedText(problem) : undefined,
        onPress: () => {
          actions.sellMaterialAtPlace(place, material, count, player);
          feel('reward');
          if ((useGameStore.getState().save.materials[material] ?? 0) <= 0) choose(null);
          else setQty(1);
        },
        onWalk: base.onWalk,
      };
    }
    return null;
  };

  /**
   * The shop's main action: the picked tile's, else "Buy" (or "Sell") that
   * opens the shop, and on the shop with nothing picked, a locked "Pick
   * something to buy". Far, the walk says "to trade".
   */
  const action = (view: MapSheetView): MapSheetAction => {
    const picked = pickedAction();
    if (picked) return picked;
    const onShop = view.full && view.tab === 'shop';
    const state: SheetAction = onShop ? decide<'pick'>('pick') : decide(null);
    return {
      state,
      verb: t('mapSheet.verbs.trade'),
      label: side === 'sell' ? t('placeSheet.side.sell') : t('placeSheet.side.buy'),
      blockedLabel: side === 'sell' ? t('placeSheet.pickToSell') : t('placeSheet.pickToBuy'),
      onPress: () => view.open('shop'),
      onWalk: base.onWalk,
    };
  };

  const sideSwitch = (next: Side) => {
    setSide(next);
    choose(null);
  };

  const tile = (key: string, look: { emoji: string; icon?: ReturnType<typeof stockLook>['icon']; name: string; frame?: string }, price: number, extra: { count?: number; out?: boolean; picked: boolean; onPress: () => void }) => (
    <View key={key} style={styles.tile}>
      <ItemSlot
        state={extra.picked ? 'selected' : extra.out ? 'short' : 'ready'}
        size={TILE}
        emoji={look.emoji}
        icon={look.icon}
        frame={look.frame}
        count={extra.count !== undefined && extra.count > 1 ? `×${extra.count}` : undefined}
        accessibilityLabel={t('placeSheet.tile', { name: look.name, price: formatPrice(price) })}
        onPress={extra.onPress}
      />
      {extra.out ? (
        <Text style={styles.tileNote} numberOfLines={1}>
          {t('places.soldOut')}
        </Text>
      ) : (
        <Price amount={price} short={side === 'buy' && save.gold < price} size={14} textStyle={styles.tilePrice} />
      )}
    </View>
  );

  const buyGrid = () =>
    stock.length === 0 ? (
      top ? null : (
        <Text style={styles.muted}>{t('placeSheet.nothingForSale')}</Text>
      )
    ) : (
      <View style={styles.grid}>
        {stock.map((line) => {
          const left = stockLeft(save, place, line);
          const known = line.kind === 'recipe' && buyProblem(save, place, line.key, 1, player, now) === 'known';
          return tile(line.key, stockLook(line), line.price, {
            count: isStack(line) ? left : undefined,
            out: left <= 0 || known,
            picked: pick?.side === 'buy' && pick.key === line.key,
            onPress: () => choose({ side: 'buy', key: line.key }),
          });
        })}
      </View>
    );

  const sellGrid = () => {
    if (sellGear.length === 0 && sellMaterials.length === 0) return <Text style={styles.muted}>{t('places.nothingToSell')}</Text>;
    return (
      <View style={styles.grid}>
        {sellGear.map((g) =>
          tile(g.uid, { emoji: itemById[g.itemId].emoji, icon: gearIconOf(g), name: gearName(g) }, gearSellPrice(g), {
            picked: !!pick && 'gear' in pick && pick.gear === g.uid,
            onPress: () => choose({ side: 'sell', gear: g.uid }),
          }),
        )}
        {sellMaterials.map(([id, n]) =>
          tile(id, { emoji: materialById[id].emoji, icon: materialById[id].icon ?? systemIcons[materialById[id].emoji], name: tr(materialById[id].name) }, materialSellPrice(id, place.kind), {
            count: n,
            picked: !!pick && 'material' in pick && pick.material === id,
            onPress: () => choose({ side: 'sell', material: id }),
          }),
        )}
      </View>
    );
  };

  /** The stepper for stacks: one fewer, the count, one more, and all of it. */
  const stepper = () =>
    maxQty > 1 ? (
      <View style={styles.stepper} accessibilityLabel={t('placeSheet.quantity')}>
        <WoodButton compact title="−" accessibilityLabel={t('placeSheet.fewer')} disabled={count <= 1} onPress={() => setQty(count - 1)} style={styles.step} />
        <Text style={styles.count} accessibilityLabel={t('placeSheet.quantityIs', { count })}>
          {count}
        </Text>
        <WoodButton compact title="+" accessibilityLabel={t('placeSheet.oneMore')} disabled={count >= maxQty} onPress={() => setQty(count + 1)} style={styles.step} />
        <WoodButton compact title={t('placeSheet.all', { count: maxQty })} disabled={count >= maxQty} onPress={() => setQty(maxQty)} />
      </View>
    ) : null;

  const card = () => {
    if (buyLine) return <StockCard line={buyLine} left={stockLeft(save, place, buyLine)} footer={isStack(buyLine) ? stepper() : null} />;
    if (gearPiece) return <GearCard gear={gearPiece} />;
    if (material) {
      const def = materialById[material];
      return (
        <ItemPopup title={tr(def.name)} emoji={def.emoji} icon={def.icon ?? systemIcons[def.emoji]} note={t('placeSheet.held', { count: held })}>
          {stepper()}
        </ItemPopup>
      );
    }
    return null;
  };

  const tab: MapSheetTab | null =
    stock.length > 0 || sells || top
      ? {
          key: 'shop',
          label: label ?? (sells ? t('placeSheet.tabs.shop') : t('placeSheet.tabs.buy')),
          render: () => (
            <View style={styles.shop}>
              {top?.()}
              {sells && (
                <View style={styles.sides} accessibilityRole="tablist">
                  {(['buy', 'sell'] as const).map((entry) => {
                    const on = side === entry;
                    return (
                      <PressScale
                        key={entry}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: on }}
                        onPress={() => sideSwitch(entry)}
                        style={[styles.side, on && styles.sideOn]}
                      >
                        <Text style={[styles.sideText, on && styles.sideTextOn]}>{t(`placeSheet.side.${entry}`)}</Text>
                      </PressScale>
                    );
                  })}
                </View>
              )}
              {side === 'sell' && sells ? sellGrid() : buyGrid()}
              {card()}
            </View>
          ),
        }
      : null;

  /** The other side of the shop as a secondary action ("Sell" beside "Buy"), off once the shop is showing. */
  const otherSide = (view: MapSheetView): MapSheetSecondary[] =>
    sells && !(view.full && view.tab === 'shop')
      ? [
          {
            key: 'side',
            title: side === 'buy' ? t('placeSheet.side.sell') : t('placeSheet.side.buy'),
            onPress: () => {
              sideSwitch(side === 'buy' ? 'sell' : 'buy');
              view.open('shop');
            },
          },
        ]
      : [];

  return { stock, sells, tab, action, pickedAction, otherSide };
}

/** A stock line's card: what it is, how many are left, and the stepper for a stack. */
function StockCard({ line, left, footer }: { line: StockLine; left: number; footer: ReactNode }) {
  const save = useGameStore((state) => state.save);
  const look = stockLook(line);
  const note = isStack(line) ? t('placeSheet.left', { count: left }) : undefined;
  if (line.kind === 'gear') return <GearCard gear={line.gear as GearInstance}>{footer}</GearCard>;
  if (line.kind === 'recipe') {
    return (
      <ItemPopup title={look.name} emoji={look.emoji} icon={look.icon} subtitle={t('tiles.blueprint')}>
        <View style={styles.inputs}>
          <RecipeInputs save={save} recipe={recipeById[line.id]} />
        </View>
      </ItemPopup>
    );
  }
  if (line.kind === 'tip') {
    return <ItemPopup title={look.name} emoji={look.emoji} subtitle={tr(placeInfo[line.id as SecretKind].description)} />;
  }
  const item = line.kind === 'item' ? itemById[line.id] : undefined;
  const weakness = line.kind === 'item' ? weaknessByItem[line.id] : undefined;
  return (
    <ItemPopup
      title={look.name}
      emoji={look.emoji}
      icon={look.icon}
      subtitle={item?.description ? tr(item.description) : undefined}
      note={note}
      lines={weakness ? [{ tone: 'keyword', text: t('places.weaknessFor', { boss: tr(bossById[weakness.bossId].name) }) }] : undefined}
    >
      {footer}
    </ItemPopup>
  );
}

const styles = StyleSheet.create({
  shop: { gap: 10 },
  sides: { flexDirection: 'row', gap: 6 },
  side: { minHeight: 44, minWidth: 80, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: ui.parchmentRule },
  sideOn: { borderColor: ui.ink, borderBottomWidth: 4, backgroundColor: ui.parchmentShade },
  sideText: { fontSize: 17, color: ui.inkMuted },
  sideTextOn: { color: ui.ink, fontFamily: fonts.serifBold },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { alignItems: 'center', gap: 2, width: TILE + 8 },
  tilePrice: { fontSize: 15 },
  tileNote: { fontSize: 13, color: ui.inkMuted },
  muted: { color: ui.inkMuted },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  step: { minWidth: 44 },
  count: { fontSize: 22, minWidth: 32, textAlign: 'center' },
  inputs: { gap: 4 },
});
