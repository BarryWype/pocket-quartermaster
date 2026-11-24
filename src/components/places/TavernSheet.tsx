import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { familyById } from '@/content/families';
import { heroClasses } from '@/content/heroes';
import { tavernRules } from '@/content/taverns';
import { traitById } from '@/content/traits';
import type { LatLng } from '@/game/generation/types';
import { rosterCap } from '@/game/guild/guild';
import { rolledTrade } from '@/game/supply/trades';
import { buySupplyProblem, recruitProblem, supplyPrice, tavernOffers, type RecruitOffer, type TavernSpawn } from '@/game/taverns/taverns';
import { t, tr } from '@/i18n';
import { feel } from '@/services/feel';
import { useGameStore } from '@/store/gameStore';
import { colors, fonts, ui } from '@/theme';

import { ClassSummary } from '../ClassSummary';
import { IconLabel } from '../IconLabel';
import { MapSheet, type MapSheetAction, type MapSheetView } from '../MapSheet';
import { PressScale } from '../motion';
import { formatPrice, Price } from '../Price';
import { RecruitGrade } from '../RecruitGrade';
import { SpecialLabel } from '../SpecialLabel';
import { Text } from '../Text';
import { TradeLabel } from '../TradeLabel';
import { ItemSlot, WoodButton } from '../ui';
import { walkTo } from '../walkLabel';
import { someTabs, usePlaceSheet } from './usePlaceSheet';
import { useShop } from './useShop';

type Props = { tavern: TavernSpawn; player: LatLng; now: number; onClose: () => void };

/** A recruit problem in the main button's own words. */
const recruitBlocked = (problem: string) =>
  problem === 'locked'
    ? t('placeSheet.blocked.locked')
    : problem === 'taken'
      ? t('placeSheet.blocked.taken')
      : problem === 'rosterFull'
        ? t('placeSheet.blocked.rosterFull')
        : t('placeSheet.blocked.gold');

/**
 * A tavern on the map sheet template: today's recruits (pick one, recruit it
 * from the footer), its shop with the emergency supply, its order, Details.
 */
export function TavernSheet({ tavern, player, now, onClose }: Props) {
  // Today's offers and the shelf are read once, when the sheet opens, as before; the header follows the clock.
  const [openedAt] = useState(() => Date.now());
  const base = usePlaceSheet(tavern, player, now, tavernRules.interactionMeters);
  const { save } = base;
  const offers = tavernOffers(save, tavern.id, openedAt);
  const seeClasses = useGameStore((state) => state.seeClasses);
  const offeredClasses = offers.map((o) => o.classId).join(',');
  useEffect(() => seeClasses(offeredClasses.split(',') as RecruitOffer['classId'][]), [offeredClasses, seeClasses]);
  const [offerId, setOfferId] = useState<string | null>(null);
  const picked = offers.find((offer) => offer.id === offerId);

  const supplyProblem = buySupplyProblem(save, 1, tavern.position, player);
  const supply = () => (
    <View style={styles.supply}>
      <IconLabel emoji="🥓" label={t('tavern.emergency')} labelStyle={styles.name} />
      <Text style={styles.muted}>{t('tavern.emergencyHint', { held: save.consumables.jerky ?? 0 })}</Text>
      <View style={styles.actions}>
        <Price amount={supplyPrice(save)} short={save.gold < supplyPrice(save)} textStyle={styles.price} />
        <WoodButton
          title={supplyProblem === 'tooFar' ? walkTo(base.distance, 'buy') : supplyProblem ? recruitBlocked(supplyProblem) : t('tavern.buy')}
          compact
          disabled={supplyProblem !== null}
          onPress={() => {
            useGameStore.getState().buySupply(1, tavern.position, player);
            feel('reward');
          }}
        />
      </View>
    </View>
  );
  const shop = useShop(tavern, base, openedAt, { label: t('placeSheet.tabs.buy'), top: supply });

  const action = (view: MapSheetView): MapSheetAction => {
    if (view.full && view.tab === 'shop') return shop.action(view);
    if (picked) {
      const problem = recruitProblem(save, picked, tavern.position, player);
      return {
        state: base.decide(problem),
        verb: t('mapSheet.verbs.recruit'),
        label: t('placeSheet.recruitOne', { name: picked.name, price: formatPrice(picked.price) }),
        blockedLabel: problem ? recruitBlocked(problem) : undefined,
        onPress: () => {
          useGameStore.getState().recruit(picked, tavern.position, player);
          feel('reward');
          setOfferId(null);
        },
        onWalk: base.onWalk,
      };
    }
    const onRecruits = view.full && view.tab === 'recruits';
    return {
      state: onRecruits ? base.decide<'pick'>('pick') : base.decide(null),
      verb: t('mapSheet.verbs.recruit'),
      label: t('tavern.recruit'),
      blockedLabel: t('placeSheet.pickRecruit'),
      onPress: () => view.open('recruits'),
      onWalk: base.onWalk,
    };
  };

  const offerCard = (offer: RecruitOffer) => {
    const heroClass = heroClasses[offer.classId];
    const trait = traitById[offer.trait];
    const on = offer.id === offerId;
    return (
      <PressScale
        key={offer.id}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        accessibilityLabel={t('tavern.offer', { name: offer.name, className: tr(heroClass.name), level: offer.level })}
        onPress={() => setOfferId(on ? null : offer.id)}
        style={[styles.offer, on && styles.offerOn]}
      >
        <View style={styles.offerHead}>
          <IconLabel
            emoji={heroClass.emoji}
            icon={heroClass.icon}
            label={`${on ? '▸ ' : ''}${t('tavern.offer', { name: offer.name, className: tr(heroClass.name), level: offer.level })}`}
            labelStyle={[styles.name, on && styles.nameOn]}
          />
          <Price amount={offer.price} short={save.gold < offer.price} textStyle={styles.price} />
        </View>
        <RecruitGrade grade={offer.grade} roll={offer.roll} />
        <Text style={[styles.trait, { color: trait.positive ? colors.ink : colors.danger }]}>
          {tr(trait.name)}: {tr(trait.description)}
        </Text>
        <TradeLabel trade={rolledTrade(offer.id)} />
        <SpecialLabel classId={offer.classId} special={offer.special} />
        <ClassSummary classId={offer.classId} />
      </PressScale>
    );
  };

  const wanted = offers[0]?.wanted ? familyById[offers[0].wanted] : undefined;

  return (
    <MapSheet
      onClose={onClose}
      emoji="🍺"
      ring={base.ring}
      title={tavern.name}
      status={base.status}
      summary={
        <View style={styles.summary}>
          <Text style={styles.line}>{t('placeSheet.tavernLine', { count: offers.length, roster: save.heroes.length, cap: rosterCap(save) })}</Text>
          <View style={styles.classes}>
            {offers.map((offer) => (
              <ItemSlot
                key={offer.id}
                state="ready"
                size={30}
                emoji={heroClasses[offer.classId].emoji}
                icon={heroClasses[offer.classId].icon}
                accessibilityLabel={tr(heroClasses[offer.classId].name)}
              />
            ))}
          </View>
          {wanted && <IconLabel emoji={wanted.emoji} icon={wanted.icon} label={t('tavern.wanted', { family: tr(wanted.name) })} labelStyle={styles.muted} />}
          {base.discoverLine}
        </View>
      }
      action={action}
      secondary={base.deliver}
      tabs={someTabs(
        { key: 'recruits', label: t('placeSheet.tabs.recruits'), render: () => <View style={styles.list}>{offers.map(offerCard)}</View> },
        shop.tab,
        base.orderTab,
        base.detailsTab(),
      )}
      inRange={base.inRange}
    />
  );
}

const styles = StyleSheet.create({
  summary: { gap: 6 },
  line: { fontSize: 19, color: ui.ink },
  classes: { flexDirection: 'row', gap: 4 },
  list: { gap: 8 },
  offer: { gap: 4, padding: 10, borderWidth: 2, borderColor: ui.parchmentRule },
  offerOn: { borderColor: ui.ink, borderLeftWidth: 6, backgroundColor: ui.parchmentShade },
  offerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { fontSize: 19 },
  nameOn: { fontFamily: fonts.serifBold },
  trait: { fontSize: 17 },
  price: { fontSize: 19 },
  muted: { color: ui.inkMuted },
  supply: { gap: 4, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: ui.parchmentShade },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
