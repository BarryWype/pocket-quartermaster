import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';

import { elementInfo } from '@/content/elements';
import { frPatrolTexts } from '@/content/fr/patrols';
import { heroClasses } from '@/content/heroes';
import { materialById } from '@/content/lookup';
import { patrolTexts } from '@/content/patrols';
import { traitById } from '@/content/traits';
import { mealItems, supplyHeld } from '@/game/expeditions/provisions';
import type { LatLng } from '@/game/generation/types';
import { isTravellerKind, type PatrolSpawn } from '@/game/patrols/generate';
import {
  helpProblem,
  tradeProblem,
  traderOffers,
  travellerOffer,
  type TradeProblem,
  type TravellerReward,
} from '@/game/patrols/travellers';
import { distanceTo } from '@/game/patrols/visibility';
import { formatNumber, localized, t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors, pixel } from '@/theme';

import { Button } from './Button';
import { patrolIcons } from './PatrolMarker';
import { Text } from './Text';

const helpProblemText: Record<'tooFar' | 'gone' | 'noStock', (distance: number) => string> = {
  tooFar: (distance) => t('patrols.walkCloser', { distance: Math.round(distance) }),
  gone: () => t('patrols.gone'),
  noStock: () => t('patrols.noStock'),
};

const tradeProblemText: Record<Exclude<TradeProblem, null>, (distance: number) => string> = {
  tooFar: (distance) => t('patrols.walkCloser', { distance: Math.round(distance) }),
  gone: () => t('patrols.gone'),
  usedUp: () => t('patrols.usedUp'),
  noMaterials: () => t('patrols.noMaterials'),
};

type Props = {
  spawn: PatrolSpawn;
  player: LatLng;
  now: number;
  onClose: () => void;
};

/** The traveller dialog: what they ask for, what the player holds, and their reward. */
export function TravellerPanel({ spawn, player, now, onClose }: Props) {
  const save = useGameStore((state) => state.save);
  const helpTraveller = useGameStore((state) => state.helpTraveller);
  const tradeWithTrader = useGameStore((state) => state.tradeWithTrader);
  const acceptTravellerRecruit = useGameStore((state) => state.acceptTravellerRecruit);
  const [helped, setHelped] = useState<{ reward: TravellerReward; rosterFull: boolean } | null>(null);
  const kind = isTravellerKind(spawn.kind) ? spawn.kind : null;
  const texts = localized({ en: patrolTexts, fr: frPatrolTexts });

  if (!kind) return null;

  const traveller = texts.travellers[kind];
  const offer = travellerOffer(spawn, save);
  const supplyPoints = offer.kind === 'mealOrSupply' ? offer.supplyPoints : 0;
  const problem = helpProblem(save, spawn, player, now);
  const helpProblemShown = problem === 'trader' ? null : problem;
  const reward = helped?.reward ?? null;
  const recruit = reward?.kind === 'recruit' ? reward.offer : null;

  const help = (choice?: 'meal' | 'supply') => setHelped(helpTraveller(spawn, player, choice));
  const hasMeal = kind === 'pilgrim' && mealItems.some((item) => (save.consumables[item.id] ?? 0) > 0);
  const canSupply = kind === 'pilgrim' && supplyHeld(save.consumables) >= supplyPoints;

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.title}>
              {patrolIcons[kind]} {traveller.name}
            </Text>
            <Text style={styles.muted}>{traveller.line}</Text>

            {kind === 'trader' ? (
              <>
                <Text style={styles.muted}>{t('patrols.askTrade')}</Text>
                {traderOffers(spawn, save).map((trade) => {
                  const issue = tradeProblem(save, spawn, trade.index, player, now);
                  return (
                    <View key={trade.index} style={styles.offer}>
                      <Text style={styles.name}>
                        {trade.give.amount} {tr(materialById[trade.give.materialId]?.name ?? trade.give.materialId)} →{' '}
                        {trade.get.amount} {tr(materialById[trade.get.materialId]?.name ?? trade.get.materialId)}
                      </Text>
                      <Text style={styles.muted}>
                        {t('patrols.held', { count: save.materials[trade.give.materialId] ?? 0 })} ·{' '}
                        {t('patrols.usesLeft', { count: trade.usesLeft })}
                      </Text>
                      <View style={styles.actions}>
                        <Button
                          title={t('patrols.trade')}
                          disabled={issue !== null}
                          onPress={() => tradeWithTrader(spawn, trade.index, player)}
                        />
                      </View>
                      {issue && <Text style={styles.problem}>{tradeProblemText[issue](distanceTo(spawn, player, now))}</Text>}
                    </View>
                  );
                })}
              </>
            ) : (
              !reward && (
                <>
                  <Text style={styles.muted}>
                    {kind === 'wounded'
                      ? t('patrols.askPotion')
                      : t('patrols.askMeal', { points: supplyPoints })}
                  </Text>
                  <Text style={styles.muted}>
                    {kind === 'wounded'
                      ? t('patrols.potionsHeld', {
                          count: offer.kind === 'potion' ? (save.consumables[offer.itemId] ?? 0) : 0,
                        })
                      : t('patrols.provisionsHeld', {
                          meals: mealItems.reduce((sum, item) => sum + (save.consumables[item.id] ?? 0), 0),
                          points: supplyHeld(save.consumables),
                        })}
                  </Text>
                  {helpProblemShown && (
                    <Text style={styles.problem}>{helpProblemText[helpProblemShown](distanceTo(spawn, player, now))}</Text>
                  )}
                </>
              )
            )}

            {reward && (
              <View style={styles.offer}>
                {reward.kind === 'keyFragment' ? (
                  <Text style={styles.name}>
                    {texts.keyFragment.name} — {texts.keyFragment.description}
                  </Text>
                ) : reward.kind === 'recruit' ? null : (
                  <Text style={styles.name}>
                    {reward.kind === 'gold'
                      ? t('patrols.rewardGold', { gold: formatNumber(reward.gold) })
                      : reward.kind === 'shards'
                        ? t('patrols.rewardShards', {
                            count: reward.amount,
                            element: tr(elementInfo[reward.element].name).toLowerCase(),
                          })
                        : reward.kind === 'treasureSpot'
                          ? t('patrols.rewardTreasure')
                          : t('patrols.rewardBlessing')}
                  </Text>
                )}
                {recruit && (
                  <>
                    <Text style={styles.name}>{t('patrols.recruitOffer', { name: recruit.name })}</Text>
                    <Text style={styles.muted}>
                      {t('tavern.offer', {
                        name: recruit.name,
                        className: tr(heroClasses[recruit.classId].name),
                        level: recruit.level,
                      })}
                    </Text>
                    <Text style={[styles.trait, { color: traitById[recruit.trait].positive ? colors.ink : colors.danger }]}>
                      {tr(traitById[recruit.trait].name)}: {tr(traitById[recruit.trait].description)}
                    </Text>
                    <View style={styles.actions}>
                      <Button title={t('patrols.accept')} onPress={() => { acceptTravellerRecruit(recruit); onClose(); }} />
                      <Button title={t('patrols.decline')} color={colors.muted} onPress={onClose} />
                    </View>
                  </>
                )}
                {helped?.rosterFull && <Text style={styles.muted}>{t('patrols.rosterFull')}</Text>}
              </View>
            )}
          </ScrollView>
          <View style={styles.actions}>
            {!reward && kind !== 'trader' && (
              <>
                {kind === 'wounded' && (
                  <Button title={t('patrols.help')} disabled={helpProblemShown !== null} onPress={() => help()} />
                )}
                {kind === 'pilgrim' && hasMeal && (
                  <Button title={t('patrols.giveMeal')} disabled={helpProblemShown !== null} onPress={() => help('meal')} />
                )}
                {kind === 'pilgrim' && canSupply && (
                  <Button
                    title={t('patrols.giveSupply', { points: supplyPoints })}
                    disabled={helpProblemShown !== null}
                    onPress={() => help('supply')}
                  />
                )}
              </>
            )}
            <Button title={t('patrols.walkOn')} color={colors.muted} onPress={onClose} />
          </View>
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
  problem: { color: colors.muted, fontStyle: 'italic' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
