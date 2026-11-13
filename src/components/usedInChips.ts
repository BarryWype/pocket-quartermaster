import { bossById } from '@/content/enemies';
import { purposeInfo } from '@/content/loot/purposes';
import { materialById, recipeById, recipeOutput } from '@/content/lookup';
import { nextSteps, purposesOf, type BaseItemRef, type NextStep } from '@/game/loot/purposes';
import { ruinsDots } from '@/game/places/ruins';
import type { SaveData } from '@/game/save';
import { t, tr } from '@/i18n';

function stepText(step: NextStep): string {
  switch (step.kind) {
    case 'recipes': {
      const known = step.known.map((id) => tr(recipeOutput(recipeById[id]).name));
      return known.length > 0 ? t('inventory.next.recipes', { recipes: known.join(', ') }) : t('inventory.next.unknownRecipe');
    }
    case 'boss':
      return t('inventory.next.boss', { boss: tr(bossById[step.bossId]?.name ?? step.bossId) });
    case 'set':
      return t('inventory.next.set', { dots: ruinsDots(step.have, step.need) });
    case 'restore':
      return t('inventory.next.restore', {
        cost: step.cost.map((s) => `${s.amount} ${tr(materialById[s.materialId].name).toLowerCase()}`).join(', '),
        gold: step.gold,
      });
    case 'action':
      return t(`inventory.next.${step.action}`);
  }
}

/** What a base item is used in: its purposes, then one chip per known recipe and any other next step. */
export function usedInChips(save: SaveData, ref: BaseItemRef) {
  const chips: { key: string; tone: 'keyword' | 'neutral'; label: string }[] = purposesOf(ref).map((purpose, i) => ({
    key: `p${i}`,
    tone: 'keyword',
    label: tr(purposeInfo[purpose].name),
  }));
  for (const step of nextSteps(save, ref)) {
    if (step.kind === 'recipes') {
      for (const id of step.known) chips.push({ key: id, tone: 'neutral', label: tr(recipeOutput(recipeById[id]).name) });
      if (step.known.length === 0) chips.push({ key: 'unknown', tone: 'neutral', label: t('inventory.next.unknownRecipe') });
    } else {
      chips.push({ key: step.kind, tone: 'neutral', label: stepText(step) });
    }
  }
  return chips;
}
