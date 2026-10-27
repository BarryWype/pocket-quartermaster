import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { abilityText } from '@/content/abilities';
import { masteryTypeNames } from '@/content/forging';
import { heroClasses } from '@/content/heroes';
import { tavernRules } from '@/content/taverns';
import { traitById } from '@/content/traits';
import { distanceMeters } from '@/game/generation/geo';
import { rosterCap } from '@/game/guild/guild';
import type { LatLng } from '@/game/generation/types';
import { recruitProblem, tavernOffers, type RecruitOffer, type RecruitProblem, type TavernSpawn } from '@/game/taverns/taverns';
import type { WeaponType } from '@/game/types';
import { debugEnabled, useDebugStore } from '@/store/debugStore';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors, pixel } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

const problemText: Record<RecruitProblem, (distance: number, cap: number) => string> = {
  locked: () => t('tavern.locked'),
  tooFar: (distance) =>
    t('common.tooFar', { radius: tavernRules.interactionMeters, action: t('tavern.recruitAction'), distance: Math.round(distance) }),
  taken: () => t('tavern.taken'),
  rosterFull: (_distance, cap) => t('tavern.rosterFull', { cap }),
  gold: () => t('tavern.gold'),
};

type Props = { tavern: TavernSpawn; player: LatLng; onClose: () => void };

/** A tavern's three recruits for today. */
export function TavernPanel({ tavern, player, onClose }: Props) {
  const save = useGameStore((state) => state.save);
  const recruit = useGameStore((state) => state.recruit);
  const offerSeed = useDebugStore((state) => (debugEnabled(state) ? state.offerSeed : ''));
  const [openedAt] = useState(() => Date.now());
  const offers = tavernOffers(save, tavern.id, openedAt, offerSeed);
  const distance = distanceMeters(player, tavern.position);

  const offerRow = (offer: RecruitOffer) => {
    const heroClass = heroClasses[offer.classId];
    const trait = traitById[offer.trait];
    const problem = recruitProblem(save, offer, tavern.position, player);
    const weapons = (Object.keys(heroClass.affinities) as WeaponType[]).map((w) => tr(masteryTypeNames[w].name).toLowerCase());
    return (
      <View key={offer.id} style={styles.offer}>
        <Text style={styles.name}>
          {heroClass.emoji} {t('tavern.offer', { name: offer.name, className: tr(heroClass.name), level: offer.level })}
        </Text>
        <Text style={[styles.trait, { color: trait.positive ? colors.ink : colors.danger }]}>
          {tr(trait.name)}: {tr(trait.description)}
        </Text>
        <Text style={styles.muted}>
          {[t('tavern.uses', { weapons: weapons.join(', ') }), ...heroClass.abilities.map(abilityText)].join(' · ')}
        </Text>
        <View style={styles.actions}>
          <Text style={styles.price}>🪙 {offer.price}</Text>
          <Button title={t('tavern.recruit')} disabled={problem !== null} onPress={() => recruit(offer, tavern.position, player)} />
        </View>
        {problem && <Text style={styles.problem}>{problemText[problem](distance, rosterCap(save))}</Text>}
      </View>
    );
  };

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>🍺 {tavern.name}</Text>
            <Text style={styles.muted}>
              {t('tavern.header', { gold: save.gold, count: save.heroes.length, cap: rosterCap(save) })}
            </Text>
            {offers.map(offerRow)}
          </ScrollView>
          <Button title={t('common.close')} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.parchment,
    borderTopWidth: pixel.outline + 1,
    borderColor: colors.ink,
    padding: 16,
    maxHeight: '85%',
  },
  content: { gap: 6, paddingBottom: 12 },
  title: { fontSize: 26 },
  muted: { color: colors.muted },
  offer: { gap: 4, paddingVertical: 10, borderTopWidth: 2, borderTopColor: colors.parchmentDark },
  name: { fontSize: 21 },
  trait: { fontSize: 19 },
  price: { fontSize: 21 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  problem: { color: colors.muted, fontStyle: 'italic' },
});
