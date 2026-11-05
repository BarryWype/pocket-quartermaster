import { gearRules, type Rarity } from '@/content/gear';
import { affixById } from '@/content/affixes';

import { affixValue, affixPool, rollAffixes } from './affixes';
import { rollStatDice } from './stats';
import { rollUnique } from './uniques';
import { createRng, type Rng } from '../generation/rng';
import type { GearInstance } from '../types';

/** How a new piece is made: which affixes are forced onto it, and its restored relic. */
export type GearPieceOptions = {
  forced?: { id: string; value?: number }[];
  /** Pins the dice roll (migrations match an old piece's factor). */
  roll?: number;
  relicId?: string;
};

/**
 * A new piece: its dice rolled, its forced affixes first, then filled to the
 * rarity's count from the slot's pool. A non-relic Legendary also rolls its
 * unique. All rolls are seeded by the uid, so the piece never changes on its
 * own; `rng` builds them (defaults to `createRng`).
 */
export function makeGearPiece(
  uid: string,
  itemId: string,
  rarity: Rarity,
  rng: (seed: string) => Rng = createRng,
  { forced, roll, relicId }: GearPieceOptions = {},
): GearInstance {
  const affixRng = rng(`${uid}|affixes`);
  const affixes = (forced ?? []).map(({ id, value }) => ({
    id,
    value: value ?? affixValue(affixRng, affixById[id]),
  }));
  const piece: GearInstance = {
    uid,
    itemId,
    rarity,
    roll: roll ?? rollStatDice(rng(`${uid}|roll`)),
    affixes,
    rerolls: 0,
    ...(relicId ? { relicId } : {}),
  };
  const count = gearRules.affixCount[rarity] - affixes.length;
  if (count > 0) piece.affixes = [...affixes, ...rollAffixes(affixRng, piece, count, affixPool(piece))];
  if (rarity === 'legendary' && !relicId) {
    const unique = rollUnique(rng(`${uid}|unique`), piece);
    if (unique) piece.unique = unique;
  }
  return piece;
}
