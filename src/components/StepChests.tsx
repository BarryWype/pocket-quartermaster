import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { chests } from '@/content/chests';
import { materialById, recipeById, recipeOutput } from '@/content/lookup';
import { chestState, dayKey } from '@/game/rewards/chests';
import { useTodaySteps } from '@/hooks/useTodaySteps';
import { formatNumber, t, tr } from '@/i18n';
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
        reward.recipeId ? `📜 ${tr(recipeOutput(recipeById[reward.recipeId]).name)}` : null,
      ]
        .filter(Boolean)
        .join('  '),
    );
  };

  return (
    <>
      <SectionTitle>{t('chests.title', { steps: formatNumber(steps) })}</SectionTitle>
      {chests.map((chest) => {
        const state = chestState(save, chest, steps, day);
        return (
          <Row
            key={chest.id}
            emoji={chest.emoji}
            title={tr(chest.name)}
            subtitle={t('chests.steps', { steps: formatNumber(chest.steps) })}
            right={
              state === 'opened' ? (
                t('chests.opened')
              ) : (
                <Button title={t('chests.open')} disabled={state === 'locked'} onPress={() => open(chest.id)} />
              )
            }
          />
        );
      })}
      {message && <Text style={styles.reward}>{t('chests.reward', { reward: message })}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  reward: { paddingVertical: 8 },
});
