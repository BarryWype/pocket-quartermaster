import type { LootModifier } from "./loot/types";

/**
 * The removed charm consumables (see the version 46 migration): the monster
 * part each one was crafted from (`shards` means the shard of the element the
 * save holds most), the loot modifier it gave for a run, and whether it became
 * a loot trinket. The Lucky ear became nothing.
 */
export const LEGACY_CHARMS: Record<
  string,
  { part: string; modifier: LootModifier; trinket: boolean }
> = {
  luckyEar: { part: "goblinEar", modifier: { id: "luckyEar", kind: "luck", add: 3 }, trinket: false },
  bountyToken: { part: "tatteredInsignia", modifier: { id: "bountyToken", kind: "gold", percent: 20 }, trinket: true },
  quillCharm: { part: "feather", modifier: { id: "quillCharm", kind: "xp", percent: 15 }, trinket: true },
  tinkersLodestone: { part: "cog", modifier: { id: "tinkersLodestone", kind: "rarity", steps: 1 }, trinket: true },
  scarabCharm: { part: "chitin", modifier: { id: "scarabCharm", kind: "chance", category: "treasureMaps", multiplier: 1.5 }, trinket: true },
  ghostLantern: { part: "ectoplasm", modifier: { id: "ghostLantern", kind: "chance", category: "keyFragments", multiplier: 1.5 }, trinket: true },
  graveDustPouch: { part: "graveDust", modifier: { id: "graveDustPouch", kind: "chance", category: "relics", multiplier: 1.5 }, trinket: true },
  prismCharm: { part: "shards", modifier: { id: "prismCharm", kind: "chance", category: "trinkets", multiplier: 1.5 }, trinket: true },
  architectsSeal: { part: "tatteredInsignia", modifier: { id: "architectsSeal", kind: "chance", category: "blueprints", multiplier: 1.5 }, trinket: true },
  seersCandle: { part: "ritualCandle", modifier: { id: "seersCandle", kind: "chance", category: "manuals", multiplier: 1.5 }, trinket: true },
};
