import { StyleSheet, View } from 'react-native';

import type { LatLng } from '@/game/generation/types';
import type { PlaceSpawn } from '@/game/places/generate';
import { apothecaryCarePrice, apothecaryCareProblem, chapelCareProblem, type CareKind } from '@/game/places/services';
import type { SaveData } from '@/game/save';
import { currentHp, isExhausted, maxHp } from '@/game/team/health';
import { isAway } from '@/game/team/team';
import { t } from '@/i18n';
import { feel } from '@/services/feel';
import { useGameStore } from '@/store/gameStore';
import { ui } from '@/theme';

import { Price } from '../Price';
import { Text } from '../Text';
import { WoodButton } from '../ui';
import { walkTo } from '../walkLabel';
import { blockedText } from './useShop';

type Props = { place: PlaceSpawn; save: SaveData; player: LatLng; now: number; distance: number; paid: boolean };

/** Heal and rest for each hero at home who needs it: the chapel's are free once a visit, the apothecary's paid. */
export function CareSection({ place, save, player, now, distance, paid }: Props) {
  const actions = useGameStore.getState();
  const problemOf = (heroId: string, care: CareKind) =>
    paid ? apothecaryCareProblem(save, place, heroId, care, player, now) : chapelCareProblem(save, place, heroId, care, player, now);
  const give = (heroId: string, care: CareKind) => {
    if (paid) actions.apothecaryCare(place, heroId, care, player);
    else actions.chapelCare(place, heroId, care, player);
    feel('reward');
  };
  const needing = save.heroes.filter((hero) => !isAway(save, hero.id) && (currentHp(save, hero, now) < maxHp(save, hero) || isExhausted(hero, now)));
  if (!paid && place.id in save.chapelVisits) return <Text style={styles.muted}>{t('places.careUsed')}</Text>;
  if (needing.length === 0) return <Text style={styles.muted}>{t('places.noCare')}</Text>;
  return (
    <View style={styles.list}>
      {needing.map((hero) => (
        <View key={hero.id} style={styles.row}>
          <Text style={styles.name}>
            {t('places.heroHp', { name: hero.name, hp: Math.round(currentHp(save, hero, now)), max: Math.round(maxHp(save, hero)) })}
            {isExhausted(hero, now) ? t('places.exhausted') : ''}
          </Text>
          <View style={styles.actions}>
            {(['heal', 'rest'] as const).map((care) => {
              const problem = problemOf(hero.id, care);
              const title =
                problem === 'tooFar'
                  ? walkTo(distance, care)
                  : problem === 'nothingToDo' || problem === null
                    ? t(care === 'heal' ? 'places.heal' : 'places.rest')
                    : blockedText(problem);
              return (
                <View key={care} style={styles.care}>
                  {paid ? (
                    <Price amount={apothecaryCarePrice(save, care)} short={save.gold < apothecaryCarePrice(save, care)} textStyle={styles.price} />
                  ) : (
                    <Text style={styles.muted}>{t('places.free')}</Text>
                  )}
                  <WoodButton compact title={title} disabled={problem !== null} onPress={() => give(hero.id, care)} />
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 4 },
  row: { gap: 4, paddingVertical: 8, borderTopWidth: 2, borderTopColor: ui.parchmentShade },
  name: { fontSize: 19 },
  price: { fontSize: 19 },
  muted: { color: ui.inkMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  care: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
