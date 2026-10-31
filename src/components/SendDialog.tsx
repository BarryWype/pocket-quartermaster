import { useEffect, useMemo, useState } from 'react';
import { rosterRules } from '@/content/roster';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { heroClasses } from '@/content/heroes';
import { itemById, opportunityById } from '@/content/lookup';
import { briefingOf, dungeonLootSource, launchPlan, type Loadout } from '@/game/expeditions/expeditions';
import { oddsBand, type OddsBand } from '@/game/expeditions/odds';
import { cachedEstimateOdds, cachedOdds, oddsKey } from '@/game/expeditions/oddsCache';
import { mealItems } from '@/game/expeditions/provisions';

import { charmApplies } from '@/game/loot/charms';
import type { SaveData } from '@/game/save';
import { briefingCoverage } from '@/game/threats/coverage';
import { buySupplyProblem, supplyPrice } from '@/game/taverns/taverns';
import { currentHp, drinkProblem, isExhausted, maxHp, timeToFull } from '@/game/team/health';
import { carriesKit, hasPotionSlot, isOnExpedition } from '@/game/team/team';
import { hasKey } from '@/game/secrets/keys';
import type { Briefing, ConsumableDef, DungeonDef, ProvisionDef } from '@/game/types';
import { formatDuration, formatPercent, t, tr } from '@/i18n';
import { currentRotation } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';
import { colors, pixel } from '@/theme';

import { Button } from './Button';
import { EquipPicker } from './EquipPicker';
import { HpBar } from './HpBar';
import { Overlay } from './Overlay';
import { Panel } from './Panel';
import { Text } from './Text';
import { ThreatCoverageChips } from './ThreatDetail';

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
  /** A secret dungeon's own briefing, instead of the day's. */
  briefing?: Briefing;
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
    party.length < rosterRules.partySize && idle.length > 0
      ? t('expeditions.confirm.roomLeft', { count: idle.length, names: idle.map((h) => h.name).join(', ') })
      : null,
    without('weapon') ? t('expeditions.confirm.noWeapon', { names: without('weapon') }) : null,
    without('armor') ? t('expeditions.confirm.noArmor', { names: without('armor') }) : null,
  ].filter((warning): warning is string => warning !== null);
}

/** "None", then each item of the kind the player holds. */
function Picker({ label, items, stock, value, onChange, disabled }: {
  label: string;
  items: ProvisionDef[];
  stock: Record<string, number>;
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  const held = items.filter((item) => (stock[item.id] ?? 0) > 0);
  const options = [null, ...held.map((item) => item.id)];
  return (
    <View style={styles.picker}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.options}>
        {options.map((id) => (
          <Pressable
            key={id ?? 'none'}
            disabled={disabled}
            onPress={() => onChange(id)}
            style={[styles.option, value === id && styles.optionActive, disabled && styles.optionDisabled]}
          >
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

/** Confirms sending the party: HP, supply, meal, odds now and at full HP, and quick fixes. */
export function SendDialog({ save, dungeon, party, now, durationScale, onConfirm, onClose, onSwap, briefing: fixedBriefing }: Props) {
  const drinkPotion = useGameStore((state) => state.drinkPotion);
  const buySupply = useGameStore((state) => state.buySupply);
  const equip = useGameStore((state) => state.equip);
  const { player, nearbyTavern } = useWorldStore();
  const [mealId, setMealId] = useState<string | null>(null);
  /** Whether the party takes the briefing's opportunity and pays its supply. */
  const [optIn, setOptIn] = useState(false);
  const [swapping, setSwapping] = useState<string | null>(null);
  /** Whose consumable (or Alchemist's potion) slot is open in the picker. */
  const [picking, setPicking] = useState<{ heroId: string; slot: 'consumable' | 'potion' } | null>(null);
  const setKitFor = useGameStore((state) => state.setKitFor);
  const loadout = useMemo(() => ({ mealId, optIn }), [mealId, optIn]);
  const heroes = save.heroes.filter((h) => party.includes(h.id));
  const idle = save.heroes.filter((h) => !party.includes(h.id) && !isOnExpedition(save, h.id));

  // The day's briefing, as the launch will keep it: it stretches the time and shapes the odds.
  // Once a minute is enough, like the odds below.
  const minute = Math.floor(now / 60_000);
  const briefing = useMemo(
    () => fixedBriefing ?? briefingOf(save, dungeon, currentRotation(minute * 60_000), minute * 60_000),
    [fixedBriefing, minute, dungeon, save],
  );
  const coverage = useMemo(
    () => briefingCoverage(save, party, briefing, minute * 60_000, optIn),
    [save, party, briefing, minute, optIn],
  );
  const plan = useMemo(
    () => launchPlan(save, dungeon, party, loadout, briefing),
    [save, dungeon, party, loadout, briefing],
  );
  const opportunity = coverage.opportunity?.cost
    ? (briefing.opportunity ? opportunityById[briefing.opportunity] : null)
    : null;
  const keyCost = !!opportunity?.cost?.key;
  // A Cook in the party lifts Spoiled stores.
  const spoiled = coverage.restriction?.id === 'spoiledStores' && !coverage.restriction.cancelledBy;
  const durationMs = plan.minutes * 60_000 * durationScale;
  // The run's reward modifiers: each charm carried, once however many heroes carry it.
  const charms = heroes
    .map((h) => (h.equipment.consumable ? (itemById[h.equipment.consumable] as ConsumableDef) : null))
    .filter((item): item is ConsumableDef => !!item?.charm);
  const barren = coverage.restriction?.id === 'barren' && !coverage.restriction.cancelledBy;
  const charmLines = [...new Set(charms.map((c) => c.id))].map((id) => {
    const item = itemById[id] as ConsumableDef;
    const applies = charmApplies(item.charm!, dungeonLootSource(dungeon)) && !(barren && item.charm!.kind === 'gold');
    const twice = charms.filter((c) => c.id === id).length > 1;
    return { id, text: `${item.emoji} ${tr(item.name)}: ${tr(item.description!)}`, applies, twice };
  });
  // The odds previews: keys already computed elsewhere show at once, the rest compute
  // in a later tick, and the last known odds stay on screen while they do.
  const keyNow = useMemo(
    () => oddsKey({ save, heroIds: party, dungeon, options: { now: minute * 60_000, loadout, briefing } }),
    [save, party, dungeon, minute, loadout, briefing],
  );
  const keyFull = useMemo(
    () => oddsKey({ save, heroIds: party, dungeon, options: { now: minute * 60_000, loadout, briefing, fullHp: true } }),
    [save, party, dungeon, minute, loadout, briefing],
  );
  const [computed, setComputed] = useState<{ key: string; now: number; full: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setTimeout(() => {
      if (cancelled) return;
      const start = Date.now();
      const value = {
        now: cachedEstimateOdds(save, party, dungeon, undefined, { now: minute * 60_000, loadout, briefing }).success,
        full: cachedEstimateOdds(save, party, dungeon, undefined, { now: minute * 60_000, loadout, briefing, fullHp: true }).success,
      };
      if (__DEV__) console.log(`[odds] ${dungeon.id} dialog ${Date.now() - start}ms`);
      setComputed({ key: keyNow, ...value });
    });
    return () => {
      cancelled = true;
    };
    // The keys change with everything the estimates read; that is the recompute trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyNow, keyFull]);
  // The fresh estimate when its key is the current one, the cache's at once, else the last known.
  const heldNow = cachedOdds(keyNow);
  const heldFull = cachedOdds(keyFull);
  const odds =
    computed && computed.key === keyNow
      ? computed
      : heldNow && heldFull
        ? { now: heldNow.success, full: heldFull.success }
        : computed;
  const band = odds ? oddsBand(odds.now) : null;
  const warnings = warningsFor(save, dungeon, party, odds?.now ?? 1, durationMs, now);
  const canBuy = nearbyTavern && player && buySupplyProblem(save, 1, nearbyTavern.position, player) === null;

  return (
    <Overlay onClose={onClose}>
        <Panel style={styles.dialog}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>{t('expeditions.confirm.title', { dungeon: `${dungeon.emoji} ${tr(dungeon.name)}` })}</Text>
            <ThreatCoverageChips coverage={coverage} labelled={save.tutorial.step !== 'done'} />
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
                <View style={styles.options}>
                  {(['consumable', ...(hasPotionSlot(hero) ? ['potion' as const] : [])] as const).map((slot) => {
                    const id = hero.equipment[slot];
                    return (
                      <Pressable key={slot} accessibilityLabel={t(`hero.slots.${slot}`)} onPress={() => setPicking({ heroId: hero.id, slot })} style={styles.slot}>
                        <Text style={styles.slotText}>
                          {id ? `${itemById[id].emoji} ${tr(itemById[id].name)}` : `${slot === 'potion' ? '⚗️' : '🎒'} ${t('expeditions.confirm.none')}`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {carriesKit(hero) && heroes.length > 1 && (
                  <View style={styles.options}>
                    <Text style={styles.muted}>{t('classes.carriesFor')}</Text>
                    {[null, ...heroes.filter((other) => other.id !== hero.id).map((other) => other.id)].map((id) => {
                      const active = (hero.kitFor && party.includes(hero.kitFor) ? hero.kitFor : null) === id;
                      return (
                        <Pressable key={id ?? 'self'} onPress={() => setKitFor(hero.id, id)} style={[styles.option, active && styles.optionActive]}>
                          <Text style={styles.optionText}>{id ? save.heroes.find((h) => h.id === id)!.name : t('classes.carriesSelf')}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
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
            {opportunity && (
              <View style={styles.picker}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: optIn, disabled: keyCost && !hasKey(save) }}
                  disabled={keyCost && !hasKey(save)}
                  onPress={() => setOptIn(!optIn)}
                  style={[styles.option, optIn && styles.optionActive, keyCost && !hasKey(save) && styles.optionDisabled]}
                >
                  <Text style={styles.optionText}>
                    {opportunity.emoji}{' '}
                    {keyCost
                      ? hasKey(save)
                        ? t('secrets.vaultOptIn')
                        : `${tr(opportunity.name)} · ${t('secrets.vaultLocked')}`
                      : `${tr(opportunity.name)} · ${t('expeditions.confirm.optIn', { count: opportunity.cost?.supply ?? 0 })}`}
                  </Text>
                </Pressable>
                {keyCost && hasKey(save) && <Text style={styles.keyWarning}>{t('secrets.vaultWarning')}</Text>}
              <Text style={styles.muted}>{tr(opportunity.description)}</Text>
              {coverage.opportunity?.answers && (
                <Text style={styles.muted}>
                  {t('expeditions.confirm.optInAnswers', { names: coverage.opportunity.answers.map((a) => a.heroName).join(', ') })}
                </Text>
              )}
              </View>
            )}
            <Picker label={t('expeditions.confirm.meal')} items={mealItems} stock={save.consumables} value={mealId} onChange={setMealId} disabled={spoiled} />
            {spoiled && <Text style={styles.muted}>{t('expeditions.confirm.spoiledStores')}</Text>}
            {charmLines.length > 0 && <Text style={styles.label}>{t('expeditions.confirm.rewards')}</Text>}
            {charmLines.map((line) => (
              <Text key={line.id} style={line.applies ? styles.summary : styles.muted}>
                {line.text}
                {line.applies ? '' : t('expeditions.confirm.charmNoEffect')}
                {line.twice ? t('expeditions.confirm.charmOnce') : ''}
              </Text>
            ))}

            <Text style={styles.summary}>
              ⏳ {formatDuration(durationMs)} ·{' '}
              {odds && band ? (
                <Text style={{ color: ODDS_COLORS[band] }}>
                  {formatPercent(odds.now)} {t(`odds.${band}`)}
                </Text>
              ) : (
                '…'
              )}
            </Text>
            {odds && odds.full !== odds.now && (
              <Text style={styles.muted}>{t('expeditions.confirm.oddsFull', { percent: formatPercent(odds.full) })}</Text>
            )}
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
      {picking && (
        <EquipPicker
          save={save}
          heroId={picking.heroId}
          slot={picking.slot}
          briefing={briefing}
          bossId={dungeon.boss.id}
          onPick={(id) => {
            equip(picking.heroId, picking.slot, id);
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </Overlay>
  );
}

const styles = StyleSheet.create({
  dialog: { gap: 10, padding: 14, maxHeight: '90%' },
  content: { gap: 10 },
  title: { fontSize: 24 },
  hero: { gap: 4 },
  heroLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroName: { flex: 1, fontSize: 20 },
  slot: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: colors.woodDark,
    backgroundColor: colors.parchmentDark,
  },
  slotText: { fontSize: 17 },
  summary: { fontSize: 20 },
  muted: { color: colors.muted },
  label: { fontSize: 16, color: colors.muted, textTransform: 'uppercase' },
  picker: { gap: 4 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  option: { paddingHorizontal: 6, paddingVertical: 2, borderWidth: 2, borderColor: colors.woodDark, backgroundColor: colors.parchmentDark },
  optionActive: { borderColor: colors.ink, borderWidth: pixel.outline, backgroundColor: colors.highlight },
  optionDisabled: { opacity: 0.4 },
  optionText: { fontSize: 17 },
  warning: { gap: 6, padding: 8, borderWidth: 2, borderColor: colors.danger, backgroundColor: colors.parchmentDark },
  warningText: { color: colors.ink },
  keyWarning: { color: colors.danger },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
});
