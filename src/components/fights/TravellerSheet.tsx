import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { frPatrolTexts } from '@/content/fr/patrols';
import { heroClasses } from '@/content/heroes';
import { materialById } from '@/content/lookup';
import { patrolRules, patrolTexts } from '@/content/patrols';
import { traitById } from '@/content/traits';
import { mealItems, supplyHeld } from '@/game/expeditions/provisions';
import { distanceMeters } from '@/game/generation/geo';
import type { LatLng } from '@/game/generation/types';
import { lootTiles, type RewardTile } from '@/game/loot/tiles';
import { isTravellerKind, patrolPositionAt, type PatrolSpawn } from '@/game/patrols/generate';
import { helpProblem, tradeProblem, traderOffers, travellerOffer, type TravellerReward } from '@/game/patrols/travellers';
import { mainAction } from '@/game/places/mainAction';
import { rolledTrade } from '@/game/supply/trades';
import { localized, t, tr } from '@/i18n';
import { feel } from '@/services/feel';
import { useGameStore } from '@/store/gameStore';
import { colors, ui } from '@/theme';

import { ClassSummary } from '../ClassSummary';
import { LootGrid } from '../LootGrid';
import { MapSheet, mapSheetStatus, type MapSheetAction, type MapSheetSecondary, type MapSheetView } from '../MapSheet';
import { patrolIcons } from '../PatrolMarker';
import { RecruitGrade } from '../RecruitGrade';
import { SpecialLabel } from '../SpecialLabel';
import { Text } from '../Text';
import { TradeLabel } from '../TradeLabel';
import { WoodButton } from '../ui';
import { walkTo } from '../walkLabel';
import { ringTime, walkToward } from './fightBits';

type Props = { spawn: PatrolSpawn; player: LatLng; now: number; onClose: () => void };

/**
 * A traveller on the map sheet template: who they are and what they ask in
 * the peek; helping is the main action (a pilgrim's second way to help sits
 * under it); a trader's trades are a tab. What they give stays a surprise
 * until they're helped, then shows in the sheet.
 */
export function TravellerSheet({ spawn, player, now, onClose }: Props) {
  const save = useGameStore((state) => state.save);
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
  const at = patrolPositionAt(spawn, now);
  const distance = distanceMeters(player, at);
  const range = patrolRules.engageMeters;
  const problem = helpProblem(save, spawn, player, now);
  const reward = helped?.reward ?? null;
  const recruit = reward?.kind === 'recruit' ? reward.offer : null;
  const hasMeal = kind === 'pilgrim' && mealItems.some((item) => (save.consumables[item.id] ?? 0) > 0);
  const canSupply = kind === 'pilgrim' && supplyHeld(save.consumables) >= supplyPoints;

  const help = (choice?: 'meal' | 'supply') => {
    const before = useGameStore.getState().save;
    const result = useGameStore.getState().helpTraveller(spawn, player, choice);
    if (result) feel('reward');
    setHelped(result && { ...result, tiles: result.reward.kind === 'loot' ? lootTiles(result.reward.loot, { before }) : [] });
  };

  const decide = (issue: typeof problem) => mainAction({ player, target: at, range, problem: issue === 'trader' ? null : issue });
  const helpBlocked = (reason: string) => (reason === 'noStock' ? t('travellerSheet.nothingToGive') : t('fightSheet.blocked.gone'));

  let action: MapSheetAction | ((view: MapSheetView) => MapSheetAction);
  let secondary: MapSheetSecondary[] = [];
  if (recruit) {
    action = {
      state: { kind: 'act' },
      verb: '',
      label: t('travellerSheet.accept', { name: recruit.name }),
      onPress: () => {
        useGameStore.getState().acceptTravellerRecruit(recruit);
        onClose();
      },
    };
    secondary = [{ key: 'decline', title: t('patrols.decline'), onPress: onClose }];
  } else if (reward) {
    action = { state: { kind: 'act' }, verb: '', label: t('patrols.walkOn'), onPress: onClose };
  } else if (kind === 'trader') {
    const near = decide(null);
    action = (view) => ({
      // On the trades, the trades' own buttons act: the footer points at them.
      state: near.kind !== 'walk' && view.full && view.tab === 'trades' ? { kind: 'blocked', reason: 'pick' } : near,
      verb: t('mapSheet.verbs.trade'),
      label: t('patrols.trade'),
      blockedLabel: t('travellerSheet.tradeBelow'),
      onPress: () => view.open('trades'),
      onWalk: walkToward(at),
    });
  } else {
    // A pilgrim takes a meal or supply points: the one the player holds leads, the other sits under it.
    const choices: { choice?: 'meal' | 'supply'; label: string }[] =
      kind === 'wounded'
        ? [{ label: t('patrols.help') }]
        : [
            ...(hasMeal ? [{ choice: 'meal' as const, label: t('patrols.giveMeal') }] : []),
            ...(canSupply ? [{ choice: 'supply' as const, label: t('patrols.giveSupply', { points: supplyPoints }) }] : []),
          ];
    const first = choices[0];
    const state = decide(first ? problem : problem === null ? 'noStock' : problem);
    action = {
      state,
      verb: t('mapSheet.verbs.help'),
      label: first?.label ?? t('patrols.help'),
      blockedLabel: state.kind === 'blocked' ? helpBlocked(state.reason) : undefined,
      onPress: () => help(first?.choice),
      onWalk: walkToward(at),
    };
    if (choices[1] && state.kind === 'act') secondary = [{ key: 'other', title: choices[1].label, onPress: () => help(choices[1].choice) }];
  }

  const ask =
    kind === 'trader'
      ? t('patrols.askTrade')
      : kind === 'wounded'
        ? `${t('patrols.askPotion')} ${t('patrols.potionsHeld', { count: offer.kind === 'potion' ? (save.consumables[offer.itemId] ?? 0) : 0 })}`
        : `${t('patrols.askMeal', { points: supplyPoints })} ${t('patrols.provisionsHeld', {
            meals: mealItems.reduce((sum, item) => sum + (save.consumables[item.id] ?? 0), 0),
            points: supplyHeld(save.consumables),
          })}`;

  return (
    <MapSheet
      onClose={onClose}
      emoji={patrolIcons[kind]}
      ring={{ kind: 'time', ...ringTime(spawn.startsAt, spawn.endsAt, now) }}
      title={traveller.name}
      status={mapSheetStatus({ distance, range, expiresAt: spawn.endsAt, now })}
      summary={
        <View style={styles.summary}>
          <Text style={styles.line}>{traveller.line}</Text>
          {!reward && <Text style={styles.muted}>{ask}</Text>}
          {reward?.kind === 'loot' &&
            (helped!.tiles.length > 0 ? <LootGrid tiles={helped!.tiles} reveal /> : <Text style={styles.line}>{t('chests.nothing')}</Text>)}
          {reward?.kind === 'loot' && reward.blessing && <Text style={styles.line}>{t('patrols.rewardBlessing')}</Text>}
          {recruit && (
            <View style={styles.recruit}>
              <Text style={styles.line}>{t('patrols.recruitOffer', { name: recruit.name })}</Text>
              <Text style={styles.muted}>
                {t('tavern.offer', { name: recruit.name, className: tr(heroClasses[recruit.classId].name), level: recruit.level })}
              </Text>
              <ClassSummary classId={recruit.classId} />
              <RecruitGrade grade={recruit.grade} roll={recruit.roll} />
              <Text style={[styles.trait, { color: traitById[recruit.trait].positive ? colors.ink : colors.danger }]}>
                {tr(traitById[recruit.trait].name)}: {tr(traitById[recruit.trait].description)}
              </Text>
              <TradeLabel trade={rolledTrade(recruit.id)} />
              <SpecialLabel classId={recruit.classId} special={recruit.special} />
            </View>
          )}
          {helped?.rosterFull && <Text style={styles.muted}>{t('patrols.rosterFull')}</Text>}
        </View>
      }
      action={action}
      secondary={secondary}
      tabs={
        kind === 'trader'
          ? [
              {
                key: 'trades',
                label: t('travellerSheet.trades'),
                render: () => (
                  <View style={styles.list}>
                    {traderOffers(spawn, save).map((trade) => {
                      const issue = tradeProblem(save, spawn, trade.index, player, now);
                      return (
                        <View key={trade.index} style={styles.trade}>
                          <Text style={styles.line}>
                            {trade.give.amount} {tr(materialById[trade.give.materialId]?.name ?? trade.give.materialId)} → {trade.get.amount}{' '}
                            {tr(materialById[trade.get.materialId]?.name ?? trade.get.materialId)}
                          </Text>
                          <Text style={styles.muted}>
                            {t('patrols.held', { count: save.materials[trade.give.materialId] ?? 0 })} · {t('patrols.usesLeft', { count: trade.usesLeft })}
                          </Text>
                          <WoodButton
                            compact
                            title={
                              issue === 'tooFar'
                                ? walkTo(distance, 'trade')
                                : issue === 'usedUp'
                                  ? t('travellerSheet.usedUp')
                                  : issue === 'noMaterials'
                                    ? t('travellerSheet.noMaterials')
                                    : issue === 'gone'
                                      ? t('fightSheet.blocked.gone')
                                      : t('patrols.trade')
                            }
                            disabled={issue !== null}
                            onPress={() => {
                              useGameStore.getState().tradeWithTrader(spawn, trade.index, player);
                              feel('reward');
                            }}
                          />
                        </View>
                      );
                    })}
                  </View>
                ),
              },
            ]
          : undefined
      }
      inRange={distance <= range}
    />
  );
}

const styles = StyleSheet.create({
  summary: { gap: 6 },
  line: { fontSize: 19, color: ui.ink },
  muted: { color: ui.inkMuted },
  recruit: { gap: 4 },
  trait: { fontSize: 17 },
  list: { gap: 6 },
  trade: { gap: 4, paddingVertical: 8, borderTopWidth: 2, borderTopColor: ui.parchmentShade },
});
