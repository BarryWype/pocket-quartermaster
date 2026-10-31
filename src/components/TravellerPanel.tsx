import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { frPatrolTexts } from '@/content/fr/patrols';
import { heroClasses } from '@/content/heroes';
import { materialById } from '@/content/lookup';
import { patrolTexts } from '@/content/patrols';
import { traitById } from '@/content/traits';
import { mealItems, supplyHeld } from '@/game/expeditions/provisions';
import { guildBonus } from '@/game/guild/guild';
import { valuableSellPrice } from '@/game/loot/valuables';
import type { LatLng } from '@/game/generation/types';
import { isTravellerKind, type PatrolSpawn } from '@/game/patrols/generate';
import {
  helpProblem,
  traderValuableProblem,
  tradeProblem,
  traderOffers,
  travellerOffer,
  type TradeProblem,
  type TravellerReward,
} from '@/game/patrols/travellers';
import { distanceTo } from '@/game/patrols/visibility';
import { lootText } from '@/hooks/usePatrols';
import { localized, t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

import { Button } from './Button';
import { ClassSummary } from './ClassSummary';
import { patrolIcons } from './PatrolMarker';
import { Overlay } from './Overlay';
import { Sheet } from './Sheet';
import { RecruitGrade } from './RecruitGrade';
import { ValuableRows } from './ValuableRows';
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
  const sellValuableToTrader = useGameStore((state) => state.sellValuableToTrader);
  const acceptTravellerRecruit = useGameStore((state) => state.acceptTravellerRecruit);
  const [helped, setHelped] = useState<{ reward: TravellerReward; rosterFull: boolean } | null>(null);
  const kind = isTravellerKind(spawn.kind) ? spawn.kind : null;
  const texts = localized({ en: patrolTexts, fr: frPatrolTexts });
  const seeClasses = useGameStore((state) => state.seeClasses);
  const recruitClass = helped?.reward.kind === 'recruit' ? helped.reward.offer.classId : null;
  useEffect(() => {
    if (recruitClass) seeClasses([recruitClass]);
  }, [recruitClass, seeClasses]);

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
    <Overlay onClose={onClose} position="bottom">
      <Sheet title={`${patrolIcons[kind]} ${traveller.name}`} bodyStyle={styles.content}
      footer={
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
      }>
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
            <ValuableRows
              valuables={save.valuables}
              price={(key) => valuableSellPrice(key.split(':')[0], Number(key.split(':')[1]), 'trader', null, guildBonus(save, 'collector'))}
              canSell={(key, count) => traderValuableProblem(save, spawn, key, count, player, now) === null}
              onSell={(key, count) => sellValuableToTrader(spawn, key, count, player)}
            />
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
            {reward.kind === 'loot' && (
              <Text style={styles.name}>
                {[lootText(reward.loot), reward.blessing ? t('patrols.rewardBlessing') : null].filter(Boolean).join(' ') ||
                  t('chests.nothing')}
              </Text>
            )}
            {recruit && (
              <View style={styles.recruit}>
                <Text style={styles.name}>{t('patrols.recruitOffer', { name: recruit.name })}</Text>
                <Text style={styles.muted}>
                  {t('tavern.offer', {
                    name: recruit.name,
                    className: tr(heroClasses[recruit.classId].name),
                    level: recruit.level,
                  })}
                </Text>
                <ClassSummary classId={recruit.classId} />
                <RecruitGrade grade={recruit.grade} roll={recruit.roll} />
                <Text style={[styles.trait, { color: traitById[recruit.trait].positive ? colors.ink : colors.danger }]}>
                  {tr(traitById[recruit.trait].name)}: {tr(traitById[recruit.trait].description)}
                </Text>
                <View style={styles.actions}>
                  <Button title={t('patrols.accept')} onPress={() => { acceptTravellerRecruit(recruit); onClose(); }} />
                  <Button title={t('patrols.decline')} color={colors.muted} onPress={onClose} />
                </View>
              </View>
            )}
            {helped?.rosterFull && <Text style={styles.muted}>{t('patrols.rosterFull')}</Text>}
          </View>
        )}
      </Sheet>
    </Overlay>
  );
}
const styles = StyleSheet.create({
  content: { gap: 6, paddingBottom: 12 },
  muted: { color: colors.muted },
  offer: { gap: 4, paddingVertical: 10, borderTopWidth: 2, borderTopColor: colors.parchmentDark },
  recruit: { gap: 4 },
  name: { fontSize: 21 },
  trait: { fontSize: 19 },
  problem: { color: colors.muted, fontStyle: 'italic' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
