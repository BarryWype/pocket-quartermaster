import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { FillBar } from '@/components/motion';

import { IconLabel } from '@/components/IconLabel';
import { Overlay } from '@/components/Overlay';
import { Panel } from '@/components/Panel';
import { Sheet } from '@/components/Sheet';
import { Text } from '@/components/Text';
import { Button } from '@/components/Button';
import { WoodButton } from '@/components/ui';
import { clockConfig } from '@/content/clockConfig';
import { materialById } from '@/content/lookup';
import { campResource, supplyRules, tradeInfo } from '@/content/supplyLines';
import { distanceMeters } from '@/game/generation/geo';
import { tileCenter } from '@/game/generation/tiles';
import type { LatLng } from '@/game/generation/types';
import { collectProblem } from '@/game/supply/postings';
import { campCap, campRateParts, campStockTotal, settleCamp } from '@/game/supply/production';
import { tradeLevel } from '@/game/supply/trades';
import type { Camp } from '@/game/supply/types';
import { formatDistance, formatDuration, t, tr } from '@/i18n';
import { useNow } from '@/hooks/useNow';
import { debugEnabled, useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { colors, ui } from '@/theme';

import { PostHeroList } from './PostHeroList';
import { RaidBanner } from './RaidBanner';
import { RichnessPips, terrainEmojis, terrainNames } from './SupplyCellPanel';

type Props = { id: string; player: LatLng; onClose: () => void };

/** Asks before a camp is packed up: the stock is lost, the slot frees again after the cooldown. */
function PackUpDialog({ camp, onConfirm, onClose }: { camp: Camp; onConfirm: () => void; onClose: () => void }) {
  return (
    <Overlay onClose={onClose}>
      <Panel style={styles.dialog}>
        <Text style={styles.dialogTitle}>{t('supply.camp.packUpTitle')}</Text>
        <Text>{t('supply.camp.packUpBody', { hours: supplyRules.camps.packUpCooldownHours })}</Text>
        <View style={styles.dialogActions}>
          <Button title={t('common.cancel')} color={colors.muted} onPress={onClose} />
          <Button title={t('supply.camp.packUp')} onPress={onConfirm} />
        </View>
      </Panel>
    </Overlay>
  );
}

/** A camp's sheet: what it stands on, what it works, who works it, and packing it up. */
export function SupplyCampPanel({ id, player, onClose }: Props) {
  const camp = useGameStore((s) => s.save.supply.camps.find((entry) => entry.id === id)) ?? null;
  const save = useGameStore((s) => s.save);
  const recallPosted = useGameStore((s) => s.recallPosted);
  const collectCamp = useGameStore((s) => s.collectCamp);
  const packUpCamp = useGameStore((s) => s.packUpCamp);
  const offset = useDebugStore((s) => s.supplyPeriodOffset);
  const debugOn = useDebugStore(debugEnabled);
  const debugRaid = useGameStore((s) => s.debugRaid);
  const now = useNow(clockConfig.minutesMs);
  const [confirming, setConfirming] = useState(false);
  const noteTips = useGameStore((s) => s.noteTips);
  // The first time a camp's sheet opens, its tip waits for the map.
  useEffect(() => {
    noteTips(['supplyCampSheet']);
  }, [noteTips]);
  if (!camp) return null;

  const settled = settleCamp(save, camp, now, offset);
  const parts = campRateParts(save, camp, now, offset);
  const resource = campResource[camp.kind];
  const posted = settled.heroId ? save.heroes.find((h) => h.id === settled.heroId) ?? null : null;
  const stock = campStockTotal(settled);
  const cap = campCap(camp, now, offset);
  const problem = collectProblem(save, camp.id, player, now, offset);
  const rate = String(Math.round(parts.rate * 100) / 100);

  return (
    <>
      <Overlay onClose={onClose} position="bottom">
        <Sheet
          variant="wood"
          emoji={camp.kind === 'timber' ? '🪵' : '🪤'}
          title={t(camp.kind === 'timber' ? 'supply.camp.timberName' : 'supply.camp.trapperName')}
          footer={<WoodButton title={t('common.close')} onPress={onClose} />}
        >
          <View style={styles.body}>
            <RaidBanner campId={camp.id} />
            <IconLabel emoji={terrainEmojis[camp.terrain]} label={t(terrainNames[camp.terrain])} size={16} />
            <View style={styles.richnessRow}>
              <IconLabel emoji={camp.kind === 'timber' ? '🪵' : '🦌'} label={t(resource === 'timber' ? 'supply.resource.timber' : 'supply.resource.game')} size={16} />
              <RichnessPips level={parts.richness} />
            </View>
            {now < camp.closedUntil ? (
              <Text style={styles.line}>{t('supply.camp.closed', { time: formatDuration(camp.closedUntil - now, false) })}</Text>
            ) : parts.richness === 0 ? (
              <Text style={styles.line}>{t('supply.camp.nothingGrows')}</Text>
            ) : (
              <View style={styles.section}>
                <Text style={styles.line}>{t(camp.kind === 'timber' ? 'supply.camp.rateTimber' : 'supply.camp.rateTrapper', { rate })}</Text>
                <Text style={styles.line}>
                  {posted
                    ? t('supply.camp.postedHero', { name: posted.name })
                    : t('supply.camp.locals', { share: Math.round(supplyRules.production.localsShare * 100) })}
                </Text>
                {posted && parts.tradeBonus > 0 && (
                  <Text style={styles.line}>
                    {t('supply.camp.tradeBonus', {
                      trade: tr(tradeInfo[posted.trade.id].name),
                      level: tradeLevel(posted.trade.hours),
                      percent: Math.round(parts.tradeBonus * 100),
                    })}
                  </Text>
                )}
                {parts.inspected && (
                  <Text style={styles.line}>
                    {t('supply.camp.inspected', {
                      percent: Math.round(supplyRules.production.inspectBonus * 100),
                      time: formatDuration(camp.inspectedUntil - now, false),
                    })}
                  </Text>
                )}
              </View>
            )}
            <View style={styles.stockRow}>
              <FillBar value={cap > 0 ? stock / cap : 0} />
              <Text style={styles.stockText}>{`${stock} / ${cap}`}</Text>
            </View>
            {Object.entries(settled.stock).filter(([, amount]) => amount > 0).length > 0 && (
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
            )}
            {posted ? (
              <View style={styles.section}>
                <Text style={styles.line}>{t('supply.camp.postedHero', { name: posted.name })}</Text>
                <WoodButton title={t('jobs.recall')} onPress={() => recallPosted(posted.id)} />
              </View>
            ) : (
              <View style={styles.section}>
                <Text style={styles.line}>{t('supply.camp.post')}</Text>
                <PostHeroList camp={settled} />
              </View>
            )}
            {problem === null ? (
              <WoodButton title={t('jobs.collect')} onPress={() => collectCamp(camp.id, player)} />
            ) : (
              <Text style={styles.line}>
                {problem === 'tooFar'
                  ? t('supply.camp.collectTooFar', { distance: formatDistance(distanceMeters(player, tileCenter(camp.cell))) })
                  : t('supply.camp.collectEmpty')}
              </Text>
            )}
            <WoodButton title={t('supply.camp.packUp')} onPress={() => setConfirming(true)} />
            {debugOn && <WoodButton compact title={t('supply.raid.debug')} onPress={() => debugRaid(camp.id)} />}
          </View>
        </Sheet>
      </Overlay>
      {confirming && (
        <PackUpDialog
          camp={camp}
          onConfirm={() => {
            packUpCamp(camp.id);
            onClose();
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12 },
  line: { color: ui.ink },
  section: { gap: 6 },
  richnessRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stockText: { color: ui.ink },
  materials: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  dialog: { gap: 10, padding: 14 },
  dialogTitle: { fontSize: 24 },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
});
