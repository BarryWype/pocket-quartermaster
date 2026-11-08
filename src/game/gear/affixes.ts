import { gearRules, type Rarity } from '@/content/gear';
import { affixById, affixes, type AffixDef } from '@/content/affixes';
import { GEAR_SLOTS, gearProfiles } from '@/content/equipment';
import { itemById } from '@/content/lookup';

import type { Rng } from '../generation/rng';
import type { Element } from '../elements';
import type { SaveData } from '../save';
import type { GearDef, GearInstance, GearType } from '../types';

/** An affix's value: fixed affixes stay 0, ranged affixes roll 3d6 mapped onto their range. */
export function affixValue(rng: Rng, affix: AffixDef): number {
  if (!affix.range) return 0;
  let total = 0;
  for (let i = 0; i < gearRules.dice.count; i++) total += rng.int(1, gearRules.dice.sides);
  const share = (total - 3) / 15;
  return Math.round(affix.range.min + (affix.range.max - affix.range.min) * share);
}

/**
 * Which affix pool a gear type rolls from: 'weapon' (the offensive pool) for
 * weapons and damage off-hands, 'armourOffhand' (the defensive pool) for
 * armour and non-damage off-hands, 'any' for trinkets.
 */
export function affixSlotOf(gearType: GearType | undefined): 'weapon' | 'armourOffhand' | 'any' {
  if (!gearType) return 'any';
  return GEAR_SLOTS[gearType] === 'weapon' || gearProfiles[gearType].damageStat ? 'weapon' : 'armourOffhand';
}

/**
 * The affixes allowed on a piece: offensive pieces share the weapon affixes,
 * defensive ones the armour/off-hand ones, and every piece takes the "any"
 * pool (trinkets only that one). Element affixes never roll: they come only
 * from elemental stones.
 */
export function affixPool(piece: GearInstance | { itemId: string; rarity?: Rarity }): AffixDef[] {
  const item = itemById[piece.itemId] as GearDef;
  const gearType = item.gearType as GearType | undefined;
  const affixSlot = affixSlotOf(gearType);
  return affixes.filter((affix) => affix.source.kind !== 'element' && (affix.slot === 'any' || affix.slot === affixSlot));
}

/**
 * `count` distinct affixes from `pool`, never ones the piece already carries,
 * each with a rolled value. Even pick unless `weightOf` gives weights.
 */
export function rollAffixes(
  rng: Rng,
  piece: Pick<GearInstance, 'itemId' | 'rarity' | 'affixes'>,
  count: number,
  pool: AffixDef[],
  weightOf: (affix: AffixDef) => number = () => 1,
): { id: string; value: number }[] {
  const taken = new Set(piece.affixes.map((affix) => affix.id));
  const rolled: { id: string; value: number }[] = [];
  while (rolled.length < count) {
    const open = pool.filter((affix) => !taken.has(affix.id));
    if (open.length === 0) break;
    const affix = rng.weighted(open, weightOf);
    taken.add(affix.id);
    rolled.push({ id: affix.id, value: affixValue(rng, affix) });
  }
  return rolled;
}

/** The hero's worn affix values summed by affix id. */
export function affixEffects(pieces: GearInstance[]): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const piece of pieces) {
    for (const affix of piece.affixes) sums[affix.id] = (sums[affix.id] ?? 0) + affix.value;
  }
  return sums;
}

/** The best value of one affix across the pieces (party/roster affixes count once, at their best). */
export function bestAffixValue(pieces: GearInstance[], affixId: string): number {
  return pieces.reduce(
    (best, piece) => Math.max(best, piece.affixes.find((affix) => affix.id === affixId)?.value ?? 0),
    0,
  );
}

/** The best value of a roster-wide affix over every hero's equipped gear. */
export function rosterAffixBest(save: SaveData, affixId: string): number {
  const byUid = new Map(save.gear.map((piece) => [piece.uid, piece]));
  const worn = save.heroes.flatMap((hero) =>
    (['helmet', 'weapon', 'armor', 'offhand', 'trinket'] as const).flatMap((slot) => {
      const uid = hero.equipment[slot];
      const piece = uid ? byUid.get(uid) : undefined;
      return piece ? [piece] : [];
    }),
  );
  return bestAffixValue(worn, affixId);
}

/** The element a piece's infused affix gives the hero's hits; stones add it to offensive pieces. */
export function infusedElement(piece: GearInstance | undefined): Element | undefined {
  if (!piece) return undefined;
  for (const affix of piece.affixes) {
    const effect = affixById[affix.id]?.effect;
    if (effect?.kind === 'infused') return effect.element;
  }
  return undefined;
}

/** The element a piece's warding affix resists (defensive pieces). */
export function wardingElement(piece: GearInstance | undefined): Element | undefined {
  if (!piece) return undefined;
  for (const affix of piece.affixes) {
    const effect = affixById[affix.id]?.effect;
    if (effect?.kind === 'warding') return effect.element;
  }
  return undefined;
}
