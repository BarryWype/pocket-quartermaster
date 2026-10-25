import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { elementInfo } from '@/content/elements';
import { gearName, itemById } from '@/content/lookup';
import { canInfuse, canRecycle } from '@/game/crafting/infusion';
import { ELEMENTS, stoneId } from '@/game/elements';
import type { GearInstance } from '@/game/types';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

import { Button } from './Button';
import { Row } from './Row';
import { Text } from './Text';

/** Infuse plain gear with an elemental stone, or recycle infused gear for a shard. */
export function InfuseStation() {
  const save = useGameStore((state) => state.save);
  const infuse = useGameStore((state) => state.infuse);
  const recycle = useGameStore((state) => state.recycle);
  const stones = ELEMENTS.filter((e) => (save.materials[stoneId(e)] ?? 0) > 0);

  const wornBy = (gear: GearInstance) =>
    save.heroes.find((h) => h.equipment.weapon === gear.uid || h.equipment.armor === gear.uid)?.name;

  const confirmRecycle = (gear: GearInstance) => {
    const element = gear.element!;
    Alert.alert(`Recycle ${gearName(gear)}?`, `It is destroyed and you get 1 ${elementInfo[element].name.toLowerCase()} shard back.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Recycle', style: 'destructive', onPress: () => recycle(gear.uid) },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.intro}>
        {stones.length === 0
          ? 'No elemental stones yet. Win shards at Sanctums: 10 shards make a stone.'
          : `Stones: ${stones.map((e) => `${elementInfo[e].emoji} ${save.materials[stoneId(e)]}`).join('  ')}`}
      </Text>
      {save.gear.length === 0 && <Text style={styles.empty}>Forge some gear first.</Text>}
      {save.gear.map((gear) => {
        const item = itemById[gear.itemId];
        const holder = wornBy(gear);
        return (
          <Row
            key={gear.uid}
            emoji={item.emoji}
            icon={item.icon}
            title={gearName(gear)}
            subtitle={
              [gear.element ? `${elementInfo[gear.element].emoji} ${elementInfo[gear.element].name}` : null, holder ? `Worn by ${holder}` : null]
                .filter(Boolean)
                .join(' · ') || undefined
            }
            right={
              gear.element ? (
                <Button
                  title="Recycle"
                  color={colors.danger}
                  disabled={!canRecycle(save, gear.uid)}
                  onPress={() => confirmRecycle(gear)}
                />
              ) : (
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
