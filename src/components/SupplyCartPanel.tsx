import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconLabel } from '@/components/IconLabel';
import { Overlay } from '@/components/Overlay';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { EmberButton, WoodButton } from '@/components/ui';
import { clockConfig } from '@/content/clockConfig';
import { heroClasses } from '@/content/heroes';
import { materialById } from '@/content/lookup';
import { supplyRules } from '@/content/supplyLines';
import { cartCapacity, cartProblem, cartSpeedMps, crewProblem, routePreview, settleCart } from '@/game/supply/cart';
import type { CartLogLine } from '@/game/supply/types';
import { currentHp, isExhausted, maxHp } from '@/game/team/health';
import { isBusy } from '@/game/team/team';
import type { SaveData } from '@/game/save';
import { formatDistance, formatDuration, formatPercent, t, tr } from '@/i18n';
import { ambushText } from '@/hooks/useCartTick';
import { useNow } from '@/hooks/useNow';
import { useGameStore } from '@/store/gameStore';
import { useMapPanels } from '@/store/mapPanelsStore';
import { ui } from '@/theme';

import { HeroChoiceList } from './PostHeroList';
import { TradeLabel } from './TradeLabel';

type Slot = 'driver' | 0 | 1;

const amountsText = (amounts: Record<string, number>) =>
  Object.entries(amounts)
    .filter(([, amount]) => amount > 0)
    .map(([id, amount]) => `${amount} ${tr(materialById[id]?.name ?? id)}`)
    .join(', ');

/** A log line: when, what was delivered, and the ambush if any. */
function logText(line: CartLogLine, now: number): string {
  const delivered = amountsText(line.delivered) || t('supply.cart.nothingDelivered');
  const base = t('supply.cart.logLine', { n: line.n, time: formatDuration(now - line.endedAt, false), delivered });
  const ambush = ambushText(line);
  return ambush ? `${base} · ${ambush}` : base;
}

/** The crew members too hurt to set out again. */
function hurtNames(save: SaveData, crew: string[], now: number): string {
  return save.heroes
    .filter((hero) => crew.includes(hero.id))
    .filter((hero) => isExhausted(hero, now) || currentHp(save, hero, now) < supplyRules.cart.minCrewHpShare * maxHp(save, hero))
    .map((hero) => hero.name)
    .join(', ');
}

/** The cart's sheet: where it is, its route, its crew, starting and stopping it, and its last loops. */
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
  const preview = routePreview(save, cart.route, now);
  const camps = cart.route.filter((point) => 'camp' in point && save.supply.camps.some((camp) => camp.id === point.camp)).length;
  const problem = cartProblem(save, now);
  const parked = loop === null;
  const stopping = loop !== null && cart.nextRoute !== null && cart.nextRoute.length === 0;

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

  const status = loop
    ? t('supply.cart.running', { n: loop.n, time: formatDuration(Math.max(0, loop.endsAt - now), false) })
    : cart.waitingForCrew
      ? t('supply.cart.waiting', { names: hurtNames(save, crewIds, now) })
      : t('supply.cart.parked');
  const problemText: Record<Exclude<typeof problem, null | 'running'>, string> = {
    noHall: t('supply.cart.noHall'),
    noRoute: t('supply.cart.noRouteYet'),
    crewBusy: t('supply.cart.crewBusy'),
    crewHurt: t('supply.cart.crewHurt'),
  };
  const slots: Slot[] = ['driver', ...Array.from({ length: supplyRules.cart.maxEscorts }, (_, i) => i as 0 | 1)];

  return (
    <Overlay onClose={onClose} position="bottom">
      <Sheet variant="wood" emoji="🐴" title={t('supply.cart.title')} footer={<WoodButton title={t('common.close')} onPress={onClose} />}>
        <View style={styles.body}>
          <Text style={styles.line}>{status}</Text>
          {stopping && <Text style={styles.muted}>{t('supply.cart.stopping')}</Text>}
          {loop && amountsText(cart.cargo) !== '' && (
            <View style={styles.materials}>
              <Text style={styles.muted}>{t('supply.cart.aboard')}</Text>
              {Object.entries(cart.cargo)
                .filter(([, amount]) => amount > 0)
                .map(([id, amount]) => (
                  <IconLabel key={id} emoji={materialById[id]?.emoji} icon={materialById[id]?.icon} label={String(amount)} size={16} />
                ))}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.heading}>{t('supply.cart.route')}</Text>
            {camps === 0 ? (
              <Text style={styles.muted}>{t('supply.cart.noRoute')}</Text>
            ) : (
              <>
                <Text style={styles.line}>
                  {t('supply.cart.routeLine', { count: camps, distance: formatDistance(preview.meters), minutes: Math.round(preview.loopMinutes) })}
                </Text>
                <Text style={styles.line}>{t('supply.cart.ambushChance', { percent: formatPercent(preview.ambushChance) })}</Text>
              </>
            )}
            <WoodButton title={t('supply.cart.planRoute')} onPress={() => useMapPanels.getState().planRoute(cart.nextRoute ?? cart.route)} />
          </View>

          <View style={styles.section}>
            <Text style={styles.heading}>{t('supply.cart.crew')}</Text>
            <Text style={styles.muted}>
              {t('supply.cart.pace', { speed: ((cartSpeedMps(save) * 3600) / 1000).toFixed(1), capacity: cartCapacity(save) })}
            </Text>
            {!parked && <Text style={styles.muted}>{t('supply.cart.crewLocked')}</Text>}
            {slots.map((slot) => {
              const hero = slotHero(slot);
              return (
                <View key={String(slot)} style={styles.slot}>
                  <View style={styles.slotRow}>
                    <View style={styles.who}>
                      <Text style={styles.muted}>{t(slot === 'driver' ? 'supply.cart.driver' : 'supply.cart.escort')}</Text>
                      <Text style={styles.line}>{hero ? `${hero.name} · ${tr(heroClasses[hero.classId].name)}` : t('supply.cart.empty')}</Text>
                    </View>
                    {hero && <TradeLabel trade={hero.trade.id} hours={hero.trade.hours} />}
                    {parked && (
                      <WoodButton compact title={t('supply.cart.change')} onPress={() => setPicking(picking === slot ? null : slot)} />
                    )}
                  </View>
                  {picking === slot && (
                    <View style={styles.picker}>
                      <HeroChoiceList heroes={candidates(slot)} action={t('supply.cart.change')} onPick={(heroId) => assign(slot, heroId)} />
                      {hero && <WoodButton compact title={t('supply.cart.leaveEmpty')} onPress={() => assign(slot, null)} />}
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {parked ? (
            <View style={styles.section}>
              <EmberButton
                title={t(cart.waitingForCrew ? 'supply.cart.startAgain' : 'supply.cart.start')}
                disabled={problem !== null}
                onPress={startCart}
              />
              {problem !== null && problem !== 'running' && <Text style={styles.muted}>{problemText[problem]}</Text>}
            </View>
          ) : (
            !stopping && <WoodButton title={t('supply.cart.stop')} onPress={stopCart} />
          )}

          <View style={styles.section}>
            <Text style={styles.heading}>{t('supply.cart.log')}</Text>
            {cart.log.length === 0 ? (
              <Text style={styles.muted}>{t('supply.cart.noLog')}</Text>
            ) : (
              [...cart.log].reverse().map((line) => (
                <Text key={line.n} style={styles.line}>
                  {logText(line, now)}
                </Text>
              ))
            )}
          </View>
        </View>
      </Sheet>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  body: { gap: 14 },
  section: { gap: 6 },
  heading: { fontSize: 18, color: ui.ink },
  line: { color: ui.ink },
  muted: { color: ui.inkMuted },
  materials: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  slot: { gap: 6 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  who: { flex: 1 },
  picker: { paddingLeft: 8, gap: 6 },
});
