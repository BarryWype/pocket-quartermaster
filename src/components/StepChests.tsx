import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { chests } from '@/content/chests';
import { itemById, materialById, recipeById } from '@/content/lookup';
import { chestState, dayKey } from '@/game/rewards/chests';
import { useTodaySteps } from '@/hooks/useTodaySteps';
import { useGameStore } from '@/store/gameStore';

import { Button } from './Button';
import { Row, SectionTitle } from './Row';
import { Text } from './Text';

export function StepChests() {
  const steps = useTodaySteps();
  const save = useGameStore((state) => state.save);
  const openChest = useGameStore((state) => state.openChest);
  const [message, setMessage] = useState<string | null>(null);
  const day = dayKey(new Date());

  const open = (chestId: string) => {
    const reward = openChest(chestId, steps);
    setMessage(
      [
        `🪙 ${reward.gold}`,
        ...reward.materials.map((m) => `${materialById[m.materialId].emoji} ${m.amount}`),
        reward.recipeId ? `📜 ${itemById[recipeById[reward.recipeId].itemId].name}` : null,
      ]
        .filter(Boolean)
        .join('  '),
    );
  };

  return (
    <>
      <SectionTitle>{`Daily step chests · ${steps.toLocaleString()} steps today`}</SectionTitle>
      {chests.map((chest) => {
        const state = chestState(save, chest, steps, day);
        return (
          <Row
            key={chest.id}
            emoji={chest.emoji}
            title={chest.name}
            subtitle={`${chest.steps.toLocaleString()} steps`}
            right={
              state === 'opened' ? (
                'Opened'
              ) : (
                <Button title="Open" disabled={state === 'locked'} onPress={() => open(chest.id)} />
              )
            }
          />
        );
      })}
      {message && <Text style={styles.reward}>Chest reward: {message}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  reward: { paddingVertical: 8, fontWeight: '600' },
});
