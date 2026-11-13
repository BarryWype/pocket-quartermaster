// Every reward as tiles for the loot grid: an expedition report, a patrol or
// place fight, a dig, a step chest, a quest, a treasure spot, a traveller's
// gift or a Sanctum all go through `lootTiles`. The text forms (lootText.ts)
// stay for notifications and the log.

import type { ImageSourcePropType } from 'react-native';

import { RARITIES, rarityNames, type Rarity } from '@/content/gear';
import { itemById, materialById, monsterPartById, recipeById, recipeOutput, relicById } from '@/content/lookup';
import { baseItems } from '@/content/loot/baseItems';
import { systemIcons } from '@/content/systemIcons';
import { t, tr } from '@/i18n';

import { gearIconOf } from '../gear/gearIcon';
import type { SaveData } from '../save';
import type { ExpeditionReport, GearDef } from '../types';
import { shardId } from '../elements';
import { gearFindKey, knownFinds, relicFindKey, type KnownFinds } from './finds';
import type { Loot, MapRarity } from './types';

export type TileKind = 'gold' | 'xp' | 'material' | 'consumable' | 'gear' | 'blueprint' | 'relic' | 'map' | 'manual' | 'keyFragment' | 'lure' | 'sigil';

/** What a tile opens: the piece, the material or consumable, the blueprint or the relic. */
export type TileRef =
  | { kind: 'gear'; itemId: string; rarity: Rarity; uid?: string }
  | { kind: 'material'; id: string }
  | { kind: 'consumable'; id: string }
  | { kind: 'blueprint'; recipeId: string }
  | { kind: 'relic'; relicId: string }
  | { kind: 'none' };

export type RewardTile = {
  key: string;
  kind: TileKind;
  emoji: string;
  icon?: ImageSourcePropType;
  /** Under the tile: an amount for gold and XP, a count for stacks ("×3"), the kind for one-off finds. */
  label: string;
  count: number;
  /** Gear, maps and manuals wear their rarity as the frame. */
  rarity?: Rarity | MapRarity;
  /** The first time the player gets this blueprint, relic, trinket, monster part or gear type. */
  isNew: boolean;
  /** One of the reward's best finds, revealed last (see `bestTileKeys`). */
  best: boolean;
  itemRef: TileRef;
};

/** Order on the grid: gold and XP, materials and parts, consumables, gear by rarity, blueprints, relics, other one-offs. */
const ORDER: Record<TileKind, number> = {
  gold: 0,
  xp: 1,
  material: 2,
  consumable: 3,
  gear: 4,
  blueprint: 5,
  relic: 6,
  map: 7,
  manual: 7,
  keyFragment: 7,
  lure: 7,
  sigil: 7,
};

/** How good a find is: rare and legendary gear, then blueprints and relics; anything else isn't a best find. */
function findRank(tile: Pick<RewardTile, 'kind' | 'rarity'>): number {
  if (tile.kind === 'gear') return tile.rarity === 'legendary' ? 4 : tile.rarity === 'rare' ? 3 : 0;
  return tile.kind === 'blueprint' || tile.kind === 'relic' ? 2 : 0;
}

/** The reward's best finds, at most two, the best first. */
export function bestTileKeys(tiles: Pick<RewardTile, 'key' | 'kind' | 'rarity'>[], most = 2): string[] {
  return tiles
    .filter((tile) => findRank(tile) > 0)
    .sort((a, b) => findRank(b) - findRank(a))
    .slice(0, most)
    .map((tile) => tile.key);
}

type Options = {
  /** The save before the reward was granted: the "New" ribbon reads it. */
  before?: SaveData;
  /** Leave XP out (expedition reports show it on the hero plates). */
  xp?: boolean;
};

const tile = (kind: TileKind, key: string, fields: Partial<RewardTile> & Pick<RewardTile, 'emoji' | 'label'>): RewardTile => ({
  kind,
  key,
  count: 1,
  isNew: false,
  best: false,
  itemRef: { kind: 'none' },
  ...fields,
});

/** Every find of a loot roll as tiles, in grid order. */
export function lootTiles(loot: Loot, { before, xp = true }: Options = {}): RewardTile[] {
  const known: KnownFinds | null = before ? knownFinds(before) : null;
  const isNewFind = (key: string | null) => !!known && key !== null && !known.finds.has(key);
  const tiles: RewardTile[] = [];
  if (loot.gold > 0) tiles.push(tile('gold', 'gold', { emoji: '🪙', icon: systemIcons['🪙'], label: String(loot.gold), count: loot.gold }));
  if (xp && loot.xp > 0) tiles.push(tile('xp', 'xp', { emoji: '✨', icon: systemIcons['✨'], label: t('tiles.xp', { xp: loot.xp }), count: loot.xp }));
  // One tile per material, stacks merged.
  const materials = new Map<string, number>();
  for (const { materialId, amount } of loot.materials) materials.set(materialId, (materials.get(materialId) ?? 0) + amount);
  for (const [id, amount] of materials) {
    const material = materialById[id];
    if (!material || amount <= 0) continue;
    const part = !!monsterPartById[id];
    tiles.push(
      tile('material', `m:${id}`, {
        emoji: material.emoji,
        icon: material.icon ?? systemIcons[material.emoji],
        label: t('tiles.count', { count: amount }),
        count: amount,
        isNew: part && !!known && !known.parts.has(id),
        itemRef: { kind: 'material', id },
      }),
    );
  }
  for (const { itemId, amount } of loot.consumables) {
    const item = itemById[itemId];
    if (!item) continue;
    tiles.push(tile('consumable', `c:${itemId}`, { emoji: item.emoji, icon: item.icon ?? systemIcons[item.emoji], label: t('tiles.count', { count: amount }), count: amount, itemRef: { kind: 'consumable', id: itemId } }));
  }
  loot.gear.forEach((piece, i) => {
    const item = itemById[piece.itemId] as GearDef | undefined;
    if (!item) return;
    const trinket = item.slot === 'trinket';
    tiles.push(
      tile('gear', `g:${i}`, {
        emoji: item.emoji,
        icon: gearIconOf({ ...piece, roll: 0, affixes: [], rerolls: 0 }) ?? systemIcons[item.emoji],
        label: trinket ? t('tiles.trinket') : tr(rarityNames[piece.rarity]),
        rarity: piece.rarity,
        isNew: isNewFind(gearFindKey(piece.itemId)),
        itemRef: { kind: 'gear', itemId: piece.itemId, rarity: piece.rarity, ...(piece.uid ? { uid: piece.uid } : {}) },
      }),
    );
  });
  for (const recipeId of loot.recipeIds) {
    const recipe = recipeById[recipeId];
    if (!recipe) continue;
    const output = recipeOutput(recipe);
    tiles.push(
      tile('blueprint', `b:${recipeId}`, {
        emoji: output.emoji,
        icon: output.icon ?? systemIcons[output.emoji],
        label: t('tiles.blueprint'),
        isNew: !!known && !known.recipes.has(recipeId),
        itemRef: { kind: 'blueprint', recipeId },
      }),
    );
  }
  loot.relics.forEach((relicId, i) => {
    const relic = relicById[relicId];
    if (!relic) return;
    tiles.push(tile('relic', `r:${i}`, { emoji: '🏺', icon: relic.icon, label: t('tiles.relic'), isNew: isNewFind(relicFindKey(relicId)), itemRef: { kind: 'relic', relicId } }));
  });
  loot.treasureMaps.forEach((map, i) =>
    tiles.push(tile('map', `map:${i}`, { emoji: '🗺️', icon: systemIcons['🗺️'], label: t('tiles.map', { tier: map.tier }), rarity: map.rarity })),
  );
  loot.manuals.forEach((rarity, i) =>
    tiles.push(tile('manual', `manual:${i}`, { emoji: baseItems.trainingManual.emoji, icon: systemIcons['📖'], label: t('tiles.manual'), rarity })),
  );
  if (loot.keyFragments > 0) {
    tiles.push(tile('keyFragment', 'key', { emoji: baseItems.keyFragment.emoji, label: t('tiles.keyFragment', { count: loot.keyFragments }), count: loot.keyFragments }));
  }
  if (loot.lures > 0) tiles.push(tile('lure', 'lure', { emoji: '🪤', label: t('tiles.lure', { count: loot.lures }), count: loot.lures }));
  return order(tiles);
}

/** Tiles in grid order (gear by rarity, the rarest last), with the best finds marked. */
function order(tiles: RewardTile[]): RewardTile[] {
  const rarityRank = (tile: RewardTile) => (tile.kind === 'gear' ? RARITIES.indexOf(tile.rarity as Rarity) : 0);
  const sorted = tiles
    .map((tile, i) => ({ tile, i }))
    .sort((a, b) => ORDER[a.tile.kind] - ORDER[b.tile.kind] || rarityRank(a.tile) - rarityRank(b.tile) || a.i - b.i)
    .map(({ tile }) => tile);
  const best = new Set(bestTileKeys(sorted));
  return sorted.map((tile) => (best.has(tile.key) ? { ...tile, best: true } : tile));
}

/** An expedition report's finds: its loot (the secret prize is merged in) and a Sigil or its shards; XP goes on the hero plates. */
export function reportTiles(report: ExpeditionReport, before?: SaveData): RewardTile[] {
  const sigilShards = report.sigilShards ? [{ materialId: shardId(report.sigilShards.element), amount: report.sigilShards.amount }] : [];
  const tiles = lootTiles({ ...report.loot, materials: [...report.loot.materials, ...sigilShards] }, { before, xp: false });
  if (!report.sigil) return tiles;
  return order([...tiles, tile('sigil', 'sigil', { emoji: '🎟️', label: t('tiles.sigil', { tier: report.sigil }) })]);
}
