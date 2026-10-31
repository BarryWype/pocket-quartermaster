import { ScrollView, StyleSheet } from 'react-native';

import { bossById } from '@/content/enemies';
import { lootConfig } from '@/content/loot/config';
import { purposeInfo } from '@/content/loot/purposes';
import { materialById, recipeById, recipeOutput, valuableById } from '@/content/lookup';
import { highestUnlockedTier } from '@/game/dungeons/unlock';
import { nextSteps, purposesOf, type BaseItemRef, type NextStep } from '@/game/loot/purposes';
import type { ManualRarity } from '@/game/loot/types';
import { ruinsDots } from '@/game/places/ruins';
import type { SaveData } from '@/game/save';
import { isAway } from '@/game/team/team';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import { colors } from '@/theme';

import { Button } from './Button';
import { Overlay } from './Overlay';
import { useSheetMaxHeight } from './Sheet';
import { Panel } from './Panel';
import { Text } from './Text';

/** A base item as the inventory lists it. */
export type InventoryItem = {
  key: string;
  ref: BaseItemRef;
  emoji: string;
  name: string;
  count: number;
  /** A line about the item itself: a relic's effect, a part's uses. */
  about?: string;
  /** Set for a training manual, so it can be read. */
  manual?: ManualRarity;
};

/** The purpose icons shown in the corner of an item's tile. */
export const purposeBadge = (ref: BaseItemRef) =>
  purposesOf(ref)
    .map((p) => purposeInfo[p].icon)
    .join('');

function stepText(step: NextStep): string {
  switch (step.kind) {
    case 'recipes': {
      const known = step.known.map((id) => tr(recipeOutput(recipeById[id]).name));
      return known.length > 0 ? t('inventory.next.recipes', { recipes: known.join(', ') }) : t('inventory.next.unknownRecipe');
    }
    case 'sell':
      return t('inventory.next.sell', { price: step.price });
    case 'boss':
      return t('inventory.next.boss', { boss: tr(bossById[step.bossId]?.name ?? step.bossId) });
    case 'set':
      return t('inventory.next.set', { dots: ruinsDots(step.have, step.need) });
    case 'restore':
      return t('inventory.next.restore', {
        // The gem in a restore cost is a valuable, not a material.
        cost: step.cost.map((s) => `${s.amount} ${tr((materialById[s.materialId] ?? valuableById[s.materialId]).name).toLowerCase()}`).join(', '),
      });
    case 'action':
      return t(`inventory.next.${step.action}`);
  }
}

/** What an item is for and what to do with it next; manuals are read to a hero from here. */
export function ItemSheet({ item, save, onClose }: { item: InventoryItem; save: SaveData; onClose: () => void }) {
  const readManual = useGameStore((state) => state.readManual);
  const top = lootConfig.manuals.topLevelByTier;
  const maxHeight = useSheetMaxHeight();
  return (
    <Overlay onClose={onClose}>
      <Panel style={[styles.dialog, { maxHeight }]}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <Text style={styles.title}>
            {item.emoji} {item.name}
          </Text>
          {item.about ? <Text style={styles.muted}>{item.about}</Text> : null}
          <Text style={styles.line}>
            {purposesOf(item.ref)
              .map((p) => `${purposeInfo[p].icon} ${tr(purposeInfo[p].name)}`)
              .join('   ')}
          </Text>
          {nextSteps(save, item.ref).map((step, i) => (
            <Text key={i} style={styles.line}>
              • {stepText(step)}
            </Text>
          ))}
          {item.manual && item.count > 0 && (
            <>
              <Text style={styles.muted}>{t('inventory.manualHint', { level: top[highestUnlockedTier(save) - 1] })}</Text>
              {save.heroes
                .filter((hero) => !isAway(save, hero.id))
                .map((hero) => (
                  <Button
                    key={hero.id}
                    title={t('inventory.readTo', { name: hero.name, level: hero.level })}
                    onPress={() => {
                      readManual(hero.id, item.manual!);
                      onClose();
                    }}
                  />
                ))}
            </>
          )}
        </ScrollView>
        <Button title={t('common.close')} color={colors.muted} onPress={onClose} />
      </Panel>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  dialog: { gap: 10, padding: 14 },
  scroll: { flexShrink: 1 },
  content: { gap: 10 },
  title: { fontSize: 24 },
  line: { fontSize: 19 },
  muted: { fontSize: 18, color: colors.muted },
});
