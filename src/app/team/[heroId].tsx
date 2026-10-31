import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { EquipPicker } from '@/components/EquipPicker';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { gearEffectParts, gearStatsParts, statIcons } from '@/components/GearRow';
import { IconLabel, PartsLine, type LabelPart } from '@/components/IconLabel';
import { GearMarks } from '@/components/GearMarks';
import { HpBar } from '@/components/HpBar';
import { Panel } from '@/components/Panel';
import { PixelBar } from '@/components/PixelBar';
import { IconSlot, SectionTitle } from '@/components/Row';
import { Text } from '@/components/Text';
import { Tip } from '@/components/Tip';
import { TutorialHint } from '@/components/TutorialHint';
import { abilityText } from '@/content/abilities';
import { elementInfo } from '@/content/elements';
import { expeditionRules } from '@/content/dungeons';
import { approachRules } from '@/content/threats';
import { qualities } from '@/content/forging';
import { gearApproachBonus, approachScore, pendingApproachPicks } from '@/game/team/stats';
import { heroClasses, xpRules, xpToNextLevel } from '@/content/heroes';
import { lootConfig } from '@/content/loot/config';
import { traitById } from '@/content/traits';
import { items } from '@/content/items';
import { gearName, itemById } from '@/content/lookup';
import { answersMemberOf, prepareParty } from '@/game/expeditions/simulate';
import { highestUnlockedTier } from '@/game/dungeons/unlock';
import { careProblem, drinkProblem } from '@/game/team/health';
import { affinityOf, canDismiss, hasPotionSlot, healingPotion, heroDamageStat, heroStats, isOnExpedition } from '@/game/team/team';
import { ClassSummary } from '@/components/ClassSummary';
import { APPROACHES, heroAnswers } from '@/game/threats/answers';
import type { EquipmentSlot, GearDef } from '@/game/types';
import { useLanguage } from '@/hooks/useLanguage';
import { useNow } from '@/hooks/useNow';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors, pixel } from '@/theme';


export default function CharacterSheetScreen() {
  useLanguage();
  const { heroId } = useLocalSearchParams<{ heroId: string }>();
  const save = useGameStore((state) => state.save);
  const equip = useGameStore((state) => state.equip);
  const dismiss = useGameStore((state) => state.dismissHero);
  const drinkPotion = useGameStore((state) => state.drinkPotion);
  const giveHomeCare = useGameStore((state) => state.giveHomeCare);
  const pickApproach = useGameStore((state) => state.pickApproach);
  const now = useNow();
  const [picking, setPicking] = useState<EquipmentSlot | null>(null);

  const hero = save.heroes.find((h) => h.id === heroId);
  if (!hero) return <PlaceholderScreen title={t('hero.unknown')} description={t('hero.unknownHint')} />;

  const heroClass = heroClasses[hero.classId];
  const stats = heroStats(save, hero);
  const damageStat = heroDamageStat(save, hero);
  const away = isOnExpedition(save, hero.id);
  const pending = pendingApproachPicks(hero);
  const largeStats = ['hp', damageStat, 'armour', 'speed'] as const;
  const potionsHeld = items
    .filter((item) => healingPotion(item.id))
    .map((item) => ({ item, count: (save.consumables[item.id] ?? 0) + (hero.equipment.consumable === item.id ? 1 : 0) }))
    .filter(({ count }) => count > 0);
  const smallStats = ['resistance', 'evasion', 'crit', 'luck'] as const;

  const slots: EquipmentSlot[] = ['weapon', 'armor', 'offhand', 'trinket', 'consumable', ...(hasPotionSlot(hero) ? ['potion' as const] : [])];
  const trait = traitById[hero.trait];
  // The hero as equipped, seen through the threats rules; the kit keyword is
  // left out here because it only counts on the threats the kit covers.
  const member = prepareParty(save, [hero.id], now)[0];
  const answers = member ? heroAnswers(answersMemberOf(member), null) : null;
  const keywords = (answers?.keywords ?? []).filter((k) => k.source !== 'kit');
  const element = heroClass.element ? elementInfo[heroClass.element] : null;
  const next = xpToNextLevel(hero.level);
  const aboveBand = hero.level >= lootConfig.manuals.topLevelByTier[highestUnlockedTier(save) - 1] + xpRules.aboveBandMargin;
  const confirmDismiss = () =>
    Alert.alert(t('hero.dismissTitle', { name: hero.name }), t('hero.dismissBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('hero.dismiss'),
        style: 'destructive',
        onPress: () => {
          router.back();
          dismiss(hero.id);
        },
      },
    ]);

  /**
   * What the slot holds: icon, name in its quality colour, tier badge with the
   * hero's ▲/▼ marker for gear, and stats. The off-hand is locked under a
   * two-handed weapon.
   */
  const slotContent = (slot: EquipmentSlot) => {
    const id = hero.equipment[slot];
    if (id && (slot === 'consumable' || slot === 'potion')) return { emoji: itemById[id].emoji, icon: itemById[id].icon, name: tr(itemById[id].name) };
    const gear = id ? save.gear.find((g) => g.uid === id) : undefined;
    if (!gear) return { emoji: '·', name: t('hero.empty') };
    const item = itemById[gear.itemId] as GearDef;
    return {
      emoji: item.emoji,
      icon: item.icon,
      name: gearName(gear),
      color: qualities[gear.quality].color,
      stats: [...gearStatsParts(gear), ...gearEffectParts(gear)] as LabelPart[],
      marks: <GearMarks tier={item.tier} affinity={affinityOf(hero.classId, item.gearType)} />,
    };
  };

  const weaponGear = hero.equipment.weapon ? save.gear.find((g) => g.uid === hero.equipment.weapon) : undefined;
  const offhandLocked = !!weaponGear && (itemById[weaponGear.itemId] as GearDef).twoHanded;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: hero.name }} />
      <TutorialHint screen="hero" />
      <Panel color={colors.wood} style={styles.header}>
        <View style={styles.identity}>
          <IconSlot emoji={heroClass.emoji} size={64} />
          <View style={styles.identityText}>
            <Text style={styles.name}>{hero.name}</Text>
            <View style={styles.classNameRow}>
              <Text style={styles.className}>{tr(heroClass.name)}</Text>
              {element && (
                <>
                  <Text style={styles.className}> · </Text>
                  <IconLabel emoji={element.emoji} label={tr(element.name)} labelStyle={styles.className} />
                </>
              )}
            </View>
            <Text style={styles.level}>{t('common.level', { level: hero.level })}</Text>
          </View>
        </View>
        <ClassSummary classId={hero.classId} light />
        <PixelBar value={next ? hero.xp / next : 1} color={colors.highlight} />
        <Text style={styles.xp}>
          {t('hero.xp', { xp: hero.xp, next })}
          {away ? t('common.onExpedition') : ''}
          {save.escort?.heroId === hero.id ? t('common.escort') : ''}
          {save.patrolFights.some((fight) => fight.heroIds.includes(hero.id)) ? t('common.patrol') : ''}
        </Text>
        {aboveBand ? <Text style={styles.xp}>{t('hero.xpAboveBand')}</Text> : null}
        <HpBar save={save} hero={hero} now={now} light />
        {!away && (
          <View style={styles.drink}>
            {potionsHeld.length === 0 && <Button title={t('health.drink', { count: 0 })} disabled onPress={() => {}} />}
            {potionsHeld.map(({ item, count }) => (
              <Button
                key={item.id}
                emoji={item.emoji}
                title={t('health.use', { item: tr(item.name), count })}
                disabled={drinkProblem(save, hero.id, now, item.id) !== null}
                onPress={() => drinkPotion(hero.id, item.id)}
              />
            ))}
            <Text style={styles.xp}>{t('health.drinkHint')}</Text>
            {items
              .filter((item) => item.slot === 'utility' && item.homeCare && (save.consumables[item.id] ?? 0) > 0)
              .map((item) => (
                <Button
                  key={item.id}
                  emoji={item.emoji}
                  title={t('health.use', { item: tr(item.name), count: save.consumables[item.id] })}
                  disabled={careProblem(save, hero.id, item.id, now) !== null}
                  onPress={() => giveHomeCare(hero.id, item.id)}
                />
              ))}
          </View>
        )}
      </Panel>

      <SectionTitle>{t('hero.stats')}</SectionTitle>
      <View style={styles.stats}>
        {largeStats.map((stat) => (
          <Tip key={stat} title={t(`hero.statNames.${stat}`)} text={t(`hero.statTips.${stat}`)} style={styles.stat}>
            <Text style={styles.statIcon}>{statIcons[stat]}</Text>
            <View>
              <Text style={styles.statName}>{t(`hero.statNames.${stat}`)}</Text>
              <Text style={styles.statValue}>{stats[stat]}</Text>
            </View>
          </Tip>
        ))}
      </View>
      <PartsLine
        style={styles.smallStats}
        parts={smallStats.map((stat) => {
          const capped = stat === 'evasion' && stats.evasion >= expeditionRules.evasionCap;
          return { emoji: statIcons[stat], text: `${stats[stat]}${capped ? ` (${t('hero.capped')})` : ''}` };
        })}
      />

      <SectionTitle>
        {`${t('hero.approaches')}${hero.gamble ? ` · 🎲 ${t('classes.rolledToday')}` : ''}${pending > 0 ? ` · ${t('hero.pendingPicks', { count: pending })}` : ''}`}
      </SectionTitle>
      <View style={styles.approaches}>
        {APPROACHES.map((approach) => {
          const value = approachScore(hero, approach, gearApproachBonus(save, hero));
          return (
            <View key={approach} style={styles.approach}>
              <Text style={styles.approachName}>{t(`threats.approach.${approach}`)}</Text>
              <Text style={styles.approachPips}>{'●'.repeat(value) + '○'.repeat(approachRules.max - value)}</Text>
            </View>
          );
        })}
      </View>
      {pending > 0 && (
        <>
          <Text style={styles.muted}>{t('hero.pickApproach')}</Text>
          {APPROACHES.map((approach) => {
            const value = approachScore(hero, approach, gearApproachBonus(save, hero));
            const disabled = value >= approachRules.max;
            return (
              <Pressable
                key={approach}
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => pickApproach(hero.id, approach)}
                style={({ pressed }) => [styles.pickRow, pressed && styles.pressed, disabled && styles.pickDisabled]}
              >
                <Text style={[styles.approachName, disabled && styles.pickDisabled]}>{t(`threats.approach.${approach}`)}</Text>
                <Text style={styles.approachPips}>{'●'.repeat(value) + '○'.repeat(approachRules.max - value)}</Text>
              </Pressable>
            );
          })}
        </>
      )}

      {keywords.length > 0 && (
        <>
          <SectionTitle>{t('hero.keywords')}</SectionTitle>
          <View style={styles.keywords}>
            {keywords.map(({ keyword }) => (
              <View key={keyword} style={styles.keywordChip}>
                <Text>{t(`threats.keyword.${keyword}`)}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <SectionTitle>{t('hero.equipment')}</SectionTitle>
      {slots.map((slot) => {
        const content = slotContent(slot);
        const locked = slot === 'offhand' && offhandLocked;
        return (
          <Pressable
            key={slot}
            accessibilityRole="button"
            disabled={away || locked}
            onPress={() => setPicking(slot)}
            style={({ pressed }) => [styles.slot, pressed && styles.pressed]}
          >
            <IconSlot emoji={locked ? '🔒' : content.emoji} icon={locked ? undefined : content.icon} size={40} />
            <View style={styles.slotBody}>
              <Text style={styles.slotName}>{t(`hero.slots.${slot}`)}</Text>
              <View style={styles.slotValueRow}>
                <Text style={[styles.slotValue, content.color ? { color: content.color } : null, locked && styles.locked]}>
                  {locked ? t('hero.twoHanded') : content.name}
                </Text>
                {content.marks}
              </View>
              {content.stats && content.stats.length > 0 ? <PartsLine parts={content.stats} labelStyle={styles.muted} /> : null}
            </View>
            {!away && !locked && <Text style={styles.chevron}>›</Text>}
          </Pressable>
        );
      })}
      <Text style={styles.muted}>{away ? t('hero.awayHint') : t('hero.tapSlot')}</Text>

      <SectionTitle>{t('hero.skills')}</SectionTitle>
      {trait && (
        <Panel color={trait.positive ? colors.parchment : colors.parchmentDark} borderColor={trait.positive ? colors.ink : colors.danger}>
          <Text style={[styles.traitName, !trait.positive && { color: colors.danger }]}>{t('hero.traitTitle', { name: tr(trait.name) })}</Text>
          <Text>{tr(trait.description)}</Text>
        </Panel>
      )}
      {heroClass.abilities
        .map(abilityText)
        .filter(Boolean)
        .map((text, i) => (
          <Text key={i} style={styles.ability}>
            ◆ {text}
          </Text>
        ))}

      <View style={styles.dismiss}>
        <Button title={t('hero.dismiss')} color={colors.danger} disabled={!canDismiss(save, hero.id)} onPress={confirmDismiss} />
        {!canDismiss(save, hero.id) && <Text style={styles.muted}>{away ? t('hero.cantDismissAway') : t('hero.cantDismissLast')}</Text>}
      </View>

      {picking && (
        <EquipPicker
          save={save}
          heroId={hero.id}
          slot={picking}
          onClose={() => setPicking(null)}
          onPick={(id) => {
            equip(hero.id, picking, id);
            setPicking(null);
          }}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  classNameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 2 },
  container: { padding: 16, paddingBottom: 32 },
  header: { gap: 8 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  identityText: { flex: 1 },
  name: { fontSize: 28, color: colors.parchment },
  className: { fontSize: 19, color: colors.parchment },
  level: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 6, borderWidth: 2, borderColor: colors.ink, backgroundColor: colors.highlight },
  xp: { color: colors.parchment, fontSize: 17 },
  drink: { alignItems: 'flex-start', gap: 4 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 8,
    borderWidth: pixel.outline,
    borderColor: colors.ink,
    backgroundColor: colors.parchmentDark,
  },
  statIcon: { fontSize: 26 },
  statName: { fontSize: 16, color: colors.muted, textTransform: 'uppercase' },
  statValue: { fontSize: 26 },
  approaches: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  approach: {
    width: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: 8,
    borderWidth: pixel.outline,
    borderColor: colors.ink,
    backgroundColor: colors.parchmentDark,
  },
  approachName: { fontSize: 17, flexShrink: 1 },
  approachPips: { fontSize: 15, color: colors.muted },
  smallStats: { color: colors.muted, paddingVertical: 4 },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: 8,
    borderWidth: pixel.outline,
    borderColor: colors.ink,
    backgroundColor: colors.parchmentDark,
  },
  pickDisabled: { opacity: 0.4 },
  keywords: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  keywordChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: pixel.outline,
    borderColor: colors.woodDark,
    backgroundColor: colors.parchmentDark,
  },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, borderBottomWidth: 2, borderBottomColor: colors.parchmentDark },
  pressed: { opacity: 0.6 },
  slotBody: { flex: 1 },
  slotName: { fontSize: 16, color: colors.muted, textTransform: 'uppercase' },
  slotValue: { fontSize: 20 },
  slotValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locked: { color: colors.muted },
  chevron: { fontSize: 28, color: colors.muted },
  muted: { color: colors.muted, paddingVertical: 4 },
  traitName: { fontSize: 20 },
  ability: { color: colors.ink, paddingVertical: 2 },
  dismiss: { marginTop: 24, alignItems: 'flex-start', gap: 4 },
});
