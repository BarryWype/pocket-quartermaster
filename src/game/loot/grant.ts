import { rosterRules } from '@/content/roster';
import { lootConfig } from '@/content/loot/config';
import { traitById } from '@/content/traits';

import { unlockRecipe } from '../crafting/crafting';
import { seeParts } from '../crafting/partRecipes';
import { convertShards } from '../elements';
import { affixEffects, bestAffixValue } from '../gear/affixes';
import { makeGearPiece } from '../gear/make';
import { guildBonus } from '../guild/guild';
import { highestUnlockedTier } from '../dungeons/unlock';
import { addMaterials } from '../inventory';
import { noteFinds } from './finds';
import type { SaveData } from '../save';
import { addXp, equippedGear } from '../team/team';
import type { TreasureMap } from '../types';
import type { Loot } from './types';

/** The loot with each gear piece's uid as granted: the pieces `after` holds that `before` didn't, matched in order. */
export function withGrantedUids(loot: Loot, before: SaveData, after: SaveData): Loot {
  const had = new Set(before.gear.map((g) => g.uid));
  const fresh = after.gear.filter((g) => !had.has(g.uid));
  const gear = loot.gear.map((piece) => {
    const i = fresh.findIndex((g) => g.itemId === piece.itemId && g.rarity === piece.rarity);
    return i === -1 ? piece : { ...piece, uid: fresh.splice(i, 1)[0].uid };
  });
  return { ...loot, gear };
}

/**
 * Pays a roll's loot (found where `foundIn` says: a dungeon id or a `GearSource`): gold (the party's best Plunderer counts once), XP per
 * hero who took part (trait, Veteran and Guild Hall bonuses on top), materials, consumables, lures, gear (rolled with its fresh
 * uid), blueprints, key fragments, treasure maps (found `now`), manuals
 * and relics. Parts found unlock their recipes.
 * Pure: returns a new save.
 */
export function grantLoot(save: SaveData, heroIds: string[], loot: Loot, now: number, foundIn?: string): SaveData {
  const guildXp = 1 + guildBonus(save, 'heroXp');
  const playerTier = highestUnlockedTier(save);
  const consumables = { ...save.consumables };
  for (const { itemId, amount } of loot.consumables) consumables[itemId] = (consumables[itemId] ?? 0) + amount;
  const manuals = { ...save.manuals };
  for (const rarity of loot.manuals) manuals[rarity] = (manuals[rarity] ?? 0) + 1;

  let uid = save.nextUid;
  const gear = loot.gear.map((piece) => ({ ...makeGearPiece(`g${uid++}`, piece.itemId, piece.rarity), forged: false, ...(foundIn ? { foundIn } : {}) }));
  const maps = loot.treasureMaps.map(
    ({ rarity, tier }): TreasureMap => ({ id: `map${uid++}`, tier, rarity, expiresAt: now + lootConfig.treasureMapHours * 3_600_000, location: null }),
  );
  const relics = loot.relics.map((relicId) => ({ uid: `r${uid++}`, relicId }));
  const party = save.heroes.filter((hero) => heroIds.includes(hero.id));
  // Heroes left well behind the roster's best catch up faster.
  const top = Math.max(0, ...save.heroes.map((hero) => hero.level));
  // The party's best Plunderer counts once on the gold.
  const plunderer = bestAffixValue(party.flatMap((hero) => equippedGear(save, hero)), 'plunderer');
  const heroes = save.heroes.map((hero) => {
    if (!heroIds.includes(hero.id) || loot.xp <= 0) return hero;
    const xpBonus = (traitById[hero.trait]?.effects ?? []).reduce((m, e) => m * (e.kind === 'xpMultiplier' ? e.multiplier : 1), 1);
    const veteran = affixEffects(equippedGear(save, hero)).veteran ?? 0;
    const catchUp = hero.level < top - rosterRules.catchUpGap ? rosterRules.catchUpXp : 1;
    return addXp(hero, Math.round(loot.xp * xpBonus * (1 + veteran / 100) * guildXp * catchUp), playerTier);
  });
  let next: SaveData = {
    ...save,
    gold: save.gold + Math.round(loot.gold * (1 + plunderer / 100)),
    materials: convertShards(addMaterials(save.materials, loot.materials)),
    consumables,
    lures: save.lures + loot.lures,
    gear: [...save.gear, ...gear],
    heroes,
    keyFragments: save.keyFragments + loot.keyFragments,
    treasureMaps: [...save.treasureMaps, ...maps],
    manuals,
    relics: [...save.relics, ...relics],
    nextUid: uid,
  };
  for (const recipeId of loot.recipeIds) next = unlockRecipe(next, recipeId);
  next = seeParts(next, loot.materials.map((stack) => stack.materialId));
  return noteFinds(next, loot);
}
