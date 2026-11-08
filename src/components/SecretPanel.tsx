import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { heroClasses } from '@/content/heroes';
import { gearName, itemById } from '@/content/lookup';
import { placeInfo, placeRules } from '@/content/places';
import { secretRules } from '@/content/secrets';
import { traitById } from '@/content/traits';
import { dungeonFoes } from '@/game/enemies/tags';
import { distanceMeters } from '@/game/generation/geo';
import type { LatLng } from '@/game/generation/types';
import { rosterCap } from '@/game/guild/guild';
import type { PlaceSpawn } from '@/game/places/generate';
import { underwaterBriefing, underwaterDungeonFor, underwaterLaunchProblem } from '@/game/secrets/dungeon';
import { hasKey, keyDots, keysHeld } from '@/game/secrets/keys';
import {
  blackMarketGoods,
  enterProblem,
  isEntered,
  marketBuyProblem,
  secretRecruit,
  secretRecruitProblem,
  type MarketLine,
  type SecretProblem,
} from '@/game/secrets/places';
import { formatDistance, formatDuration, formatPercent, t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

import { ClassSummary } from './ClassSummary';
import { EnemyTags } from './EnemyTags';
import { Price } from './Price';
import { Overlay } from './Overlay';
import { Sheet } from './Sheet';
import { EmberButton, WoodButton } from './ui';
import { RecruitGrade } from './RecruitGrade';
import { ExpeditionDialog } from './ExpeditionDialog';
import { SpecialLabel } from './SpecialLabel';
import { Text } from './Text';
import { ThreatChip } from './ThreatChip';
import { IconLabel, PartsLine, type LabelPart } from './IconLabel';
import { recallWorkingHeroes } from './workingHeroes';

const problemText = (problem: SecretProblem, distance: number, cap: number): string => {
  switch (problem) {
    case 'tooFar':
      return t('places.walkCloser', { distance: Math.round(distance) });
    case 'noKey':
      return t('secrets.vaultLocked');
    case 'notEntered':
      return t('secrets.notEntered');
    case 'taken':
      return t('secrets.taken');
    case 'rosterFull':
      return t('tavern.rosterFull', { cap });
    case 'gold':
      return t('tavern.gold');
    case 'soldOut':
      return t('places.soldOut');
    case 'gone':
      return t('secrets.gone');
  }
};

const marketLineParts = (line: MarketLine): LabelPart[] => [{ emoji: itemById[line.id].emoji, text: gearName(line.gear) }];

type Props = { place: PlaceSpawn; player: LatLng; now: number; onClose: () => void };

/** A tipped secret place: what it takes to get in first, then the den's or black market's offer, or the underwater dungeon's launch. */
export function SecretPanel({ place, player, now, onClose }: Props) {
  const save = useGameStore((state) => state.save);
  const enter = useGameStore((state) => state.enterSecret);
  const recruit = useGameStore((state) => state.recruitAtSecret);
  const buy = useGameStore((state) => state.buyAtBlackMarket);
  const launch = useGameStore((state) => state.launchUnderwater);
  const seeClasses = useGameStore((state) => state.seeClasses);
  const info = placeInfo[place.kind];
  const distance = distanceMeters(player, place.position);
  const far = distance > placeRules.interactionMeters;
  const entered = isEntered(save, place);
  const underwater = place.kind === 'underwaterDungeon';
  const [confirming, setConfirming] = useState(false);
  const offer = !underwater && entered ? secretRecruit(save, place) : null;
  const offeredClass = offer?.classId;
  useEffect(() => {
    if (offeredClass) seeClasses([offeredClass]);
  }, [offeredClass, seeClasses]);

  const keyLine = entered ? (
    <Text style={styles.open}>{t('secrets.entered')}</Text>
  ) : hasKey(save) ? (
    <Text style={styles.open}>{t('secrets.haveKey', { count: keysHeld(save) })}</Text>
  ) : (
    <Text style={styles.locked}>{t('secrets.noKey', { dots: keyDots(save) })}</Text>
  );

  const underwaterBody = () => {
    const dungeon = underwaterDungeonFor(save);
    const briefing = underwaterBriefing(save, place);
    const problem = underwaterLaunchProblem(save, place, player, now);
    return (
      <>
        <PartsLine
          parts={[
            { emoji: dungeon.emoji, text: tr(dungeon.name) },
            t('expeditions.tier', { tier: dungeon.tier }),
            { emoji: '⏳', text: formatDuration(dungeon.durationMinutes * 60_000) },
          ]}
          labelStyle={styles.subtitle}
        />
        {briefing.threats.map((threat) => (
          <ThreatChip key={threat.id} threat={threat} />
        ))}
        <Text style={styles.muted}>
          {t('secrets.prize', {
            relic: formatPercent(secretRules.prize.relicChance),
            legendary: formatPercent(secretRules.prize.legendaryChance),
          })}
        </Text>
        <Text style={styles.subtitle}>{t('expeditions.foes')}</Text>
        {dungeonFoes(dungeon).map((mob) => (
          <EnemyTags key={mob.id} mob={mob} />
        ))}
        {problem && problem !== 'noKey' && <Text style={styles.problem}>{problemText(problem, distance, rosterCap(save))}</Text>}
        <WoodButton title={t('secrets.launch')} compact disabled={problem !== null} onPress={() => setConfirming(true)} />
        {confirming && (
          <ExpeditionDialog
            dungeon={dungeon}
            now={now}
            durationScale={1}
            briefing={briefing}
            onClose={() => setConfirming(false)}
            onSend={(party, loadout) => {
              setConfirming(false);
              // The pure launch rule refuses working heroes: recall them first, in the same tap.
              recallWorkingHeroes(party);
              launch(place, party, player, loadout);
              onClose();
            }}
          />
        )}
      </>
    );
  };

  const offerBody = () => {
    if (!entered) {
      const problem = enterProblem(save, place, player, now);
      return (
        <>
          {problem && problem !== 'noKey' && <Text style={styles.problem}>{problemText(problem, distance, rosterCap(save))}</Text>}
          <WoodButton title={t('secrets.enter')} compact disabled={problem !== null} onPress={() => enter(place, player)} />
        </>
      );
    }
    const recruitProblem = secretRecruitProblem(save, place, player, now);
    const trait = offer ? traitById[offer.trait] : null;
    return (
      <>
        {offer && trait && (
          <View style={styles.offer}>
            <IconLabel
              emoji={heroClasses[offer.classId].emoji} icon={heroClasses[offer.classId].icon}
              label={t('tavern.offer', { name: offer.name, className: tr(heroClasses[offer.classId].name), level: offer.level })}
              labelStyle={styles.name}
            />
            <RecruitGrade grade={offer.grade} roll={offer.roll} />
            <Text style={[styles.trait, { color: trait.positive ? colors.ink : colors.danger }]}>
              {tr(trait.name)}: {tr(trait.description)}
            </Text>
            <SpecialLabel classId={offer.classId} special={offer.special} />
            <ClassSummary classId={offer.classId} />
            <View style={styles.actions}>
              <Price amount={offer.price} short={save.gold < offer.price} textStyle={styles.price} />
              <EmberButton title={t('tavern.recruit')} compact disabled={recruitProblem !== null} onPress={() => recruit(place, player)} />
            </View>
            {recruitProblem && <Text style={styles.problem}>{problemText(recruitProblem, distance, rosterCap(save))}</Text>}
          </View>
        )}
        {place.kind === 'blackMarket' && (
          <>
            <Text style={styles.subtitle}>{t('secrets.goods')}</Text>
            {blackMarketGoods(save, place).map((line) => {
              const problem = marketBuyProblem(save, place, line.key, player, now);
              return (
                <View key={line.key} style={styles.offer}>
                  <PartsLine parts={marketLineParts(line)} labelStyle={styles.name} />
                  <View style={styles.actions}>
                    <Price amount={line.price} short={save.gold < line.price} textStyle={styles.price} />
                    {problem === 'soldOut' && <Text style={styles.muted}>{t('places.soldOut')}</Text>}
                    <WoodButton title={t('tavern.buy')} compact disabled={problem !== null} onPress={() => buy(place, line.key, player)} />
                  </View>
                </View>
              );
            })}
          </>
        )}
      </>
    );
  };

  return (
    <Overlay onClose={onClose} position="bottom">
      <Sheet variant="wood" emoji={info.emoji} title={tr(info.name)} bodyStyle={styles.content} footer={<WoodButton title={t('common.close')} onPress={onClose} />}>
        {far ? (
          <>
            {keyLine}
            <Text style={styles.problem}>{t('places.walkCloser', { distance: Math.round(distance) })}</Text>
            <Text style={styles.muted}>{t('places.tooFarToSee')}</Text>
          </>
        ) : (
          <>
          {keyLine}
          <Text style={styles.muted}>{tr(info.description)}</Text>
          <View style={styles.goldRow}>
            <Text style={styles.muted}>
              {t('secrets.where', { distance: formatDistance(distance), time: formatDuration(place.expiresAt - now) })}
              {' · '}
              {t('places.gold')}
            </Text>
            <Price amount={save.gold} textStyle={styles.muted} />
          </View>
          {underwater ? underwaterBody() : offerBody()}
          </>
        )}
      </Sheet>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  content: { gap: 6, paddingBottom: 12 },
  subtitle: { fontSize: 21, marginTop: 8 },
  muted: { color: colors.muted },
  open: { fontSize: 19, color: colors.success },
  locked: { fontSize: 19, color: colors.danger },
  offer: { gap: 4, paddingVertical: 10, borderTopWidth: 2, borderTopColor: colors.parchmentDark },
  name: { fontSize: 21 },
  trait: { fontSize: 19 },
  price: { fontSize: 21 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  goldRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  problem: { color: colors.muted, fontStyle: 'italic' },
});
