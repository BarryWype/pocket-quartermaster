import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { heroClasses } from '@/content/heroes';
import { tavernRules } from '@/content/taverns';
import { traitById } from '@/content/traits';
import { distanceMeters } from '@/game/generation/geo';
import { rosterCap } from '@/game/guild/guild';
import { buyProblem, placeStock, stockLeft } from '@/game/places/shops';
import type { LatLng } from '@/game/generation/types';
import {
  buySupplyProblem,
  recruitProblem,
  supplyPrice,
  tavernOffers,
  type RecruitOffer,
  type RecruitProblem,
  type TavernSpawn,
} from '@/game/taverns/taverns';
import { debugEnabled, useDebugStore } from '@/store/debugStore';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors, pixel } from '@/theme';

import { Button } from './Button';
import { ClassSummary } from './ClassSummary';
import { lineName } from './PlacePanel';
import { RecruitGrade } from './RecruitGrade';
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
  const buySupply = useGameStore((state) => state.buySupply);
  const buyAtPlace = useGameStore((state) => state.buyAtPlace);
  const offerSeed = useDebugStore((state) => (debugEnabled(state) ? state.offerSeed : ''));
  const [openedAt] = useState(() => Date.now());
  const offers = tavernOffers(save, tavern.id, openedAt, offerSeed);
  const distance = distanceMeters(player, tavern.position);
  const seeClasses = useGameStore((state) => state.seeClasses);
  const offeredClasses = offers.map((o) => o.classId).join(',');
  useEffect(() => seeClasses(offeredClasses.split(',') as RecruitOffer['classId'][]), [offeredClasses, seeClasses]);

  const offerRow = (offer: RecruitOffer) => {
    const heroClass = heroClasses[offer.classId];
    const trait = traitById[offer.trait];
    const problem = recruitProblem(save, offer, tavern.position, player);
    return (
      <View key={offer.id} style={styles.offer}>
        <Text style={styles.name}>
          {heroClass.emoji} {t('tavern.offer', { name: offer.name, className: tr(heroClass.name), level: offer.level })}
        </Text>
        <RecruitGrade grade={offer.grade} roll={offer.roll} />
        <Text style={[styles.trait, { color: trait.positive ? colors.ink : colors.danger }]}>
          {tr(trait.name)}: {tr(trait.description)}
        </Text>
        <ClassSummary classId={offer.classId} />
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
            <View style={styles.offer}>
              <Text style={styles.name}>🥓 {t('tavern.emergency')}</Text>
              <Text style={styles.muted}>{t('tavern.emergencyHint', { held: save.consumables.jerky ?? 0 })}</Text>
              <View style={styles.actions}>
                <Text style={styles.price}>🪙 {supplyPrice(save)}</Text>
                <Button
                  title={t('tavern.buy')}
                  disabled={buySupplyProblem(save, 1, tavern.position, player) !== null}
                  onPress={() => buySupply(1, tavern.position, player)}
                />
              </View>
            </View>
            {placeStock(save, tavern).map((line) => (
              <View key={line.key} style={styles.offer}>
                <Text style={styles.name}>{lineName(line)}</Text>
                <View style={styles.actions}>
                  <Text style={styles.price}>🪙 {line.price}</Text>
                  <Text style={styles.muted}>
                    {stockLeft(save, tavern, line) > 0 ? t('places.left', { count: stockLeft(save, tavern, line) }) : t('places.soldOut')}
                  </Text>
                  <Button
                    title={t('tavern.buy')}
                    disabled={buyProblem(save, tavern, line.key, 1, player, openedAt) !== null}
                    onPress={() => buyAtPlace(tavern, line.key, 1, player)}
                  />
                </View>
              </View>
            ))}
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
