import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressScale } from '@/components/motion';

import { dungeonById, itemById, opportunityById, restrictionById } from '@/content/lookup';
import { placeInfo } from '@/content/places';
import { rosterRules } from '@/content/roster';
import { narrowPartySize } from '@/content/threats';
import { weaknessByBoss } from '@/content/weaknesses';
import { briefingOf, dungeonLootSource, expeditionMinutes, firstWinAvailable, launchPlan, type Loadout } from '@/game/expeditions/expeditions';
import { cachedEstimateOdds, oddsKey } from '@/game/expeditions/oddsCache';
import { canJoin, heroStatus } from '@/game/expeditions/party';
import { mealItems } from '@/game/expeditions/provisions';
import { lootModifierApplies } from '@/game/loot/modifiers';
import type { SaveData } from '@/game/save';
import { hasKey } from '@/game/secrets/keys';
import { buySupplyProblem, supplyPrice } from '@/game/taverns/taverns';
import { currentHp, drinkProblem, isExhausted, maxHp, timeToFull } from '@/game/team/health';
import { briefingCoverage } from '@/game/threats/coverage';
import type { Briefing, DungeonDef, GearDef, ProvisionDef } from '@/game/types';
import { formatDuration, formatPercent, t, tr } from '@/i18n';
import { currentRotation } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';
import { colors, fonts, ui } from '@/theme';

import { EnemyTags } from './EnemyTags';
import { FamilyTag } from './FamilyTag';
import { IconLabel, RewardLabel } from './IconLabel';
import { PartyDialog } from './PartyDialog';
import { Price } from './Price';
import { Text } from './Text';
import { OpportunityChip, RestrictionChip } from './ThreatChip';
import { TrophyLine } from './TrophyLine';
import { ParchmentCard, WoodButton } from './ui';

type Props = {
  dungeon: DungeonDef;
  now: number;
  durationScale: number;
  /** A secret dungeon's own briefing, instead of the day's. */
  briefing?: Briefing;
  onSend: (party: string[], loadout: Loadout) => void;
  onClose: () => void;
};

/** "None", then each meal the player holds. */
function MealPicker({ stock, value, onChange, disabled }: { stock: Record<string, number>; value: string | null; onChange: (id: string | null) => void; disabled: boolean }) {
  const held: ProvisionDef[] = mealItems.filter((item) => (stock[item.id] ?? 0) > 0);
  return (
    <View style={styles.section}>
      <Text style={styles.label}>{t('expeditions.confirm.meal')}</Text>
      <View style={styles.options}>
        {[null, ...held.map((item) => item.id)].map((id) => (
          <PressScale
            key={id ?? 'none'}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === id, disabled }}
            disabled={disabled}
            onPress={() => onChange(id)}
            style={[styles.option, value === id && styles.optionActive, disabled && styles.optionDisabled]}
          >
            {id ? (
              <IconLabel emoji={itemById[id].emoji} icon={itemById[id].icon} label={`${tr(itemById[id].name)} ×${stock[id]}`} labelStyle={styles.optionText} />
            ) : (
              <Text style={styles.optionText}>{t('expeditions.confirm.none')}</Text>
            )}
          </PressScale>
        ))}
      </View>
      {value && itemById[value].description ? <Text style={styles.muted}>{tr(itemById[value].description!)}</Text> : null}
    </View>
  );
}

/** What else the run takes and pays, under the plates: the boss, supply, meal, opportunity, loot trinkets, time and warnings. */
function ExpeditionDetails({
  save,
  party,
  dungeon,
  briefing,
  loadout,
  setLoadout,
  now,
  durationScale,
}: {
  save: SaveData;
  party: string[];
  dungeon: DungeonDef;
  briefing: Briefing;
  loadout: Required<Loadout>;
  setLoadout: (loadout: Required<Loadout>) => void;
  now: number;
  durationScale: number;
}) {
  const drinkPotion = useGameStore((state) => state.drinkPotion);
  const buySupply = useGameStore((state) => state.buySupply);
  const { player, nearbyTavern } = useWorldStore();
  const coverage = useMemo(() => briefingCoverage(save, party, briefing, now, loadout.optIn), [save, party, briefing, now, loadout.optIn]);
  const plan = useMemo(() => launchPlan(save, dungeon, party, loadout, briefing), [save, dungeon, party, loadout, briefing]);
  const heroes = save.heroes.filter((h) => party.includes(h.id));
  const opportunity = briefing.opportunity ? opportunityById[briefing.opportunity] : null;
  const keyCost = !!opportunity?.cost?.key;
  const spoiled = coverage.restriction?.id === 'spoiledStores' && !coverage.restriction.cancelledBy;
  const barren = coverage.restriction?.id === 'barren' && !coverage.restriction.cancelledBy;
  const lootTrinkets = heroes.flatMap((h) => {
    const piece = h.equipment.trinket ? save.gear.find((g) => g.uid === h.equipment.trinket) : undefined;
    const item = piece ? (itemById[piece.itemId] as GearDef) : undefined;
    return item?.loot ? [item] : [];
  });
  const lootLines = [...new Set(lootTrinkets.map((trinket) => trinket.id))].map((id) => {
    const item = itemById[id] as GearDef;
    const applies = lootModifierApplies(item.loot!, dungeonLootSource(dungeon)) && !(barren && item.loot!.kind === 'gold');
    return { id, emoji: item.emoji, text: `${tr(item.name)}: ${tr(item.description!)}`, applies, twice: lootTrinkets.filter((t) => t.id === id).length > 1 };
  });
  const weakness = dungeon.isBoss ? weaknessByBoss[dungeon.boss.id] : undefined;
  const weaknessHeld = !!weakness && ((save.consumables[weakness.itemId] ?? 0) > 0 || save.heroes.some((h) => h.equipment.consumable === weakness.itemId));
  const newTier = !save.clearedDungeons.some((id) => dungeonById[id]?.tier === dungeon.tier);
  const canBuy = nearbyTavern && player && buySupplyProblem(save, 1, nearbyTavern.position, player) === null;
  const without = (slot: 'weapon' | 'armor') =>
    heroes
      .filter((h) => !h.equipment[slot])
      .map((h) => h.name)
      .join(', ');

  return (
    <ParchmentCard contentStyle={styles.details}>
      {(briefing.restriction || (opportunity && !opportunity.cost)) && (
        <View style={styles.options}>
          {briefing.restriction && <RestrictionChip restriction={restrictionById[briefing.restriction]} />}
          {opportunity && !opportunity.cost && <OpportunityChip opportunity={opportunity} />}
        </View>
      )}
      <View style={styles.row}>
        <Text style={styles.muted}>{t('expeditions.boss')}</Text>
        <EnemyTags mob={dungeon.boss} />
      </View>
      <TrophyLine source={dungeonLootSource(dungeon)} />
      {newTier && <RewardLabel text={t('expeditions.newTierBonus')} size={16} labelStyle={styles.text} />}
      {firstWinAvailable(save, dungeon, now) && <RewardLabel text={t('expeditions.firstWinToday')} size={16} labelStyle={styles.text} />}
      {weakness && (
        <IconLabel
          emoji={itemById[weakness.itemId].emoji}
          label={`${t('expeditions.weakness', { item: tr(itemById[weakness.itemId].name), place: tr(placeInfo[weakness.place].name).toLowerCase() })}${weaknessHeld ? t('expeditions.weaknessHeld') : ''}`}
          labelStyle={[styles.text, weaknessHeld && styles.good]}
        />
      )}
      {party.length > 0 && <RewardLabel text={t('expeditions.confirm.supply', { need: plan.need, held: plan.held })} size={16} labelStyle={styles.text} />}
      {party.length > 0 && plan.hunger !== 'fed' && (
        <View style={styles.warning}>
          <IconLabel emoji="⚠️" label={t(`expeditions.confirm.hunger.${plan.hunger}`)} labelStyle={styles.text} />
          {canBuy && (
            <View style={styles.row}>
              <Price amount={supplyPrice(save)} short={save.gold < supplyPrice(save)} />
              <WoodButton compact title={t('expeditions.confirm.buySupply')} onPress={() => buySupply(1, nearbyTavern.position, player)} />
            </View>
          )}
        </View>
      )}
      {opportunity?.cost && (
        <View style={styles.section}>
          <PressScale
            accessibilityRole="checkbox"
            accessibilityState={{ checked: loadout.optIn, disabled: keyCost && !hasKey(save) }}
            disabled={keyCost && !hasKey(save)}
            onPress={() => setLoadout({ ...loadout, optIn: !loadout.optIn })}
            style={[styles.option, loadout.optIn && styles.optionActive, keyCost && !hasKey(save) && styles.optionDisabled]}
          >
            <IconLabel
              emoji={opportunity.emoji}
              label={
                keyCost
                  ? hasKey(save)
                    ? t('secrets.vaultOptIn')
                    : `${tr(opportunity.name)} · ${t('secrets.vaultLocked')}`
                  : `${tr(opportunity.name)} · ${t('expeditions.confirm.optIn', { count: opportunity.cost.supply ?? 0 })}`
              }
              labelStyle={styles.optionText}
            />
          </PressScale>
          {keyCost && hasKey(save) && <Text style={styles.bad}>{t('secrets.vaultWarning')}</Text>}
          <Text style={styles.muted}>{tr(opportunity.description)}</Text>
          {coverage.opportunity?.answers && coverage.opportunity.answers.length > 0 && (
            <Text style={styles.muted}>{t('expeditions.confirm.optInAnswers', { names: coverage.opportunity.answers.map((a) => a.heroName).join(', ') })}</Text>
          )}
        </View>
      )}
      <MealPicker stock={save.consumables} value={loadout.mealId} onChange={(mealId) => setLoadout({ ...loadout, mealId })} disabled={spoiled} />
      {spoiled && <Text style={styles.muted}>{t('expeditions.confirm.spoiledStores')}</Text>}
      {lootLines.length > 0 && <Text style={styles.label}>{t('expeditions.confirm.rewards')}</Text>}
      {lootLines.map((line) => (
        <View key={line.id} style={styles.row}>
          <IconLabel emoji={line.emoji} label={line.text} labelStyle={line.applies ? styles.text : styles.muted} />
          {!line.applies && <Text style={styles.muted}>{t('expeditions.confirm.lootNoEffect')}</Text>}
          {line.twice && <Text style={styles.muted}>{t('expeditions.confirm.lootOnce')}</Text>}
        </View>
      ))}
      <View style={styles.row}>
        <IconLabel emoji="⏳" label={formatDuration((party.length > 0 ? plan.minutes : expeditionMinutes(save, dungeon)) * 60_000 * durationScale)} labelStyle={styles.text} />
        {plan.shortcut && <FamilyTag family="cunning" named={false} size={18} />}
        {plan.shortcut && <Text style={styles.good}>{t('families.shortcut')}</Text>}
      </View>
      {heroes.map((hero) => {
        const exhausted = isExhausted(hero, now);
        const share = currentHp(save, hero, now) / maxHp(save, hero);
        if (!exhausted && share >= 1) return null;
        return (
          <View key={hero.id} style={styles.warning}>
            <IconLabel
              emoji="⚠️"
              label={
                exhausted
                  ? t('expeditions.confirm.exhausted', { name: hero.name, time: formatDuration((hero.exhaustedUntil ?? now) - now) })
                  : t('expeditions.confirm.hurt', { name: hero.name, percent: formatPercent(share), time: formatDuration(timeToFull(save, hero, now)) })
              }
              labelStyle={styles.text}
            />
            {drinkProblem(save, hero.id, now) === null && <WoodButton compact title={t('expeditions.confirm.drink')} onPress={() => drinkPotion(hero.id)} />}
          </View>
        );
      })}
      {without('weapon') ? <Text style={styles.bad}>{t('expeditions.confirm.noWeapon', { names: without('weapon') })}</Text> : null}
      {without('armor') ? <Text style={styles.bad}>{t('expeditions.confirm.noArmor', { names: without('armor') })}</Text> : null}
    </ParchmentCard>
  );
}

/** An expedition's party dialog: the shared one, with the run's supplies and meal under the plates. */
export function ExpeditionDialog({ dungeon, now, durationScale, briefing: fixedBriefing, onSend, onClose }: Props) {
  const save = useGameStore((state) => state.save);
  const [loadout, setLoadout] = useState<Required<Loadout>>({ mealId: null, optIn: false });
  // Once a minute is enough: the briefing, HP and the odds follow the minute.
  const minute = Math.floor(now / 60_000) * 60_000;
  const briefing = useMemo(
    () => fixedBriefing ?? briefingOf(save, dungeon, currentRotation(minute), minute),
    // The briefing changes with the day, the tutorial and the safe start only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fixedBriefing, dungeon, minute, save.tutorial.step, save.stats.expeditionsLaunched],
  );
  const oddsOf = useCallback(
    (dressed: SaveData, heroIds: string[]) => {
      const options = { now: minute, loadout, briefing };
      return { key: oddsKey({ save: dressed, heroIds, dungeon, options }), run: () => cachedEstimateOdds(dressed, heroIds, dungeon, undefined, options) };
    },
    [dungeon, minute, loadout, briefing],
  );
  // The tutorial's run starts with its heroes in; elsewhere the plates start empty.
  const [initialHeroIds] = useState(() =>
    save.tutorial.step === 'done' ? [] : save.heroes.filter((h) => canJoin(heroStatus(save, h, now))).slice(0, rosterRules.partySize).map((h) => h.id),
  );
  const kind = dungeon.overnight ? 'overnight' : dungeon.isBoss ? 'boss' : dungeon.difficulty === 'easy' ? 'short' : 'long';

  return (
    <PartyDialog
      title={tr(dungeon.name)}
      subtitle={`${kind === 'overnight' ? t('expeditions.overnight.title') : t(`expeditions.kind.${kind}`)} · ${formatDuration(expeditionMinutes(save, dungeon) * 60_000 * durationScale)}`}
      slots={rosterRules.partySize}
      draftKey={`expedition:${dungeon.id}`}
      briefing={briefing}
      oddsOf={oddsOf}
      now={minute}
      initialHeroIds={initialHeroIds}
      sendLabel={t('expeditions.send')}
      consumables
      problem={(dressed, party) => {
        if (briefing.restriction !== 'narrowPassages' || party.length <= narrowPartySize(rosterRules.partySize)) return null;
        const lifted = briefingCoverage(dressed, party, briefing).restriction?.cancelledBy;
        return lifted ? null : t('threats.narrowCap', { count: narrowPartySize(rosterRules.partySize) });
      }}
      details={(dressed, party) => (
        <ExpeditionDetails
          save={dressed}
          party={party}
          dungeon={dungeon}
          briefing={briefing}
          loadout={loadout}
          setLoadout={setLoadout}
          now={minute}
          durationScale={durationScale}
        />
      )}
      onSend={(party) => onSend(party, loadout)}
      onClose={onClose}
    />
  );
}

const styles = StyleSheet.create({
  details: { gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  section: { gap: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  text: { fontFamily: fonts.serif, fontSize: 15, color: ui.ink },
  muted: { fontFamily: fonts.serif, fontSize: 14, color: ui.inkMuted },
  good: { fontFamily: fonts.serif, fontSize: 15, color: ui.good },
  bad: { fontFamily: fonts.serif, fontSize: 14, color: ui.bad },
  label: { fontFamily: fonts.body, fontSize: 16, color: ui.woodSelected },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  option: { paddingHorizontal: 6, paddingVertical: 4, minHeight: 36, justifyContent: 'center', borderWidth: 2, borderColor: colors.woodDark, backgroundColor: ui.parchmentShade },
  optionActive: { borderColor: ui.outline, backgroundColor: colors.highlight },
  optionDisabled: { opacity: 0.4 },
  optionText: { fontSize: 16 },
  warning: { gap: 6, padding: 8, borderWidth: 2, borderColor: ui.bad, backgroundColor: ui.badBg },
});
