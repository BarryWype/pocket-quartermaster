import type { PlaceKind } from './places';

/** What a boss weakness item does to its boss fight. */
export type WeaknessEffect = { hpCut?: number; damageCut?: number; noEnrage?: boolean; noSweep?: boolean; freeRounds?: number };

export type BossWeakness = { bossId: string; itemId: string; place: PlaceKind; price: number; effect: WeaknessEffect };

/**
 * Boss weakness items: a consumable bought at a map place that weakens its
 * tier's boss when a conscious hero carries it into the fight (see
 * expeditions/simulate.ts). The data is general — boss id → item → effect —
 * so more bosses can get one later; the numbers are placeholders.
 */
export const bossWeaknesses: BossWeakness[] = [
  { bossId: 'banditCaptain', itemId: 'wantedPoster', place: 'tavern', price: 15, effect: { hpCut: 0.25 } },
  { bossId: 'ogreChieftain', itemId: 'strongAle', place: 'huntingLodge', price: 30, effect: { damageCut: 0.3 } },
  { bossId: 'lichOfTheDeep', itemId: 'fontWater', place: 'chapel', price: 60, effect: { hpCut: 0.25, noEnrage: true } },
  { bossId: 'giantKing', itemId: 'sleepingDraught', place: 'apothecary', price: 120, effect: { freeRounds: 2 } },
  { bossId: 'elderDragon', itemId: 'decoyHoard', place: 'market', price: 300, effect: { noSweep: true } },
];

export const weaknessByBoss: Record<string, BossWeakness> = Object.fromEntries(bossWeaknesses.map((w) => [w.bossId, w]));

export const weaknessByItem: Record<string, BossWeakness> = Object.fromEntries(bossWeaknesses.map((w) => [w.itemId, w]));
