import { StyleSheet, View } from 'react-native';

import { PressScale } from '@/components/motion';

import { heroClasses } from '@/content/heroes';
import { supplyRules } from '@/content/supplyLines';
import { isBusy } from '@/game/team/team';
import type { Camp } from '@/game/supply/types';
import type { HeroState } from '@/game/types';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { fonts, ui } from '@/theme';

import { Text } from './Text';
import { TradeLabel } from './TradeLabel';

/** A list of heroes to pick from, each with their class and trade; tap picks one. */
export function HeroChoiceList({ heroes, action, onPick }: { heroes: HeroState[]; action: string; onPick: (heroId: string) => void }) {
  if (heroes.length === 0) return <Text style={styles.empty}>{t('supply.camp.noFreeHeroes')}</Text>;
  return (
    <View style={styles.list}>
      {heroes.map((hero) => (
        <PressScale
          key={hero.id}
          accessibilityRole="button"
          accessibilityLabel={`${action}: ${hero.name}`}
          onPress={() => onPick(hero.id)}
          style={styles.row}
        >
          <View style={styles.who}>
            <Text style={styles.name}>{hero.name}</Text>
            <Text style={styles.class}>{tr(heroClasses[hero.classId].name)}</Text>
          </View>
          <TradeLabel trade={hero.trade.id} hours={hero.trade.hours} />
        </PressScale>
      ))}
    </View>
  );
}

/** The heroes free to post at a camp, the matching trade first; tap posts them. */
export function PostHeroList({ camp }: { camp: Camp }) {
  const save = useGameStore((s) => s.save);
  const postHero = useGameStore((s) => s.postHero);
  const matching = supplyRules.matchingTrade[camp.kind];
  const free = save.heroes
    .filter((hero) => !isBusy(save, hero.id))
    .sort((a, b) => Number(b.trade.id === matching) - Number(a.trade.id === matching));
  return <HeroChoiceList heroes={free} action={t('supply.camp.post')} onPick={(heroId) => postHero(camp.id, heroId)} />;
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 4 },
  who: { flex: 1 },
  name: { fontFamily: fonts.serif, fontSize: 15, color: ui.ink },
  class: { fontFamily: fonts.serif, fontSize: 13, color: ui.inkMuted },
  empty: { color: ui.inkMuted },
});
