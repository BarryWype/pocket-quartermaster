import { ScrollView, StyleSheet, View } from 'react-native';

import { elementInfo } from '@/content/elements';
import { canInfuse } from '@/game/crafting/infusion';
import { ELEMENTS, stoneId } from '@/game/elements';
import { wornBy } from '@/game/forging/salvage';
import { t } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

import { Button } from './Button';
import { GearRow } from './GearRow';
import { Text } from './Text';

/** Infuse plain gear with an elemental stone. Unwanted gear is salvaged from the Inventory. */
export function InfuseStation() {
  const save = useGameStore((state) => state.save);
  const infuse = useGameStore((state) => state.infuse);
  const stones = ELEMENTS.filter((e) => (save.materials[stoneId(e)] ?? 0) > 0);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.intro}>
        {stones.length === 0
          ? t('crafting.noStones')
          : t('crafting.stones', { stones: stones.map((e) => `${elementInfo[e].emoji} ${save.materials[stoneId(e)]}`).join('  ') })}
      </Text>
      {save.gear.length === 0 && <Text style={styles.empty}>{t('crafting.noGear')}</Text>}
      {save.gear.map((gear) => {
        const holder = wornBy(save, gear.uid);
        return (
          <GearRow
            key={gear.uid}
            gear={gear}
            note={holder ? t('common.wornBy', { name: holder.name }) : null}
            right={
              gear.element ? undefined : (
                <View style={styles.stones}>
                  {stones.map((element) => (
                    <Button
                      key={element}
                      title={elementInfo[element].emoji}
                      disabled={!canInfuse(save, gear.uid, element)}
                      onPress={() => infuse(gear.uid, element)}
                    />
                  ))}
                </View>
              )
            }
          />
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  intro: { color: colors.muted, paddingBottom: 8 },
  empty: { color: colors.muted, paddingVertical: 8 },
  stones: { flexDirection: 'row', gap: 6 },
});
