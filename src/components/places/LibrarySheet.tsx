import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { placeInfo } from '@/content/places';
import { trainPrice, trainProblem, trainXp } from '@/game/places/services';
import { isAway } from '@/game/team/team';
import { t, tr } from '@/i18n';
import { feel } from '@/services/feel';
import { useGameStore } from '@/store/gameStore';
import { fonts, ui } from '@/theme';

import { MapSheet, type MapSheetAction, type MapSheetView } from '../MapSheet';
import { PressScale } from '../motion';
import { formatPrice, Price } from '../Price';
import { Text } from '../Text';
import { PlaceSummary } from './PlaceSummary';
import { someTabs, usePlaceSheet, type PlaceSheetProps } from './usePlaceSheet';
import { blockedText, useShop } from './useShop';

/** The library: training a hero at home is its own work; blueprints and an old ledger are its shop. */
export function LibrarySheet({ place, player, now, onClose }: PlaceSheetProps) {
  const base = usePlaceSheet(place, player, now);
  const shop = useShop(place, base, now);
  const info = placeInfo[place.kind];
  const { save } = base;
  const [heroId, setHeroId] = useState<string | null>(null);
  const home = save.heroes.filter((hero) => !isAway(save, hero.id));
  const price = trainPrice(save);
  const picked = heroId ? home.find((hero) => hero.id === heroId) : undefined;

  const action = (view: MapSheetView): MapSheetAction => {
    if (view.full && view.tab === 'shop') return shop.action(view);
    if (picked) {
      const problem = trainProblem(save, place, picked.id, player, now);
      return {
        state: base.decide(problem),
        verb: t('mapSheet.verbs.train'),
        label: t('placeSheet.trainOne', { name: picked.name, price: formatPrice(price) }),
        blockedLabel: problem ? blockedText(problem) : undefined,
        onPress: () => {
          useGameStore.getState().trainHero(place, picked.id, player);
          feel('reward');
        },
        onWalk: base.onWalk,
      };
    }
    const onTrain = view.full && view.tab === 'train';
    return {
      state: onTrain ? base.decide<'pick'>('pick') : base.decide(home.length > 0 ? null : 'noHeroes'),
      verb: t('mapSheet.verbs.train'),
      label: t('places.train'),
      blockedLabel: onTrain ? t('placeSheet.pickHero') : t('placeSheet.blocked.noHeroes'),
      onPress: () => view.open('train'),
      onWalk: base.onWalk,
    };
  };

  const trainTab = {
    key: 'train',
    label: t('placeSheet.tabs.train'),
    render: () => (
      <View style={styles.list}>
        <Text style={styles.muted}>{t('places.trainHint', { xp: trainXp(save) })}</Text>
        {home.length === 0 && <Text style={styles.muted}>{t('places.noHeroes')}</Text>}
        {home.map((hero) => {
          const on = hero.id === heroId;
          const top = trainProblem(save, place, hero.id, player, now) === 'maxLevel';
          return (
            <PressScale
              key={hero.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: top }}
              disabled={top}
              onPress={() => setHeroId(on ? null : hero.id)}
              style={[styles.row, on && styles.rowOn]}
            >
              <Text style={[styles.name, on && styles.nameOn]}>
                {on ? '▸ ' : ''}
                {hero.name} · {t('common.levelShort', { level: hero.level })}
              </Text>
              {top ? <Text style={styles.muted}>{t('places.maxLevel')}</Text> : <Price amount={price} short={save.gold < price} textStyle={styles.price} />}
            </PressScale>
          );
        })}
      </View>
    ),
  };

  return (
    <MapSheet
      onClose={onClose}
      emoji={info.emoji}
      ring={base.ring}
      title={tr(info.name)}
      status={base.status}
      summary={<PlaceSummary line={t('places.trainHint', { xp: trainXp(save) })} stock={shop.stock} note={base.discoverLine} />}
      action={action}
      tabs={someTabs(trainTab, shop.tab, base.detailsTab())}
      inRange={base.inRange}
    />
  );
}

const styles = StyleSheet.create({
  list: { gap: 6 },
  row: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 10,
    borderWidth: 2,
    borderColor: ui.parchmentRule,
  },
  rowOn: { borderColor: ui.ink, borderLeftWidth: 6, backgroundColor: ui.parchmentShade },
  name: { fontSize: 19, flexShrink: 1 },
  nameOn: { fontFamily: fonts.serifBold },
  price: { fontSize: 19 },
  muted: { color: ui.inkMuted },
});
