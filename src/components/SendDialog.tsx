import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { heroClasses } from '@/content/heroes';
import { itemById } from '@/content/lookup';
import { bossBonusAvailable, launchPlan, type Loadout } from '@/game/expeditions/expeditions';
import { estimateOdds, oddsBand, type OddsBand } from '@/game/expeditions/odds';
import { kitItems, mealItems } from '@/game/expeditions/provisions';
import { partySize } from '@/game/guild/guild';
import type { SaveData } from '@/game/save';
import { buySupplyProblem, supplyPrice } from '@/game/taverns/taverns';
import { currentHp, drinkProblem, isExhausted, maxHp, timeToFull } from '@/game/team/health';
import { isOnExpedition } from '@/game/team/team';
import type { DungeonDef, ProvisionDef } from '@/game/types';
import { formatDuration, formatPercent, t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';
import { colors, pixel } from '@/theme';

import { Button } from './Button';
import { HpBar } from './HpBar';
import { Panel } from './Panel';
import { Text } from './Text';

type Props = {
  save: SaveData;
  dungeon: DungeonDef;
  party: string[];
  now: number;
  durationScale: number;
  onConfirm: (loadout: Loadout) => void;
  onClose: () => void;
  /** Replaces a hero of the party with one at home. */
  onSwap: (out: string, into: string) => void;
};

export const ODDS_COLORS: Record<OddsBand, string> = { Risky: colors.danger, Fair: colors.gold, Safe: colors.success };

/** Things worth a second look before the party leaves. */
function warningsFor(save: SaveData, dungeon: DungeonDef, party: string[], chance: number, durationMs: number, now: number) {
  const heroes = save.heroes.filter((h) => party.includes(h.id));
  const without = (slot: 'weapon' | 'armor') =>
    heroes
      .filter((h) => !h.equipment[slot])
      .map((h) => h.name)
      .join(', ');
  const idle = save.heroes.filter((h) => !party.includes(h.id) && !isOnExpedition(save, h.id));
  const hurt = heroes.flatMap((hero) => {
    if (isExhausted(hero, now)) return [t('expeditions.confirm.exhausted', { name: hero.name, time: formatDuration((hero.exhaustedUntil ?? now) - now) })];
    const share = currentHp(save, hero, now) / maxHp(save, hero);
    if (share >= 1) return [];
    return [t('expeditions.confirm.hurt', { name: hero.name, percent: formatPercent(share), time: formatDuration(timeToFull(save, hero, now)) })];
  });
  return [
    oddsBand(chance) === 'Risky' ? t('expeditions.confirm.risky', { percent: formatPercent(chance) }) : null,
    ...hurt,
    party.length < partySize(save) && idle.length > 0
      ? t('expeditions.confirm.roomLeft', { count: idle.length, names: idle.map((h) => h.name).join(', ') })
      : null,
    without('weapon') ? t('expeditions.confirm.noWeapon', { names: without('weapon') }) : null,
    without('armor') ? t('expeditions.confirm.noArmor', { names: without('armor') }) : null,
    dungeon.isBoss && !bossBonusAvailable(save, dungeon.id, now + durationMs) ? t('expeditions.confirm.bonusClaimed') : null,
  ].filter((warning): warning is string => warning !== null);
}

/** "None", then each item of the kind the player holds. */
function Picker({ label, items, stock, value, onChange }: {
  label: string;
  items: ProvisionDef[];
  stock: Record<string, number>;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const held = items.filter((item) => (stock[item.id] ?? 0) > 0);
  const options = [null, ...held.map((item) => item.id)];
  return (
    <View style={styles.picker}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.options}>
        {options.map((id) => (
          <Pressable key={id ?? 'none'} onPress={() => onChange(id)} style={[styles.option, value === id && styles.optionActive]}>
            <Text style={styles.optionText}>
              {id ? `${itemById[id].emoji} ${tr(itemById[id].name)} ×${stock[id]}` : t('expeditions.confirm.none')}
            </Text>
          </Pressable>
        ))}
      </View>
      {value && itemById[value].description ? <Text style={styles.muted}>{tr(itemById[value].description!)}</Text> : null}
    </View>
  );
}

/** Confirms sending the party: HP, supply, meal and kit, odds now and at full HP, and quick fixes. */
export function SendDialog({ save, dungeon, party, now, durationScale, onConfirm, onClose, onSwap }: Props) {
  const drinkPotion = useGameStore((state) => state.drinkPotion);
  const buySupply = useGameStore((state) => state.buySupply);
  const { player, nearbyTavern } = useWorldStore();
  const [mealId, setMealId] = useState<string | null>(null);
  const [kitId, setKitId] = useState<string | null>(null);
  const [swapping, setSwapping] = useState<string | null>(null);
  const loadout = useMemo(() => ({ mealId, kitId }), [mealId, kitId]);
  const heroes = save.heroes.filter((h) => party.includes(h.id));
  const idle = save.heroes.filter((h) => !party.includes(h.id) && !isOnExpedition(save, h.id));

  const plan = launchPlan(save, dungeon, party, loadout);
  const durationMs = plan.minutes * 60_000 * durationScale;
  // Healing moves the odds slowly: once a minute is enough.
  const minute = Math.floor(now / 60_000);
  const odds = useMemo(
    () => ({
      now: estimateOdds(save, party, dungeon, undefined, { now: minute * 60_000, loadout }).success,
      full: estimateOdds(save, party, dungeon, undefined, { now: minute * 60_000, loadout, fullHp: true }).success,
    }),
    [save, party, dungeon, minute, loadout],
  );
  const band = oddsBand(odds.now);
  const warnings = warningsFor(save, dungeon, party, odds.now, durationMs, now);
  const canBuy = nearbyTavern && player && buySupplyProblem(save, 1, nearbyTavern.position, player) === null;

  return (
    <Modal transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Panel style={styles.dialog}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>{t('expeditions.confirm.title', { dungeon: `${dungeon.emoji} ${tr(dungeon.name)}` })}</Text>
            {heroes.map((hero) => (
              <View key={hero.id} style={styles.hero}>
                <View style={styles.heroLine}>
                  <Text style={styles.heroName}>
                    {heroClasses[hero.classId].emoji} {hero.name}
                  </Text>
                  {drinkProblem(save, hero.id, now) === null && (
                    <Button title={t('expeditions.confirm.drink')} onPress={() => drinkPotion(hero.id)} />
                  )}
                  {idle.length > 0 && <Button title={t('expeditions.confirm.swap')} color={colors.muted} onPress={() => setSwapping(swapping === hero.id ? null : hero.id)} />}
                </View>
                <HpBar save={save} hero={hero} now={now} />
                {swapping === hero.id && (
                  <View style={styles.options}>
                    <Text style={styles.muted}>{t('expeditions.confirm.swapTitle', { name: hero.name })}</Text>
                    {idle.map((other) => (
                      <Pressable
                        key={other.id}
                        style={styles.option}
                        onPress={() => {
                          setSwapping(null);
                          onSwap(hero.id, other.id);
                        }}
                      >
                        <Text style={styles.optionText}>
                          {heroClasses[other.classId].emoji} {other.name} · {formatPercent(currentHp(save, other, now) / maxHp(save, other))}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            ))}

            <Text style={styles.summary}>{t('expeditions.confirm.supply', { need: plan.need, held: plan.held })}</Text>
            {plan.hunger !== 'fed' && (
              <View style={styles.warning}>
                <Text style={styles.warningText}>⚠️ {t(`expeditions.confirm.hunger.${plan.hunger}`)}</Text>
                {canBuy && (
                  <Button
                    title={t('expeditions.confirm.buySupply', { price: supplyPrice(save) })}
                    onPress={() => buySupply(1, nearbyTavern.position, player)}
                  />
                )}
              </View>
            )}
            <Picker label={t('expeditions.confirm.meal')} items={mealItems} stock={save.consumables} value={mealId} onChange={setMealId} />
            <Picker label={t('expeditions.confirm.kit')} items={kitItems} stock={save.consumables} value={kitId} onChange={setKitId} />

            <Text style={styles.summary}>
              ⏳ {formatDuration(durationMs)} ·{' '}
              <Text style={{ color: ODDS_COLORS[band] }}>
                {formatPercent(odds.now)} {t(`odds.${band}`)}
              </Text>
            </Text>
            {odds.full !== odds.now && <Text style={styles.muted}>{t('expeditions.confirm.oddsFull', { percent: formatPercent(odds.full) })}</Text>}
            {warnings.map((warning) => (
              <View key={warning} style={styles.warning}>
                <Text style={styles.warningText}>⚠️ {warning}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.actions}>
            <Button title={t('common.cancel')} color={colors.muted} onPress={onClose} />
            <Button title={t('expeditions.send')} disabled={party.length === 0} onPress={() => onConfirm(loadout)} />
          </View>
        </Panel>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
  dialog: { gap: 10, padding: 14, maxHeight: '90%' },
  content: { gap: 10 },
  title: { fontSize: 24 },
  hero: { gap: 4 },
  heroLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroName: { flex: 1, fontSize: 20 },
  summary: { fontSize: 20 },
  muted: { color: colors.muted },
  label: { fontSize: 16, color: colors.muted, textTransform: 'uppercase' },
  picker: { gap: 4 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  option: { paddingHorizontal: 6, paddingVertical: 2, borderWidth: 2, borderColor: colors.woodDark, backgroundColor: colors.parchmentDark },
  optionActive: { borderColor: colors.ink, borderWidth: pixel.outline, backgroundColor: colors.highlight },
  optionText: { fontSize: 17 },
  warning: { gap: 6, padding: 8, borderWidth: 2, borderColor: colors.danger, backgroundColor: colors.parchmentDark },
  warningText: { color: colors.ink },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
});
