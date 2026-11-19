import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { heroClasses } from '@/content/heroes';
import { itemById, gearName } from '@/content/lookup';
import { placeInfo } from '@/content/places';
import { secretRules } from '@/content/secrets';
import { traitById } from '@/content/traits';
import { dungeonFoes } from '@/game/enemies/tags';
import { underwaterBriefing, underwaterDungeonFor, underwaterLaunchProblem } from '@/game/secrets/dungeon';
import { hasKey, keyDots, keysHeld } from '@/game/secrets/keys';
import { blackMarketGoods, enterProblem, isEntered, marketBuyProblem, secretRecruit, secretRecruitProblem } from '@/game/secrets/places';
import { formatDuration, formatPercent, t, tr } from '@/i18n';
import { feel } from '@/services/feel';
import { useGameStore } from '@/store/gameStore';
import { colors, ui } from '@/theme';

import { ClassSummary } from '../ClassSummary';
import { ExpeditionDialog } from '../ExpeditionDialog';
import { IconLabel, PartsLine } from '../IconLabel';
import { MapSheet, type MapSheetAction, type MapSheetTab, type MapSheetView } from '../MapSheet';
import { formatPrice, Price } from '../Price';
import { RecruitGrade } from '../RecruitGrade';
import { SpecialLabel } from '../SpecialLabel';
import { Text } from '../Text';
import { WoodButton } from '../ui';
import { walkTo } from '../walkLabel';
import { recallWorkingHeroes } from '../workingHeroes';
import { FoeList } from '../fights/FoeList';
import { ThreatChip } from '../ThreatChip';
import { usePlaceSheet, type PlaceSheetProps } from './usePlaceSheet';

/** A secret place's problem in the main button's own words. */
const secretBlocked = (problem: string) =>
  problem === 'noKey'
    ? t('secretSheet.needsKey')
    : problem === 'taken'
      ? t('placeSheet.blocked.taken')
      : problem === 'rosterFull'
        ? t('placeSheet.blocked.rosterFull')
        : problem === 'gold'
          ? t('placeSheet.blocked.gold')
          : problem === 'soldOut'
            ? t('placeSheet.blocked.soldOut')
            : t('placeSheet.blocked.gone');

/**
 * A tipped secret place on the map sheet template. Not entered: the key and
 * Enter. A hidden den or black market once entered: its recruit from the
 * footer, the black market's goods in their tab. The underwater dungeon:
 * Dive in, with its foes and threats.
 */
export function SecretSheet({ place, player, now, onClose }: PlaceSheetProps) {
  const base = usePlaceSheet(place, player, now);
  const { save } = base;
  const info = placeInfo[place.kind];
  const underwater = place.kind === 'underwaterDungeon';
  const entered = isEntered(save, place);
  const [confirming, setConfirming] = useState(false);
  const offer = !underwater && entered ? secretRecruit(save, place) : null;
  const seeClasses = useGameStore((state) => state.seeClasses);
  const offeredClass = offer?.classId;
  useEffect(() => {
    if (offeredClass) seeClasses([offeredClass]);
  }, [offeredClass, seeClasses]);

  const keyLine = entered ? (
    <IconLabel emoji="🔓" label={t('secretSheet.entered')} labelStyle={styles.open} />
  ) : hasKey(save) ? (
    <IconLabel emoji="🗝️" label={t('secretSheet.haveKey', { count: keysHeld(save) })} labelStyle={styles.open} />
  ) : (
    <IconLabel emoji="🔒" label={t('secretSheet.noKey', { dots: keyDots(save) })} labelStyle={styles.locked} />
  );

  const tabs: MapSheetTab[] = [];
  let action: MapSheetAction | ((view: MapSheetView) => MapSheetAction);

  if (underwater) {
    const dungeon = underwaterDungeonFor(save);
    const briefing = underwaterBriefing(save, place);
    const problem = underwaterLaunchProblem(save, place, player, now);
    const state = base.decide(problem);
    action = {
      state,
      verb: t('mapSheet.verbs.dive'),
      label: t('secrets.launch'),
      blockedLabel: state.kind === 'blocked' ? secretBlocked(state.reason) : undefined,
      onPress: () => setConfirming(true),
      onWalk: base.onWalk,
    };
    tabs.push({
      key: 'foes',
      label: t('expeditions.foes'),
      render: () => (
        <FoeList foes={dungeonFoes(dungeon)}>
          <View style={styles.row}>
            {briefing.threats.map((threat) => (
              <ThreatChip key={threat.id} threat={threat} />
            ))}
          </View>
          <Text style={styles.muted}>
            {t('secrets.prize', { relic: formatPercent(secretRules.prize.relicChance), legendary: formatPercent(secretRules.prize.legendaryChance) })}
          </Text>
        </FoeList>
      ),
    });
    tabs.push(
      base.detailsTab(
        <PartsLine
          parts={[
            { emoji: dungeon.emoji, text: tr(dungeon.name) },
            t('expeditions.tier', { tier: dungeon.tier }),
            { emoji: '⏳', text: formatDuration(dungeon.durationMinutes * 60_000) },
          ]}
          labelStyle={styles.muted}
        />,
      ),
    );
  } else if (!entered) {
    const problem = enterProblem(save, place, player, now);
    const state = base.decide(problem);
    action = {
      state,
      verb: t('mapSheet.verbs.enter'),
      label: t('secrets.enter'),
      blockedLabel: state.kind === 'blocked' ? secretBlocked(state.reason) : undefined,
      onPress: () => {
        useGameStore.getState().enterSecret(place, player);
        feel('reward');
      },
      onWalk: base.onWalk,
    };
    tabs.push(base.detailsTab());
  } else {
    const recruitProblem = secretRecruitProblem(save, place, player, now);
    action = (view) => {
      if (offer && !(view.full && view.tab === 'goods')) {
        const state = base.decide(recruitProblem);
        return {
          state,
          verb: t('mapSheet.verbs.recruit'),
          label: t('placeSheet.recruitOne', { name: offer.name, price: formatPrice(offer.price) }),
          blockedLabel: state.kind === 'blocked' ? secretBlocked(state.reason) : undefined,
          onPress: () => {
            useGameStore.getState().recruitAtSecret(place, player);
            feel('reward');
          },
          onWalk: base.onWalk,
        };
      }
      // Nothing left to recruit: the black market's goods are what remains.
      const onGoods = view.full && view.tab === 'goods';
      return {
        state: onGoods || place.kind !== 'blackMarket' ? base.decide<'pick'>('pick') : base.decide(null),
        verb: t('mapSheet.verbs.buy'),
        label: t('secrets.goods'),
        blockedLabel: place.kind === 'blackMarket' ? t('secretSheet.buyBelow') : t('placeSheet.blocked.taken'),
        onPress: () => view.open('goods'),
        onWalk: base.onWalk,
      };
    };
    if (offer) {
      const trait = traitById[offer.trait];
      tabs.push({
        key: 'recruit',
        label: t('placeSheet.tabs.recruits'),
        render: () => (
          <View style={styles.list}>
            <IconLabel
              emoji={heroClasses[offer.classId].emoji}
              icon={heroClasses[offer.classId].icon}
              label={t('tavern.offer', { name: offer.name, className: tr(heroClasses[offer.classId].name), level: offer.level })}
              labelStyle={styles.name}
            />
            <Price amount={offer.price} short={save.gold < offer.price} textStyle={styles.name} />
            <RecruitGrade grade={offer.grade} roll={offer.roll} />
            <Text style={[styles.trait, { color: trait.positive ? colors.ink : colors.danger }]}>
              {tr(trait.name)}: {tr(trait.description)}
            </Text>
            <SpecialLabel classId={offer.classId} special={offer.special} />
            <ClassSummary classId={offer.classId} />
          </View>
        ),
      });
    }
    if (place.kind === 'blackMarket') {
      tabs.push({
        key: 'goods',
        label: t('secrets.goods'),
        render: () => (
          <View style={styles.list}>
            {blackMarketGoods(save, place).map((line) => {
              const problem = marketBuyProblem(save, place, line.key, player, now);
              return (
                <View key={line.key} style={styles.good}>
                  <IconLabel emoji={itemById[line.id].emoji} label={gearName(line.gear)} labelStyle={styles.name} />
                  <View style={styles.actions}>
                    <Price amount={line.price} short={save.gold < line.price} textStyle={styles.name} />
                    <WoodButton
                      compact
                      title={problem === 'tooFar' ? walkTo(base.distance, 'buy') : problem ? secretBlocked(problem) : t('tavern.buy')}
                      disabled={problem !== null}
                      onPress={() => {
                        useGameStore.getState().buyAtBlackMarket(place, line.key, player);
                        feel('reward');
                      }}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        ),
      });
    }
    tabs.push(base.detailsTab());
  }

  return (
    <>
      <MapSheet
        onClose={onClose}
        emoji={info.emoji}
        ring={base.ring}
        title={tr(info.name)}
        status={base.status}
        summary={
          <View style={styles.summary}>
            <Text style={styles.line}>{tr(info.description)}</Text>
            {keyLine}
          </View>
        }
        action={action}
        tabs={tabs}
        inRange={base.inRange}
      />
      {confirming && underwater && (
        <ExpeditionDialog
          dungeon={underwaterDungeonFor(save)}
          now={now}
          durationScale={1}
          briefing={underwaterBriefing(save, place)}
          onClose={() => setConfirming(false)}
          onSend={(party, loadout) => {
            setConfirming(false);
            // The pure launch rule refuses working heroes: recall them first, in the same tap.
            recallWorkingHeroes(party);
            useGameStore.getState().launchUnderwater(place, party, player, loadout);
            onClose();
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  summary: { gap: 6 },
  line: { fontSize: 19, color: ui.ink },
  open: { fontSize: 17, color: colors.success },
  locked: { fontSize: 17, color: colors.danger },
  list: { gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  good: { gap: 4, paddingVertical: 8, borderTopWidth: 2, borderTopColor: ui.parchmentShade },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontSize: 19 },
  trait: { fontSize: 17 },
  muted: { color: ui.inkMuted },
});
