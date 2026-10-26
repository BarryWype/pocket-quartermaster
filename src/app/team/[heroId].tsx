import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { EquipPicker } from '@/components/EquipPicker';
import { PlaceholderScreen } from '@/components/PlaceholderScreen';
import { Row } from '@/components/Row';
import { Text } from '@/components/Text';
import { TutorialHint } from '@/components/TutorialHint';
import { abilityText } from '@/content/abilities';
import { masteryTypeNames, qualities } from '@/content/forging';
import { heroClasses, xpToNextLevel } from '@/content/heroes';
import { traitById } from '@/content/traits';
import { gearName, itemById } from '@/content/lookup';
import { canDismiss, heroStats, isOnExpedition } from '@/game/team/team';
import type { EquipmentSlot, WeaponType } from '@/game/types';
import { useLanguage } from '@/hooks/useLanguage';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

const SLOTS: EquipmentSlot[] = ['weapon', 'armor', 'consumable'];

export default function CharacterSheetScreen() {
  useLanguage();
  const { heroId } = useLocalSearchParams<{ heroId: string }>();
  const save = useGameStore((state) => state.save);
  const equip = useGameStore((state) => state.equip);
  const dismiss = useGameStore((state) => state.dismissHero);
  const [picking, setPicking] = useState<EquipmentSlot | null>(null);

  const hero = save.heroes.find((h) => h.id === heroId);
  if (!hero) return <PlaceholderScreen title={t('hero.unknown')} description={t('hero.unknownHint')} />;

  const heroClass = heroClasses[hero.classId];
  const stats = heroStats(save, hero);
  const away = isOnExpedition(save, hero.id);

  const slotLabel = (slot: EquipmentSlot) => {
    const id = hero.equipment[slot];
    if (!id) return t('hero.empty');
    if (slot === 'consumable') return `${itemById[id].emoji} ${tr(itemById[id].name)}`;
    const gear = save.gear.find((g) => g.uid === id);
    return gear ? `${itemById[gear.itemId].emoji} ${gearName(gear)}` : t('hero.empty');
  };
  const trait = traitById[hero.trait];
  const weapons = (Object.keys(heroClass.affinities) as WeaponType[]).map((w) => tr(masteryTypeNames[w].name).toLowerCase());
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
  const slotColor = (slot: EquipmentSlot) => {
    const gear = slot === 'consumable' ? undefined : save.gear.find((g) => g.uid === hero.equipment[slot]);
    return gear ? { color: qualities[gear.quality].color } : null;
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Stack.Screen options={{ title: hero.name }} />
      <TutorialHint screen="hero" />
      <View style={styles.card}>
        <Row
          emoji={heroClass.emoji}
          title={`${hero.name} · ${tr(heroClass.name)}`}
          subtitle={`${t('hero.xp', { level: hero.level, xp: hero.xp, next: xpToNextLevel(hero.level) })}${away ? t('common.onExpedition') : ''}`}
        />
        <Text style={styles.stats}>
          ⚔️ {stats.attack}   🛡️ {stats.defense}   ✨ {stats.magic}   ❤️ {stats.hp}
        </Text>
        {SLOTS.map((slot) => (
          <View key={slot} style={styles.slot}>
            <Text style={styles.slotName}>{t(`hero.slots.${slot}`)}</Text>
            <Text style={[styles.slotValue, slotColor(slot)]}>{slotLabel(slot)}</Text>
            <Button title={t('hero.change')} disabled={away} onPress={() => setPicking(slot)} />
          </View>
        ))}
        {away && <Text style={styles.hint}>{t('hero.awayHint')}</Text>}
      </View>

      <View style={styles.details}>
        {trait && (
          <Text style={{ color: trait.positive ? colors.ink : colors.danger }}>
            {t('hero.trait', { name: tr(trait.name), description: tr(trait.description) })}
          </Text>
        )}
        <Text>{t('hero.weapons', { weapons: weapons.join(', ') })}</Text>
        {heroClass.abilities.map((ability, i) => (
          <Text key={i} style={styles.hint}>
            • {abilityText(ability)}
          </Text>
        ))}
        <Button
          title={t('hero.dismiss')}
          color={colors.danger}
          disabled={!canDismiss(save, hero.id)}
          onPress={confirmDismiss}
        />
        {!canDismiss(save, hero.id) && (
          <Text style={styles.hint}>{away ? t('hero.cantDismissAway') : t('hero.cantDismissLast')}</Text>
        )}
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
  container: { padding: 16 },
  card: { borderWidth: 2, borderColor: colors.ink, borderRadius: 16, padding: 12, backgroundColor: colors.parchment },
  stats: { fontSize: 15, marginVertical: 8 },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  slotName: { width: 90, textTransform: 'capitalize', color: colors.muted },
  slotValue: { flex: 1 },
  hint: { color: colors.muted, marginTop: 8 },
  details: { gap: 4, marginTop: 12 },
});
