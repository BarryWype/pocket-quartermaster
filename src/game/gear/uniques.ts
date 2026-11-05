import { itemById, relicById } from '@/content/lookup';
import { relics, type RelicDef } from '@/content/loot/relics';

import type { Rng } from '../generation/rng';
import type { GearDef, GearInstance, GearType, RelicEffect } from '../types';

/** Relic effect kinds that work from a trinket: penalties and immunities, plus Blessed. */
const TRINKET_UNIQUE_KINDS = new Set(['penaltyCut', 'cancelPenalty', 'ignorePenalty', 'answers', 'immune']);

const trinketEffectOk = (effect: RelicEffect) =>
  TRINKET_UNIQUE_KINDS.has(effect.kind) || (effect.kind === 'keyword' && effect.keyword === 'blessed');

/**
 * The relics whose effects fit the piece: those of its gear type, and for a
 * trinket any relic whose every effect carries over (blessed, penalty and
 * immunity effects; the combat kinds only work from a held piece).
 */
export function uniquePool(piece: GearInstance | { itemId: string }): RelicDef[] {
  const item = itemById[piece.itemId] as GearDef;
  const gearType = item.gearType as GearType | undefined;
  if (!gearType || item.slot === 'trinket') {
    return relics.filter((relic) => relic.effects.every(trinketEffectOk));
  }
  return relics.filter((relic) => relic.gearType === gearType);
}

/** The relic whose effects a non-relic Legendary carries as its unique. */
export function rollUnique(rng: Rng, piece: GearInstance | { itemId: string }): string | undefined {
  const pool = uniquePool(piece);
  if (pool.length === 0) return undefined;
  return pool[rng.int(0, pool.length - 1)].id;
}

/** The relic effects the piece carries: its restored relic's, or its unique's (unnamed). */
export function pieceEffects(piece: GearInstance): RelicEffect[] {
  return relicById[piece.relicId ?? piece.unique ?? '']?.effects ?? [];
}
