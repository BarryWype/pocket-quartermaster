import { trinketId, trinketKinds, trinketRules } from '@/content/trinkets';
import { qualities } from '@/content/forging';
import { ELEMENTS, type Element } from '@/game/elements';
import type { Approach, GearDef, GearInstance, Quality, Stats } from '@/game/types';

import { lootGearQuality, lootGearTier, qualityBonus, qualitySteps } from './gear';
import type { LootRequest } from './roll';

/** What a trinket does at one quality: rounded stats, its approach, its resistance. */
export type TrinketEffect = {
  stats: Partial<Stats>;
  approach?: Approach;
  elementResist?: { element: Element; amount: number };
};

/** Quality multiplies and rounds every stat but Luck, which stays flat. */
export function trinketEffect(item: GearDef, quality: Quality): TrinketEffect {
  const multiplier = qualities[quality].multiplier;
  const stats: Partial<Stats> = {};
  for (const [key, value] of Object.entries(item.stats) as [keyof Stats, number][]) {
    const amount = key === 'luck' ? value : Math.round(value * multiplier);
    if (amount !== 0) stats[key] = amount;
  }
  return {
    stats,
    ...(item.approach ? { approach: item.approach } : {}),
    ...(item.elementResist ? { elementResist: { ...item.elementResist, amount: Math.round(item.elementResist.amount * multiplier) } } : {}),
  };
}

/** The five amulets are one weighted entry: the element is picked after the group. */
const amuletKind = trinketKinds.find((kind) => kind.group === 'amulet')!;

/** A random looted trinket; its tier and quality follow the gear rules, its kind the group weights. */
export function rollLootTrinket(req: LootRequest): GearInstance {
  const tier = lootGearTier(req.source, req.tier, req.context.playerTier, req.rng);
  const quality = lootGearQuality(req.source, req.rng, qualityBonus(req), req.mapRarity, qualitySteps(req));
  const pool = trinketKinds.filter(
    (kind) => kind.group === 'stat' || kind.group === 'talisman' || kind === amuletKind || (kind.group === 'fortune' && quality === 'legendary'),
  );
  const pick = req.rng.weighted(pool, (kind) => trinketRules.weights[kind.group]);
  const kind = pick.group === 'amulet'
    ? `${req.element ?? ELEMENTS[req.rng.int(0, ELEMENTS.length - 1)]}Amulet`
    : pick.kind;
  return { uid: '', itemId: trinketId(kind, tier), quality };
}
