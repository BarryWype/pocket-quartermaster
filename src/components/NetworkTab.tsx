import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FillBar } from '@/components/motion';

import { IconLabel } from '@/components/IconLabel';
import { Text } from '@/components/Text';
import { EmberButton, ParchmentCard, WoodButton } from '@/components/ui';
import { clockConfig } from '@/content/clockConfig';
import { campResource, supplyRules, tradeInfo } from '@/content/supplyLines';
import { distanceMeters } from '@/game/generation/geo';
import { tileCenter } from '@/game/generation/tiles';
import { routePreview } from '@/game/supply/cart';
import { campCap, campRateParts, campStockTotal, settleCamp } from '@/game/supply/production';
import { tradeLevel } from '@/game/supply/trades';
import type { Camp } from '@/game/supply/types';
import { formatDistance, formatDuration, t, tr } from '@/i18n';
import { raidText } from '@/hooks/useCartTick';
import { useNow } from '@/hooks/useNow';
import { useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';
import { ui } from '@/theme';

import { PostHeroList } from './PostHeroList';
import { RaidBanner } from './RaidBanner';
import { RichnessPips } from './SupplyCellPanel';
import { SupplyCartPanel } from './SupplyCartPanel';

/** A landed raid's outcome stays on the tab this long. */
const LAST_RAID_SHOWN_MS = 24 * 3_600_000;

/** The Expeditions screen's Network tab: the hall, every camp's line of numbers, and the cart. */
export function NetworkTab() {
  const save = useGameStore((s) => s.save);
  const player = useWorldStore((s) => s.player);
  const offset = useDebugStore((s) => s.supplyPeriodOffset);
  const now = useNow(clockConfig.minutesMs);
  const hall = save.supply.hall;
  const camps = save.supply.camps;
  const [cartOpen, setCartOpen] = useState(false);

  const lastRaid = save.supply.raidLog.at(-1);

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
      {camps.length === 0 ? (
        <Text style={styles.line}>{t('supply.network.empty')}</Text>
      ) : (
        camps.map((camp) => <CampCard key={camp.id} camp={camp} now={now} offset={offset} />)
      )}
      <CartCard now={now} onOpen={() => setCartOpen(true)} />
      {cartOpen && <SupplyCartPanel onClose={() => setCartOpen(false)} />}
    </View>
  );
}

/** The cart's card: where it is, its route in one line, its crew, and the way into its sheet. */
function CartCard({ now, onOpen }: { now: number; onOpen: () => void }) {
  const save = useGameStore((s) => s.save);
  const cart = save.supply.cart;
  const camps = cart.route.filter((point) => 'camp' in point && save.supply.camps.some((camp) => camp.id === point.camp)).length;
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
        {camps === 0
          ? t('supply.cart.noRoute')
          : t('supply.cart.routeLine', { count: camps, distance: formatDistance(preview.meters), minutes: Math.round(preview.loopMinutes) })}
      </Text>
      <Text style={styles.line}>{crew.length > 0 ? crew.join(', ') : t('supply.cart.noCrew')}</Text>
      <WoodButton title={t('supply.cart.open')} onPress={onOpen} />
    </ParchmentCard>
  );
}

/** One camp's card: its ground, rate, stock and posting. */
function CampCard({ camp, now, offset }: { camp: Camp; now: number; offset: number }) {
  const save = useGameStore((s) => s.save);
  const recallPosted = useGameStore((s) => s.recallPosted);
  const [posting, setPosting] = useState(false);
  const settled = settleCamp(save, camp, now, offset);
  const parts = campRateParts(save, camp, now, offset);
  const posted = settled.heroId ? save.heroes.find((h) => h.id === settled.heroId) ?? null : null;
  const stock = campStockTotal(settled);
  const cap = campCap(camp, now, offset);
  const rate = String(Math.round(parts.rate * 100) / 100);

  return (
    <ParchmentCard
      title={t(camp.kind === 'timber' ? 'supply.camp.timberName' : 'supply.camp.trapperName')}
      titleEmoji={camp.kind === 'timber' ? '🪵' : '🪤'}
      titleSub={posted ? t('supply.camp.postedHero', { name: posted.name }) : t('supply.camp.locals', { share: Math.round(supplyRules.production.localsShare * 100) })}
      contentStyle={styles.card}
    >
      <View style={styles.richnessRow}>
        <IconLabel emoji={camp.kind === 'timber' ? '🪵' : '🦌'} label={t(campResource[camp.kind] === 'timber' ? 'supply.resource.timber' : 'supply.resource.game')} size={16} />
        <RichnessPips level={parts.richness} />
      </View>
      <Text style={styles.line}>{t(camp.kind === 'timber' ? 'supply.camp.rateTimber' : 'supply.camp.rateTrapper', { rate })}</Text>
      {posted && parts.tradeBonus > 0 && (
        <Text style={styles.line}>
          {t('supply.camp.tradeBonus', {
            trade: tr(tradeInfo[posted.trade.id].name),
            level: tradeLevel(posted.trade.hours),
            percent: Math.round(parts.tradeBonus * 100),
          })}
        </Text>
      )}
      <View style={styles.stockRow}>
        <FillBar value={cap > 0 ? stock / cap : 0} />
        <Text style={styles.stockText}>{`${stock} / ${cap}`}</Text>
      </View>
      <Text style={styles.line}>{t('supply.network.collectAtCamp')}</Text>
      {posted ? (
        <WoodButton title={t('jobs.recall')} compact onPress={() => recallPosted(posted.id)} />
      ) : posting ? (
        <PostHeroList camp={settled} />
      ) : (
        <EmberButton title={t('supply.camp.post')} compact onPress={() => setPosting(true)} />
      )}
    </ParchmentCard>
  );
}

const styles = StyleSheet.create({
  body: { gap: 10 },
  card: { gap: 8 },
  line: { color: ui.ink },
  richnessRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stockText: { color: ui.ink },
});
