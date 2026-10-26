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
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

const problemText: Record<RecruitProblem, (distance: number, cap: number) => string> = {
  locked: () => 'Beat the Bandit Stockade to recruit heroes.',
  tooFar: (distance) => `Get within ${tavernRules.interactionMeters} m to recruit (${Math.round(distance)} m away).`,
  taken: () => 'Recruited. New faces arrive tomorrow.',
  rosterFull: (_distance, cap) => `Your roster is full (${cap} heroes). Dismiss someone from Team first.`,
  gold: () => 'Not enough gold.',
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
    const weapons = (Object.keys(heroClass.affinities) as WeaponType[]).map((w) => masteryTypeNames[w].name.toLowerCase());
    return (
      <View key={offer.id} style={styles.offer}>
        <Text style={styles.name}>
          {heroClass.emoji} {offer.name} · {heroClass.name} · level {offer.level}
        </Text>
        <Text style={[styles.trait, { color: trait.positive ? colors.ink : colors.danger }]}>
          {trait.name}: {trait.description}
        </Text>
        <Text style={styles.muted}>
          {[`Uses ${weapons.join(', ')}`, ...heroClass.abilities.map(abilityText)].join(' · ')}
        </Text>
        <View style={styles.actions}>
          <Text style={styles.price}>🪙 {offer.price}</Text>
          <Button title="Recruit" disabled={problem !== null} onPress={() => recruit(offer, tavern.position, player)} />
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
              Gold: {save.gold} · Roster {save.heroes.length}/{rosterCap(save)} · new recruits every day
            </Text>
            {offers.map(offerRow)}
          </ScrollView>
          <Button title="Close" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.parchment,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    maxHeight: '85%',
  },
  content: { gap: 6, paddingBottom: 12 },
  title: { fontSize: 22 },
  muted: { color: colors.muted },
  offer: { gap: 4, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.muted },
  name: { fontSize: 17 },
  trait: { fontSize: 15 },
  price: { fontSize: 17 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  problem: { color: colors.muted, fontStyle: 'italic' },
});
