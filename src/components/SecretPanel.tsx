import { useEffect, useState } from 'react';
import { rosterRules } from '@/content/roster';
import { Pressable, StyleSheet, View } from 'react-native';

import { heroClasses } from '@/content/heroes';
import { componentById, gearName, itemById } from '@/content/lookup';
import { placeInfo } from '@/content/places';
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
import { isExhausted } from '@/game/team/health';
import { isAway } from '@/game/team/team';
import { formatDistance, formatDuration, formatPercent, t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors, pixel } from '@/theme';

import { Button } from './Button';
import { ClassSummary } from './ClassSummary';
import { EnemyTags } from './EnemyTags';
import { PriceTag } from './PriceTag';
import { GameIcon } from './GameIcon';
import { Overlay } from './Overlay';
import { Sheet } from './Sheet';
import { RecruitGrade } from './RecruitGrade';
import { SendDialog } from './SendDialog';
import { Text } from './Text';
import { ThreatChip } from './ThreatChip';

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

const marketLineName = (line: MarketLine) =>
  line.kind === 'component'
    ? `${componentById[line.id].emoji} ${tr(componentById[line.id].name)}`
    : `${itemById[line.id].emoji} ${gearName(line.gear!)}`;

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
  const entered = isEntered(save, place);
  const underwater = place.kind === 'underwaterDungeon';
  const candidates = save.heroes.filter((hero) => !isAway(save, hero.id) && !isExhausted(hero, now));
  const [heroIds, setHeroIds] = useState<string[]>(() => candidates.slice(0, rosterRules.partySize).map((hero) => hero.id));
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

  const toggle = (heroId: string) =>
    setHeroIds((ids) => (ids.includes(heroId) ? ids.filter((id) => id !== heroId) : ids.length < rosterRules.partySize ? [...ids, heroId] : ids));

  const underwaterBody = () => {
    const dungeon = underwaterDungeonFor(save);
    const briefing = underwaterBriefing(save, place);
    const problem = underwaterLaunchProblem(save, place, player, now);
    return (
      <>
        <Text style={styles.subtitle}>
          {dungeon.emoji} {tr(dungeon.name)} · {t('expeditions.tier', { tier: dungeon.tier })} · ⏳ {formatDuration(dungeon.durationMinutes * 60_000)}
        </Text>
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
        <Text style={styles.subtitle}>{t('sanctum.heroes')}</Text>
        <View style={styles.chips}>
          {candidates.map((hero) => (
            <Pressable key={hero.id} onPress={() => toggle(hero.id)} style={[styles.chip, heroIds.includes(hero.id) && styles.chipActive]}>
              <GameIcon emoji={heroClasses[hero.classId].emoji} size={20} />
              <Text>{hero.name}</Text>
            </Pressable>
          ))}
        </View>
        {problem && problem !== 'noKey' && <Text style={styles.problem}>{problemText(problem, distance, rosterCap(save))}</Text>}
        <Button title={t('secrets.launch')} disabled={problem !== null || heroIds.length === 0} onPress={() => setConfirming(true)} />
        {confirming && (
          <SendDialog
            save={save}
            dungeon={dungeon}
            party={heroIds}
            now={now}
            durationScale={1}
            briefing={briefing}
            onClose={() => setConfirming(false)}
            onSwap={(out, into) => setHeroIds(heroIds.map((id) => (id === out ? into : id)))}
            onConfirm={(loadout) => {
              setConfirming(false);
              launch(place, heroIds, player, loadout);
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
          <Button title={t('secrets.enter')} disabled={problem !== null} onPress={() => enter(place, player)} />
        </>
      );
    }
    const recruitProblem = secretRecruitProblem(save, place, player, now);
    const trait = offer ? traitById[offer.trait] : null;
    return (
      <>
        {offer && trait && (
          <View style={styles.offer}>
            <Text style={styles.name}>
              {heroClasses[offer.classId].emoji}{' '}
              {t('tavern.offer', { name: offer.name, className: tr(heroClasses[offer.classId].name), level: offer.level })}
            </Text>
            <RecruitGrade grade={offer.grade} roll={offer.roll} />
            <Text style={[styles.trait, { color: trait.positive ? colors.ink : colors.danger }]}>
              {tr(trait.name)}: {tr(trait.description)}
            </Text>
            <ClassSummary classId={offer.classId} />
            <View style={styles.actions}>
              <PriceTag price={offer.price} style={styles.price} />
              <Button title={t('tavern.recruit')} disabled={recruitProblem !== null} onPress={() => recruit(place, player)} />
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
                  <Text style={styles.name}>{marketLineName(line)}</Text>
                  <View style={styles.actions}>
                    <PriceTag price={line.price} style={styles.price} />
                    {problem === 'soldOut' && <Text style={styles.muted}>{t('places.soldOut')}</Text>}
                    <Button title={t('tavern.buy')} disabled={problem !== null} onPress={() => buy(place, line.key, player)} />
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
      <Sheet title={`${info.emoji} ${tr(info.name)}`} bodyStyle={styles.content} footer={<Button title={t('common.close')} color={colors.muted} onPress={onClose} />}>
        {keyLine}
        <Text style={styles.muted}>{tr(info.description)}</Text>
        <Text style={styles.muted}>
          {t('secrets.where', { distance: formatDistance(distance), time: formatDuration(place.expiresAt - now) })}
          {' · '}
          {t('places.gold', { gold: save.gold })}
        </Text>
        {underwater ? underwaterBody() : offerBody()}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: pixel.outline, borderColor: colors.woodDark, paddingHorizontal: 10, paddingVertical: 6 },
  chipActive: { borderColor: colors.ink, backgroundColor: colors.highlight },
  problem: { color: colors.muted, fontStyle: 'italic' },
});
