import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { itemById, materialById } from '@/content/lookup';
import { materialPrices } from '@/content/shops';
import { networkGoods, supplyRules } from '@/content/supplyLines';
import { distanceMeters } from '@/game/generation/geo';
import type { LatLng } from '@/game/generation/types';
import { mergeLoot } from '@/game/loot/roll';
import { lootTiles, type RewardTile } from '@/game/loot/tiles';
import type { PlaceSpawn } from '@/game/places/generate';
import { buildingNameKey } from '@/game/supply/buildings';
import { upcomingUnload } from '@/game/supply/cart';
import {
  deliverFromBag,
  deliverProblem,
  isOrderKind,
  orderPlaceName,
  orderProgress,
  reachedSteps,
  stillNeeded,
} from '@/game/supply/orders';
import type { BuildingKind } from '@/game/supply/types';
import { tavernNameOf } from '@/game/taverns/taverns';
import { useSupplyOn } from '@/hooks/useSupply';
import { formatDistance, formatDuration, formatPercent, t, tr } from '@/i18n';
import { feel } from '@/services/feel';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
import { fonts, ui } from '@/theme';

import { GameIcon } from './GameIcon';
import { IconLabel } from './IconLabel';
import { LootGrid } from './LootGrid';
import { Price } from './Price';
import { Text } from './Text';
import { FillBar } from './motion';
import { EmberButton, ParchmentCard, WoodButton } from './ui';

/** Gold per unit of a good, as an order pays it. */
const unitGold = (good: string) => supplyRules.orders.goldPerUnitShare * materialPrices[good];

/** The building kind that makes a good, whose name the build hint shows. */
const buildingFor = (good: string): BuildingKind | undefined =>
  (Object.keys(supplyRules.buildings.kinds) as BuildingKind[]).find((kind) => good in supplyRules.buildings.kinds[kind].makes);

/** The still-needed line, its left count in bold: the count sits inside the translated sentence, so the string is split around it. */
function StillNeeded({ left, total }: { left: number; total: number }) {
  const sentence = t('supply.order.stillNeeded', { left, total });
  const at = sentence.indexOf(String(left));
  if (at < 0) return <Text style={styles.small}>{sentence}</Text>;
  return (
    <Text style={styles.small}>
      {sentence.slice(0, at)}
      <Text style={styles.bold}>{left}</Text>
      {sentence.slice(at + String(left).length)}
    </Text>
  );
}

type Props = { place: PlaceSpawn; player: LatLng; now: number };

/**
 * The order a discovered tavern, smithy, apothecary or market holds: its time
 * left, its headline reward, its steps and their claims, what it wants, and
 * delivering from the bag. The place's sheet keeps its usual content below.
 */
export function OrderSection({ place, player, now }: Props) {
  const supplyOn = useSupplyOn();
  const save = useGameStore((state) => state.save);
  const [claimedTiles, setClaimedTiles] = useState<RewardTile[] | null>(null);
  const [deliveredGold, setDeliveredGold] = useState<number | null>(null);
  const order = save.supply.orders[place.id];
  if (!supplyOn || !isOrderKind(place.kind) || !(place.id in save.supply.discovered) || !order) return null;

  const actions = useGameStore.getState();
  const progress = orderProgress(order);
  const needed = stillNeeded(order);
  const reached = reachedSteps(order);
  const claimIndex = order.steps.findIndex((step) => step.at <= progress && !step.claimed);
  const filled = progress >= 1 && order.steps.every((step) => step.claimed);
  const problem = deliverProblem(save, place.id, place.position, player);
  const placeName = orderPlaceName(order, tavernNameOf);
  const goods = order.wants === null ? networkGoods : Object.keys(order.wants);
  const eachGold = Math.min(...goods.map(unitGold));
  const headlineId = order.headline.consumables[0]?.itemId ?? order.headline.gear[0]?.itemId;
  const headline = headlineId ? itemById[headlineId] : undefined;
  // The cart's side of the order: what the running loop will still unload here, and the way to put the place on its route.
  const cart = save.supply.cart;
  const route = cart.nextRoute ?? cart.route;
  const onRoute = route.some((point) => 'place' in point && point.place === place.id);
  const upcoming = upcomingUnload(save, place.id, now);
  const callAt = cart.loop?.events.find((event) => event.kind === 'place' && event.placeId === place.id && event.at > cart.settledAt)?.at;
  // The preview is the delivery itself, run on the current save: what hands over and what it pays can't drift from the real thing.
  const preview = problem === null ? deliverFromBag(save, place.id, place.position, player, now) : null;

  const deliver = () => {
    const { gold } = actions.deliverOrder(place.id, place.position, player);
    feel('reward');
    setDeliveredGold(gold);
  };

  if (filled) {
    const tiles = order.steps.flatMap((step) => lootTiles(step.at === 1 ? mergeLoot(step.reward, order.headline) : step.reward));
    return (
      <ParchmentCard contentStyle={styles.card}>
        <View style={styles.bannerRow}>
          <GameIcon emoji="✅" size={18} />
          <Text style={styles.name}>{t('supply.order.filled', { place: placeName })}</Text>
        </View>
        <LootGrid tiles={tiles} size={40} />
        <Text style={styles.muted}>{t('supply.order.claimedPlus', { gold: order.goldPaid })}</Text>
      </ParchmentCard>
    );
  }

  return (
    <View style={styles.section}>
      <View style={styles.headlineRow}>
        <LootGrid tiles={lootTiles(order.headline)} size={64} />
        <View style={styles.headlineText}>
          <Text style={styles.name}>{headline ? tr(headline.name) : ''}</Text>
          <Text style={styles.small}>
            {headline?.description ? `${tr(headline.description)} ` : ''}
            <Text style={styles.bold}>{t('supply.order.onlyHere')}</Text>
          </Text>
          {reached.length === 0 && <Text style={styles.muted}>{t('supply.order.forFilling')}</Text>}
        </View>
      </View>
      <View
        style={styles.barWrap}
        accessible
        accessibilityLabel={t('supply.order.barLabel', { pct: Math.round(progress * 100) })}
      >
        <FillBar value={progress} />
        {supplyRules.orders.steps.slice(0, -1).map((at) => (
          <View key={at} style={[styles.notch, { left: `${at * 100}%` }]} />
        ))}
      </View>
      <View style={styles.stepsRow}>
        <Text style={styles.bold}>{formatPercent(progress)}</Text>
        {order.steps.map((step, i) => (
          <View
            key={i}
            style={styles.stepTile}
            accessibilityLabel={t('supply.order.stepLabel', { pct: Math.round(step.at * 100) })}
          >
            <Text style={styles.small}>{formatPercent(step.at)}</Text>
            <View style={step.claimed && styles.claimed}>
              <LootGrid tiles={lootTiles(step.reward)} size={40} />
            </View>
            {step.claimed && <Text style={styles.check}>✓</Text>}
          </View>
        ))}
      </View>
      {claimIndex >= 0 && !claimedTiles && (
        <EmberButton
          compact
          title={t('supply.order.claim', { pct: Math.round(order.steps[claimIndex].at * 100) })}
          onPress={() => {
            const before = useGameStore.getState().save;
            const paid = actions.claimOrderStep(place.id, claimIndex);
            feel('reward');
            setClaimedTiles(lootTiles(paid, { before }));
          }}
        />
      )}
      {claimedTiles && <LootGrid tiles={claimedTiles} reveal />}
      <View style={styles.wants}>
        <View style={styles.spread}>
          <Text style={styles.name}>{t('supply.order.wants')}</Text>
          <View style={styles.eachRow}>
            <Price amount={eachGold} />
            <Text style={styles.muted}>{t('supply.order.each')}</Text>
          </View>
        </View>
        {order.wants === null ? (
          <View style={styles.spread}>
            <View style={styles.goodRow}>
              <Text>{t('supply.order.anyGood')}</Text>
              {networkGoods.map((good) => (
                <GameIcon key={good} emoji={materialById[good].emoji} icon={materialById[good].icon} size={14} />
              ))}
            </View>
            <StillNeeded left={order.total - Object.values(order.delivered).reduce((sum, n) => sum + n, 0)} total={order.total} />
          </View>
        ) : (
          Object.entries(order.wants).map(([good, total]) => (
            <View key={good} style={styles.spread}>
              <IconLabel emoji={materialById[good].emoji} icon={materialById[good].icon} label={tr(materialById[good].name)} />
              <StillNeeded left={needed[good]} total={total} />
            </View>
          ))
        )}
        {order.wants !== null &&
          Object.keys(order.wants)
            .filter(
              (good) =>
                (save.materials[good] ?? 0) === 0 &&
                !save.supply.buildings.some((building) => good in supplyRules.buildings.kinds[building.kind].makes),
            )
            .map((good) => {
              const building = buildingFor(good);
              return building ? (
                <Text key={good} style={styles.muted}>
                  {t('supply.order.buildHint', { good: tr(materialById[good].name), building: t(buildingNameKey[building]) })}
                </Text>
              ) : null;
            })}
      </View>
      {upcoming && callAt !== undefined && (
        <View style={styles.handsRow}>
          <Text style={styles.small}>{t('supply.order.onItsWay')}</Text>
          {Object.entries(upcoming).map(([good, take]) => (
            <IconLabel
              key={good}
              emoji={materialById[good].emoji}
              icon={materialById[good].icon}
              label={`×${take}`}
              size={14}
              labelStyle={styles.small}
            />
          ))}
          <Text style={styles.small}>{t('supply.order.inTime', { time: formatDuration(Math.max(0, callAt - now), false) })}</Text>
        </View>
      )}
      {!onRoute && (
        <WoodButton
          compact
          title={t('supply.building.addToRoute')}
          onPress={() => useMapPanels.getState().openRoutePlanner([...route, { place: place.id, position: place.position }])}
        />
      )}
      {preview ? (
        <>
          <View style={styles.handsRow}>
            <Text style={styles.small}>{t('supply.order.handsOver')}</Text>
            {Object.entries(preview.delivered).map(([good, take]) => (
              <IconLabel
                key={good}
                emoji={materialById[good].emoji}
                icon={materialById[good].icon}
                label={`×${take}`}
                size={14}
                labelStyle={styles.small}
              />
            ))}
            <Price amount={preview.gold} />
          </View>
          <EmberButton compact title={t('supply.order.deliver')} onPress={deliver} />
        </>
      ) : (
        <>
          <WoodButton compact disabled title={t('supply.order.deliver')} onPress={deliver} />
          {problem === 'notHere' && (
            <Text style={styles.reason}>
              {t('supply.order.walkToDeliver', {
                place: placeName,
                distance: formatDistance(distanceMeters(player, place.position)),
              })}
            </Text>
          )}
          {problem === 'nothingToGive' && <Text style={styles.reason}>{t('supply.order.carryNothing')}</Text>}
        </>
      )}
      {deliveredGold !== null && <Text style={styles.note}>{t('supply.order.deliveredNote', { gold: deliveredGold })}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },
  card: { gap: 8 },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headlineRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  headlineText: { flex: 1, gap: 2 },
  barWrap: { position: 'relative' },
  notch: { position: 'absolute', top: -2, bottom: -2, width: 2, backgroundColor: ui.outline },
  stepsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 10 },
  stepTile: { gap: 2 },
  claimed: { opacity: 0.5 },
  check: { fontSize: 16, color: ui.ink, fontFamily: fonts.serifBold },
  wants: { gap: 6, padding: 10, borderWidth: 2, borderColor: ui.outline, backgroundColor: ui.parchmentShade },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  eachRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  goodRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  handsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { fontSize: 21 },
  small: { fontSize: 15 },
  bold: { fontFamily: fonts.serifBold },
  muted: { color: ui.inkMuted },
  reason: { color: ui.inkMuted, fontStyle: 'italic' },
  note: { color: ui.ink },
});
