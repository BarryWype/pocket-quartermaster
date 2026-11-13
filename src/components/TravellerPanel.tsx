import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { frPatrolTexts } from '@/content/fr/patrols';
import { heroClasses } from '@/content/heroes';
import { materialById } from '@/content/lookup';
import { patrolRules, patrolTexts } from '@/content/patrols';
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
import { LootGrid } from '@/components/LootGrid';
import { lootTiles, type RewardTile } from '@/game/loot/tiles';
import { localized, t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

import { ClassSummary } from './ClassSummary';
import { patrolIcons } from './PatrolMarker';
import { Overlay } from './Overlay';
import { Sheet } from './Sheet';
import { EmberButton, WoodButton } from './ui';
import { RecruitGrade } from './RecruitGrade';
import { SpecialLabel } from './SpecialLabel';
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
  const [helped, setHelped] = useState<{ reward: TravellerReward; rosterFull: boolean; tiles: RewardTile[] } | null>(null);
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
  const far = distanceTo(spawn, player, now) > patrolRules.engageMeters;
  const helpProblemShown = problem === 'trader' ? null : problem;
  const reward = helped?.reward ?? null;
  const recruit = reward?.kind === 'recruit' ? reward.offer : null;

  const help = (choice?: 'meal' | 'supply') => {
    const before = useGameStore.getState().save;
    const result = helpTraveller(spawn, player, choice);
    setHelped(result && { ...result, tiles: result.reward.kind === 'loot' ? lootTiles(result.reward.loot, { before }) : [] });
  };
  const hasMeal = kind === 'pilgrim' && mealItems.some((item) => (save.consumables[item.id] ?? 0) > 0);
  const canSupply = kind === 'pilgrim' && supplyHeld(save.consumables) >= supplyPoints;

  return (
    <Overlay onClose={onClose} position="bottom">
      <Sheet variant="wood" emoji={patrolIcons[kind]} title={traveller.name} bodyStyle={styles.content}
      footer={
        <View style={styles.actions}>
          {!reward && !far && kind !== 'trader' && (
            <>
              {kind === 'wounded' && (
                <EmberButton title={t('patrols.help')} compact disabled={helpProblemShown !== null} onPress={() => help()} />
              )}
              {kind === 'pilgrim' && hasMeal && (
                <EmberButton title={t('patrols.giveMeal')} compact disabled={helpProblemShown !== null} onPress={() => help('meal')} />
              )}
              {kind === 'pilgrim' && canSupply && (
                <EmberButton
                  title={t('patrols.giveSupply', { points: supplyPoints })}
                  compact
                  disabled={helpProblemShown !== null}
                  onPress={() => help('supply')}
                />
              )}
            </>
          )}
          <WoodButton title={t('patrols.walkOn')} onPress={onClose} />
        </View>
      }>
        {far ? (
          <>
            <Text style={styles.problem}>{t('patrols.walkCloser', { distance: Math.round(distanceTo(spawn, player, now)) })}</Text>
            <Text style={styles.muted}>{t('places.tooFarToSee')}</Text>
          </>
        ) : (
          <>
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
                      <WoodButton
                        title={t('patrols.trade')}
                        compact
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
              {reward.kind === 'loot' && (
                <View style={styles.rewardRow}>
                  {helped!.tiles.length > 0 ? (
                    <LootGrid tiles={helped!.tiles} reveal />
                  ) : (
                    <Text style={styles.name}>{t('chests.nothing')}</Text>
                  )}
                  {reward.blessing && <Text style={styles.name}> {t('patrols.rewardBlessing')}</Text>}
                </View>
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
                  <SpecialLabel classId={recruit.classId} special={recruit.special} />
                  <View style={styles.actions}>
                    <EmberButton title={t('patrols.accept')} compact onPress={() => { acceptTravellerRecruit(recruit); onClose(); }} />
                    <WoodButton title={t('patrols.decline')} onPress={onClose} />
                  </View>
                </View>
              )}
              {helped?.rosterFull && <Text style={styles.muted}>{t('patrols.rosterFull')}</Text>}
            </View>
          )}
          </>
        )}
      </Sheet>
    </Overlay>
  );
}
const styles = StyleSheet.create({
  rewardRow: { gap: 8 },
  content: { gap: 6, paddingBottom: 12 },
  muted: { color: colors.muted },
  offer: { gap: 4, paddingVertical: 10, borderTopWidth: 2, borderTopColor: colors.parchmentDark },
  recruit: { gap: 4 },
  name: { fontSize: 21 },
  trait: { fontSize: 19 },
  problem: { color: colors.muted, fontStyle: 'italic' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
});
