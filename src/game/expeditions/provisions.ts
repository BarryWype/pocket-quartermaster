import { items } from '@/content/items';
import { provisionRules } from '@/content/provisions';

import type { Ability, ConsumableDef, Hunger, ProvisionDef } from '../types';

type Rules = typeof provisionRules;

const provisions = items.filter((i): i is ProvisionDef => i.slot === 'provision');
export const supplyItems = provisions.filter((i) => i.supply);
export const mealItems = provisions.filter((i) => i.meal);
export const charmItems = items.filter((i): i is ConsumableDef => i.slot === 'consumable' && !!i.charm);

/** Supply points one hero needs: per started hour of the run, plus their trait's change, never below 0. */
export function heroSupplyNeed(abilities: Ability[], minutes: number, rules: Rules = provisionRules) {
  const extra = abilities.reduce((sum, a) => sum + (a.kind === 'supplyNeed' ? a.add : 0), 0);
  return Math.max(0, Math.ceil(minutes / 60) * rules.pointsPerHeroHour + extra);
}

/** Supply points held in a stock. */
export const supplyHeld = (stock: Record<string, number>) =>
  supplyItems.reduce((sum, item) => sum + (stock[item.id] ?? 0) * item.supply!, 0);

export type SupplyPick = { items: Record<string, number>; points: number };

/**
 * The supply to take for `need` points: the combination that wastes the
 * fewest points, then uses the fewest items, then the cheaper food (trail mix
 * first). Short of enough, everything held.
 */
export function pickSupply(stock: Record<string, number>, need: number): SupplyPick {
  if (need <= 0) return { items: {}, points: 0 };
  if (supplyHeld(stock) < need) {
    const all = Object.fromEntries(supplyItems.filter((i) => (stock[i.id] ?? 0) > 0).map((i) => [i.id, stock[i.id]]));
    return { items: all, points: supplyHeld(stock) };
  }
  let best = { counts: [] as number[], waste: Infinity, count: Infinity };
  const search = (index: number, counts: number[], points: number) => {
    if (points >= need) {
      const waste = points - need;
      const count = counts.reduce((a, b) => a + b, 0);
      if (waste < best.waste || (waste === best.waste && count < best.count)) best = { counts: [...counts], waste, count };
      return;
    }
    if (index === supplyItems.length) return;
    const item = supplyItems[index];
    const most = Math.min(stock[item.id] ?? 0, Math.ceil((need - points) / item.supply!));
    for (let n = most; n >= 0; n--) search(index + 1, [...counts, n], points + n * item.supply!);
  };
  search(0, [], 0);
  const { counts } = best;
  return {
    items: Object.fromEntries(supplyItems.flatMap((item, i) => (counts[i] > 0 ? [[item.id, counts[i]]] : []))),
    points: counts.reduce((sum, n, i) => sum + n * supplyItems[i].supply!, 0),
  };
}

export function hungerFor(points: number, need: number): Hunger {
  if (points >= need) return 'fed';
  return points > 0 ? 'underfed' : 'starving';
}

/** A hero's damage multiplier and share of max HP lost at the start, for a supply status. */
export function hungerEffect(hunger: Hunger, abilities: Ability[], rules: Rules = provisionRules) {
  if (hunger === 'fed') return { damage: 1, hpLoss: 0 };
  const resist = abilities.reduce((m, a) => m * (a.kind === 'hungerResist' ? a.multiplier : 1), 1);
  const { damage, hpLoss } = rules.hunger[hunger];
  return { damage: 1 - (1 - damage) * resist, hpLoss: hpLoss * resist };
}

/** Gold for emergency supply at a tavern: jerky at a steep price that follows the tier. */
export function emergencyPrice(tier: number, rules: Rules = provisionRules) {
  const jerky = supplyItems.find((i) => i.id === rules.emergency.itemId)!;
  return Math.round(jerky.supply! * rules.emergency.pricePerPoint * rules.emergency.perTier ** (tier - 1));
}
