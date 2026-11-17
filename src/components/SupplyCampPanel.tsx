import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FillBar } from '@/components/motion';

import { IconLabel } from '@/components/IconLabel';
import { Overlay } from '@/components/Overlay';
import { ParchmentCard, WoodButton, EmberButton } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { TimerStrip } from '@/components/TimerStrip';
import { clockConfig } from '@/content/clockConfig';
import { heroClasses } from '@/content/heroes';
import { materialById } from '@/content/lookup';
import { supplyRules, tradeInfo } from '@/content/supplyLines';
import { distanceMeters } from '@/game/generation/geo';
import { tileCenter } from '@/game/generation/tiles';
import type { LatLng } from '@/game/generation/types';
import { buildingEmoji, buildingNameKey, isLastDay } from '@/game/supply/buildings';
import { collectProblem } from '@/game/supply/postings';
import { buildingCap, buildingRateParts, buildingStockTotal, settleBuilding } from '@/game/supply/production';
import { tradeLevel } from '@/game/supply/trades';
import type { Building } from '@/game/supply/types';
import { formatDistance, formatDuration, t, tr } from '@/i18n';
import { useNow } from '@/hooks/useNow';
import { debugEnabled, useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
import { colors, ui } from '@/theme';

import { PostHeroList } from './PostHeroList';
import { RaidBanner } from './RaidBanner';

type Props = { id: string; player: LatLng; onClose: () => void };

const HOUR = 3_600_000;

const buildingNameOf = (kind: Building['kind']) => t(buildingNameKey[kind]).toLowerCase();

/**
 * A building's sheet: the flow row reads left to right — who works it, what it
 * makes, what it holds, where it goes — then a card each for the worker, the
 * stock and the cart. One ember button: the next useful step.
 */
export function SupplyCampPanel({ id, player, onClose }: Props) {
  const building = useGameStore((s) => s.save.supply.buildings.find((entry) => entry.id === id)) ?? null;
  const save = useGameStore((s) => s.save);
  const recallPosted = useGameStore((s) => s.recallPosted);
  const collectBuilding = useGameStore((s) => s.collectBuilding);
  const debugOn = useDebugStore(debugEnabled);
  const debugRaid = useGameStore((s) => s.debugRaid);
  const debugExpireBuilding = useGameStore((s) => s.debugExpireBuilding);
  const now = useNow(clockConfig.minutesMs);
  const [posting, setPosting] = useState(false);
  const noteTips = useGameStore((s) => s.noteTips);
  // The first time a building's sheet opens, its tip waits for the map.
  useEffect(() => {
    noteTips(['supplyBuildingSheet']);
  }, [noteTips]);
  if (!building) return null;

  const settled = settleBuilding(save, building, now);
  const parts = buildingRateParts(save, building, now);
  const posted = settled.heroId ? save.heroes.find((h) => h.id === settled.heroId) ?? null : null;
  const stock = buildingStockTotal(settled);
  const cap = buildingCap(building);
  const full = stock >= cap;
  const closed = now < building.closedUntil;
  const last = isLastDay(building.expiresAt, now);
  const problem = collectProblem(save, building.id, player, now);
  const cart = save.supply.cart;
  // A route changed mid-loop is the one that counts from the next departure.
  const route = cart.nextRoute ?? cart.route;
  const stopIndex = route.findIndex((point) => 'building' in point && point.building === building.id);
  const onRoute = stopIndex !== -1;
  const running = onRoute && cart.loop !== null;
  const stopNumber = route.slice(0, stopIndex + 1).filter((point) => 'building' in point).length;
  const stopTotal = route.filter((point) => 'building' in point).length;
  const nextCall =
    cart.loop?.events.find((event) => event.kind === 'building' && event.buildingId === building.id && event.at > now)?.at ?? cart.loop?.endsAt ?? now;
  const rate = String(Math.round(parts.rate * 100) / 100);
  const hallDistance = save.supply.hall ? formatDistance(distanceMeters(tileCenter(save.supply.hall.cell), building.position)) : '';
  // The ember button is the next useful step: post when locals only, then the route, then collecting before it's lost.
  const emberPost = posted === null;
  const emberRoute = !emberPost && !onRoute;
  const emberCollect = !emberPost && !emberRoute && last;

  return (
    <Overlay onClose={onClose} position="bottom">
      <Sheet
        variant="wood"
        emoji={buildingEmoji[building.kind]}
        title={
          <View style={styles.titleRow}>
            <Text style={styles.title}>{t(buildingNameKey[building.kind])}</Text>
            <Text style={styles.stars}>{`${'★'.repeat(building.quality)}${'☆'.repeat(3 - building.quality)}`}</Text>
          </View>
        }
        subtitle={t('supply.building.sub', { n: building.quality, distance: hallDistance })}
        footer={<WoodButton title={t('common.close')} onPress={onClose} />}
      >
        <View style={styles.body}>
          <RaidBanner buildingId={building.id} />
          <TimerStrip expiresAt={building.expiresAt} />
          <View style={styles.flow}>
            {posted ? (
              <View style={styles.node}>
                <IconLabel
                  emoji={heroClasses[posted.classId].emoji}
                  icon={heroClasses[posted.classId].icon}
                  label={posted.name}
                  size={24}
                  labelStyle={styles.nodeText}
                />
              </View>
            ) : (
              <View style={styles.node}>
                <IconLabel
                  emoji="🧑‍🌾"
                  label={`${t('supply.building.flow.locals')} ${t('supply.building.flow.share', { share: Math.round(supplyRules.production.localsShare * 100) })}`}
                  size={18}
                  labelStyle={styles.nodeText}
                />
              </View>
            )}
            <Text style={styles.arrow}>→</Text>
            {closed || full ? (
              <View style={styles.node}>
                <IconLabel emoji="⏸" label={t('supply.building.flow.stopped')} size={18} labelStyle={styles.nodeText} />
              </View>
            ) : (
              <View style={styles.node}>
                {Object.keys(supplyRules.buildings.kinds[building.kind].makes).map((materialId) => (
                  <IconLabel
                    key={materialId}
                    emoji={materialById[materialId]?.emoji ?? '❔'}
                    icon={materialById[materialId]?.icon}
                    label=""
                    size={16}
                  />
                ))}
                <Text style={styles.nodeText}>{t('supply.site.perHour', { rate })}</Text>
              </View>
            )}
            <Text style={styles.arrow}>→</Text>
            <View style={styles.node}>
              <Text style={styles.nodeBold}>{stock}</Text>
              <Text style={styles.nodeMuted}>{full ? t('supply.building.flow.full') : t('supply.building.flow.ofCap', { cap })}</Text>
            </View>
            <Text style={styles.arrow}>→</Text>
            <View style={styles.node}>
              {running ? (
                <IconLabel
                  emoji="🐴"
                  label={t('supply.building.flow.callsIn', { time: formatDuration(Math.max(0, nextCall - now), false) })}
                  size={18}
                  labelStyle={styles.nodeText}
                />
              ) : onRoute ? (
                <IconLabel emoji="🐴" label={t('supply.building.flow.parked')} size={18} labelStyle={styles.nodeText} />
              ) : (
                <IconLabel emoji="🏠" label={t('supply.building.flow.youCollect')} size={18} labelStyle={styles.nodeText} />
              )}
            </View>
          </View>

          <ParchmentCard title={t('supply.building.workedBy')} contentStyle={styles.card}>
            {posted ? (
              <View style={styles.cardRow}>
                <IconLabel
                  emoji={heroClasses[posted.classId].emoji}
                  icon={heroClasses[posted.classId].icon}
                  label={t('supply.building.postedLine', {
                    name: posted.name,
                    trade: tr(tradeInfo[posted.trade.id].name),
                    level: tradeLevel(posted.trade.hours),
                  })}
                  size={24}
                  labelStyle={styles.line}
                />
                <Text style={styles.line}>
                  {t('supply.building.postedRate', { bonus: Math.round(parts.tradeBonus * 100), rate })}
                </Text>
                <WoodButton compact title={t('jobs.recall')} onPress={() => recallPosted(posted.id)} />
              </View>
            ) : (
              <View style={styles.cardRow}>
                <View style={styles.slotEmpty}>
                  <Text style={styles.slotPlus}>+</Text>
                </View>
                <Text style={styles.line}>
                  {t('supply.building.localsLine', {
                    share: Math.round(supplyRules.production.localsShare * 100),
                    trade: tr(tradeInfo[supplyRules.matchingTrade[building.kind]].name),
                    bonus: Math.round(supplyRules.production.tradeBonus[2] * 100),
                  })}
                </Text>
                {emberPost ? (
                  <EmberButton compact title={t('supply.building.post')} onPress={() => setPosting(true)} />
                ) : (
                  <WoodButton compact title={t('supply.building.post')} onPress={() => setPosting(true)} />
                )}
              </View>
            )}
            {posting && <PostHeroList building={settled} />}
          </ParchmentCard>

          <ParchmentCard
            title={t('supply.building.stock')}
            titleSub={
              full
                ? t('supply.building.fullMakingNothing')
                : parts.rate > 0
                  ? t('supply.building.fullIn', { time: formatDuration(((cap - stock) / parts.rate) * HOUR, false) })
                  : undefined
            }
            contentStyle={styles.card}
          >
            <FillBar value={cap > 0 ? stock / cap : 0} />
            <View style={styles.materials}>
              {Object.entries(settled.stock)
                .filter(([, amount]) => amount > 0)
                .map(([materialId, amount]) => (
                  <IconLabel
                    key={materialId}
                    emoji={materialById[materialId]?.emoji}
                    icon={materialById[materialId]?.icon}
                    label={String(amount)}
                    size={16}
                  />
                ))}
            </View>
            {problem === null ? (
              emberCollect ? (
                <EmberButton compact title={t('supply.building.collectNow', { n: stock })} onPress={() => collectBuilding(building.id, player)} />
              ) : (
                <WoodButton
                  compact
                  title={last ? t('supply.building.collectNow', { n: stock }) : t('jobs.collect')}
                  onPress={() => collectBuilding(building.id, player)}
                />
              )
            ) : (
              <Text style={styles.line}>
                {problem === 'tooFar'
                  ? t('supply.building.collectWalk', { building: buildingNameOf(building.kind), distance: formatDistance(distanceMeters(player, building.position)) })
                  : t('supply.building.collectEmpty')}
              </Text>
            )}
          </ParchmentCard>

          <ParchmentCard title={t('supply.building.cart')} contentStyle={styles.card}>
            {running ? (
              <Text style={styles.line}>
                {t('supply.building.cartStop', {
                  n: stopNumber,
                  m: stopTotal,
                  time: formatDuration(Math.max(0, nextCall - now), false),
                })}
              </Text>
            ) : onRoute ? (
              <Text style={styles.line}>{t('supply.building.cartStopParked', { n: stopNumber, m: stopTotal })}</Text>
            ) : (
              <View style={styles.cardRow}>
                <Text style={styles.line}>{t('supply.building.cartOff')}</Text>
                {emberRoute ? (
                  <EmberButton compact title={t('supply.building.addToRoute')} onPress={() => useMapPanels.getState().openRoutePlanner([...route, { building: building.id }])} />
                ) : (
                  <WoodButton compact title={t('supply.building.addToRoute')} onPress={() => useMapPanels.getState().openRoutePlanner([...route, { building: building.id }])} />
                )}
              </View>
            )}
          </ParchmentCard>

          {last && (
            <View style={styles.lastDay}>
              <Text style={styles.lastDayLead}>
                {t('supply.building.lastDayLead', { building: buildingNameOf(building.kind), time: formatDuration(Math.max(0, building.expiresAt - now), false) })}
              </Text>
              <Text style={styles.line}>
                {posted
                  ? `${t('supply.building.lastDayLoss')} ${t('supply.building.lastDayHero', { hero: posted.name })}`
                  : t('supply.building.lastDayLoss')}
              </Text>
            </View>
          )}

          {debugOn && (
            <View style={styles.debugRow}>
              <WoodButton compact title={t('supply.building.expireNow')} onPress={() => debugExpireBuilding(building.id)} />
              <WoodButton compact title={t('supply.raid.debug')} onPress={() => debugRaid(building.id)} />
            </View>
          )}
        </View>
      </Sheet>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 23, color: ui.brassLight },
  stars: { fontSize: 18, color: ui.brassLight },
  flow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  node: { alignItems: 'center', gap: 2 },
  nodeText: { color: ui.ink },
  nodeBold: { color: ui.ink, fontWeight: 'bold' },
  nodeMuted: { color: ui.inkMuted, fontSize: 12 },
  arrow: { color: ui.inkMuted },
  card: { gap: 8 },
  cardRow: { gap: 8 },
  line: { color: ui.ink },
  materials: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  lastDay: { gap: 2, padding: 10, borderWidth: 2, borderColor: colors.danger, backgroundColor: ui.parchmentShade },
  lastDayLead: { color: ui.ink, fontWeight: 'bold' },
  debugRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  slotEmpty: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: ui.brass,
  },
  slotPlus: { color: ui.inkMuted },
});
