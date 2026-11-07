import { trinketId, trinketKinds, trinketRules } from '@/content/trinkets';
import { ELEMENTS, type Element } from '@/game/elements';
import type { GearDef, GearInstance, Stats } from '@/game/types';

import { statFactor } from '../gear/stats';
import { lootGearRarity, lootGearTier, rarityBonus, raritySteps } from './gear';
import type { LootRequest } from './roll';
import type { RolledGear } from './types';

/** What a trinket does after its roll: rounded stats and its resistance. */
export type TrinketEffect = {
  stats: Partial<Stats>;
  elementResist?: { element: Element; amount: number };
};

/** The dice factor multiplies and rounds every stat but Luck, which stays flat. */
export function trinketEffect(item: GearDef, gear: Pick<GearInstance, 'roll' | 'rarity'>): TrinketEffect {
  const multiplier = statFactor(gear.roll, gear.rarity);
  const stats: Partial<Stats> = {};
  for (const [key, value] of Object.entries(item.stats) as [keyof Stats, number][]) {
    const amount = key === 'luck' ? value : Math.round(value * multiplier);
    if (amount !== 0) stats[key] = amount;
  }
  return {
    stats,
    ...(item.elementResist ? { elementResist: { ...item.elementResist, amount: Math.round(item.elementResist.amount * multiplier) } } : {}),
  };
}

/** The five amulets are one weighted entry: the element is picked after the group. */
const amuletKind = trinketKinds.find((kind) => kind.group === 'amulet')!;

/** A random looted trinket; its tier and rarity follow the gear rules, its kind the group weights. */
export function rollLootTrinket(req: LootRequest): RolledGear {
  const tier = lootGearTier(req.source, req.tier, req.context.playerTier, req.rng);
  const rarity = lootGearRarity(req.source, req.rng, rarityBonus(req), req.mapRarity, raritySteps(req));
  const pool = trinketKinds.filter(
    (kind) => kind.group === 'stat' || kind === amuletKind || (kind.group === 'fortune' && rarity === 'legendary'),
  );
  const pick = req.rng.weighted(pool, (kind) => trinketRules.weights[kind.group]);
  const kind = pick.group === 'amulet'
    ? `${req.element ?? ELEMENTS[req.rng.int(0, ELEMENTS.length - 1)]}Amulet`
    : pick.kind;
  return { uid: '', itemId: trinketId(kind, tier), rarity };
}
