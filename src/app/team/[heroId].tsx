import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { EquipPicker } from '@/components/EquipPicker';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { gearStatsText, STATS, statIcons } from '@/components/GearRow';
import { HpBar } from '@/components/HpBar';
import { Panel } from '@/components/Panel';
import { PixelBar } from '@/components/PixelBar';
import { IconSlot, SectionTitle } from '@/components/Row';
import { Text } from '@/components/Text';
import { Tip } from '@/components/Tip';
import { TutorialHint } from '@/components/TutorialHint';
import { abilityText } from '@/content/abilities';
import { elementInfo } from '@/content/elements';
import { masteryTypeNames, qualities } from '@/content/forging';
import { heroClasses, xpToNextLevel } from '@/content/heroes';
import { traitById } from '@/content/traits';
import { gearName, itemById } from '@/content/lookup';
import { answersMemberOf, prepareParty } from '@/game/expeditions/simulate';
import { drinkProblem } from '@/game/team/health';
import { canDismiss, heroStats, isOnExpedition } from '@/game/team/team';
import { APPROACHES, heroAnswers } from '@/game/threats/answers';
import type { EquipmentSlot, WeaponType } from '@/game/types';
import { useLanguage } from '@/hooks/useLanguage';
import { useNow } from '@/hooks/useNow';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors, pixel } from '@/theme';

const SLOTS: EquipmentSlot[] = ['weapon', 'armor', 'consumable'];

export default function CharacterSheetScreen() {
  useLanguage();
  const { heroId } = useLocalSearchParams<{ heroId: string }>();
  const save = useGameStore((state) => state.save);
  const equip = useGameStore((state) => state.equip);
  const dismiss = useGameStore((state) => state.dismissHero);
  const drinkPotion = useGameStore((state) => state.drinkPotion);
  const now = useNow();
  const [picking, setPicking] = useState<EquipmentSlot | null>(null);

  const hero = save.heroes.find((h) => h.id === heroId);
  if (!hero) return <PlaceholderScreen title={t('hero.unknown')} description={t('hero.unknownHint')} />;

  const heroClass = heroClasses[hero.classId];
  const stats = heroStats(save, hero);
  const away = isOnExpedition(save, hero.id);

  const trait = traitById[hero.trait];
  // The hero as equipped, seen through the threats rules; the kit keyword is
  // left out here because it only counts on the threats the kit covers.
  const member = prepareParty(save, [hero.id], now)[0];
  const answers = member ? heroAnswers(answersMemberOf(member), null) : null;
  const keywords = (answers?.keywords ?? []).filter((k) => k.source !== 'kit');
  const weapons = (Object.keys(heroClass.affinities) as WeaponType[]).map((w) => tr(masteryTypeNames[w].name).toLowerCase());
  const element = heroClass.element ? elementInfo[heroClass.element] : null;
  const next = xpToNextLevel(hero.level);
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

  /** What the slot holds: icon, name in its quality colour, and stats for gear. */
  const slotContent = (slot: EquipmentSlot) => {
    const id = hero.equipment[slot];
    if (id && slot === 'consumable') return { emoji: itemById[id].emoji, icon: itemById[id].icon, name: tr(itemById[id].name) };
    const gear = id ? save.gear.find((g) => g.uid === id) : undefined;
    if (!gear) return { emoji: '·', name: t('hero.empty') };
    const item = itemById[gear.itemId];
    return { emoji: item.emoji, icon: item.icon, name: gearName(gear), color: qualities[gear.quality].color, stats: gearStatsText(gear) };
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: hero.name }} />
      <TutorialHint screen="hero" />
      <Panel color={colors.wood} style={styles.header}>
        <View style={styles.identity}>
          <IconSlot emoji={heroClass.emoji} size={64} />
          <View style={styles.identityText}>
            <Text style={styles.name}>{hero.name}</Text>
            <Text style={styles.className}>
              {tr(heroClass.name)}
              {element ? ` · ${element.emoji} ${tr(element.name)}` : ''}
            </Text>
            <Text style={styles.level}>{t('common.level', { level: hero.level })}</Text>
          </View>
        </View>
        <PixelBar value={next ? hero.xp / next : 1} color={colors.highlight} />
        <Text style={styles.xp}>
          {t('hero.xp', { xp: hero.xp, next })}
          {away ? t('common.onExpedition') : ''}
          {save.escort?.heroId === hero.id ? t('common.escort') : ''}
          {save.patrolFights.some((fight) => fight.heroIds.includes(hero.id)) ? t('common.patrol') : ''}
        </Text>
        <HpBar save={save} hero={hero} now={now} light />
        {!away && (
          <View style={styles.drink}>
            <Button
              title={t('health.drink', { count: (save.consumables.healingPotion ?? 0) + (hero.equipment.consumable === 'healingPotion' ? 1 : 0) })}
              disabled={drinkProblem(save, hero.id, now) !== null}
              onPress={() => drinkPotion(hero.id)}
            />
            <Text style={styles.xp}>{t('health.drinkHint')}</Text>
          </View>
        )}
      </Panel>

      <SectionTitle>{t('hero.stats')}</SectionTitle>
      <View style={styles.stats}>
        {STATS.map((stat) => (
          <Tip key={stat} title={t(`hero.statNames.${stat}`)} text={t(`hero.statTips.${stat}`)} style={styles.stat}>
            <Text style={styles.statIcon}>{statIcons[stat]}</Text>
            <View>
              <Text style={styles.statName}>{t(`hero.statNames.${stat}`)}</Text>
              <Text style={styles.statValue}>{stats[stat]}</Text>
            </View>
          </Tip>
        ))}
      </View>

      <SectionTitle>{t('hero.approaches')}</SectionTitle>
      <View style={styles.approaches}>
        {APPROACHES.map((approach) => {
          const value = answers?.approaches[approach] ?? 0;
          return (
            <View key={approach} style={styles.approach}>
              <Text style={styles.approachName}>{t(`threats.approach.${approach}`)}</Text>
              <Text style={styles.approachPips}>{'●'.repeat(value) + '○'.repeat(5 - value)}</Text>
            </View>
          );
        })}
      </View>

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
      {SLOTS.map((slot) => {
        const content = slotContent(slot);
        return (
          <Pressable
            key={slot}
            accessibilityRole="button"
            disabled={away}
            onPress={() => setPicking(slot)}
            style={({ pressed }) => [styles.slot, pressed && styles.pressed]}
          >
            <IconSlot emoji={content.emoji} icon={content.icon} size={40} />
            <View style={styles.slotBody}>
              <Text style={styles.slotName}>{t(`hero.slots.${slot}`)}</Text>
              <Text style={[styles.slotValue, content.color ? { color: content.color } : null]}>{content.name}</Text>
              {content.stats ? <Text style={styles.muted}>{content.stats}</Text> : null}
            </View>
            {!away && <Text style={styles.chevron}>›</Text>}
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
      <Text>{t('hero.weapons', { weapons: weapons.join(', ') })}</Text>
      {heroClass.abilities.map((ability, i) => (
        <Text key={i} style={styles.ability}>
          ◆ {abilityText(ability)}
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
  chevron: { fontSize: 28, color: colors.muted },
  muted: { color: colors.muted, paddingVertical: 4 },
  traitName: { fontSize: 20 },
  ability: { color: colors.ink, paddingVertical: 2 },
  dismiss: { marginTop: 24, alignItems: 'flex-start', gap: 4 },
});
