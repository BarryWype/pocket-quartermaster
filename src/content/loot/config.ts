import type { ValuableBuyer, ValuableRarity } from '@/content/loot/valuables';
import type { LootCategory, LootSourceId, MapRarity } from '@/game/loot/types';
import type { Quality } from '@/game/types';

/** A consumable pick of this id is a lure (herbs and animals near the player), added to `loot.lures`. */
export const LURE_ID = 'lure';

export const lootConfig = {
  /** Base drop chance of each matrix mark; '—' never drops and 'A' always does. */
  markChances: { '—': 0, 'R/2': 0.035, R: 0.07, S: 0.25, O: 0.6, A: 1 } as Record<string, number>,
  /** Tuning hooks: a multiplier per category and per source, all 1 by default. */
  categoryMultipliers: {
    gold: 1,
    xp: 1,
    materials: 1,
    shards: 1,
    blueprints: 1,
    gear: 1,
    trinkets: 1,
    components: 1,
    relics: 1,
    monsterParts: 1,
    valuables: 1,
    consumables: 1,
    treasureMaps: 1,
    manuals: 1,
    keyFragments: 1,
  } as Record<LootCategory, number>,
  sourceMultipliers: {
    dungeonRun: 1,
    firstWin: 1,
    firstTierClear: 1,
    tierBoss: 1,
    overnightQuest: 1,
    patrolGoblins: 1,
    patrolHerd: 1,
    patrolBandits: 1,
    traveller: 1,
    banditCamp: 1,
    goblinRaid: 1,
    beastDen: 1,
    hauntedCrypt: 1,
    elementalRift: 1,
    abandonedCaravan: 1,
    wantedOutlaw: 1,
    monsterLair: 1,
    ruinsDig: 1,
    heist: 1,
    fishingDock: 1,
    treasureSpot: 1,
    sanctum: 1,
    stepChest: 1,
  } as Record<LootSourceId, number>,
  /** No chance, however stacked, goes above this. */
  maxChance: 0.95,
  /** Run-scaled sources: minutes ÷ 45, clamped. Tier bosses and the first win of the day are never scaled. */
  runLength: { sources: ['dungeonRun', 'overnightQuest'] as LootSourceId[], baseMinutes: 45, min: 0.25, max: 2 },
  /** Luck raises non-A chances and gold amounts, never materials or other amounts. */
  luck: { chancePerPoint: 0.01, maxChanceBonus: 0.3, pointsPerQualityStep: 10, goldPerPoint: 0.05 },
  /** Charm effects for the run (see content/loot/charms.ts). */
  charms: { chanceMultiplier: 1.5, luck: 3, goldPercent: 20, xpPercent: 15, qualitySteps: 1 },
  /** Amounts per drop; everything not listed is 1. */
  quantities: {
    materials: [2, 4] as [number, number],
    shards: [2, 4] as [number, number],
    monsterParts: [1, 2] as [number, number],
    monsterPartsOnA: [2, 3] as [number, number],
  },
  /** Gear tier: these sources give the source's tier, all others the player's (70%) or one below (30%). */
  dungeonSources: ['dungeonRun', 'firstWin', 'firstTierClear', 'tierBoss', 'overnightQuest'] as LootSourceId[],
  gearTier: { playerTierShare: 0.7 },
  /**
   * A materials drop picks one option uniformly: a fixed material list, plus
   * "cache" where marked, which draws one pickaxe-covered resource weighted
   * by its `weight` (ore, stone or wood, never herbs or animals).
   */
  materialThemes: {
    patrolGoblins: { materials: ['herb', 'berries', 'mushroom'] },
    patrolHerd: { materials: ['meat', 'hide', 'bone'] },
    beastDen: { materials: ['meat', 'hide', 'bone'] },
    hauntedCrypt: { materials: ['bone'] },
    traveller: { materials: ['herb', 'berries', 'mushroom'] },
    patrolBandits: { cache: true },
    banditCamp: { cache: true },
    goblinRaid: { cache: true },
    abandonedCaravan: { cache: true },
    treasureSpot: { cache: true },
    monsterLair: { materials: ['hide', 'bone'], cache: true },
    ruinsDig: { materials: ['stone'], cache: true },
    fishingDock: { materials: ['fish'] },
    stepChest: { materials: ['wood', 'hide', 'herb', 'berries', 'bone', 'meat', 'mushroom'] },
  } as Partial<Record<LootSourceId, { materials?: string[]; cache?: boolean }>>,
  /** Quality ladders, read with d20 + bonus; floors then lift a source's minimum. */
  gearQuality: {
    ladders: {
      basic: [
        [5, 'crappy'],
        [14, 'normal'],
        [Infinity, 'uncommon'],
      ] as [number, Quality][],
      big: [
        [4, 'crappy'],
        [12, 'normal'],
        [18, 'uncommon'],
        [Infinity, 'rare'],
      ] as [number, Quality][],
      boss: [
        [3, 'crappy'],
        [10, 'normal'],
        [16, 'uncommon'],
        [19, 'rare'],
        [Infinity, 'legendary'],
      ] as [number, Quality][],
    },
    ladderBySource: {
      tierBoss: 'boss',
      monsterLair: 'boss',
      firstTierClear: 'big',
      wantedOutlaw: 'big',
      banditCamp: 'big',
    } as Partial<Record<LootSourceId, 'basic' | 'big' | 'boss'>>,
    floors: { firstTierClear: 'uncommon', monsterLair: 'rare' } as Partial<Record<LootSourceId, Quality>>,
  },
  treasureMaps: {
    rarityWeights: { common: 70, rare: 25, legendary: 5 } as Record<MapRarity, number>,
    distanceMeters: { common: [200, 800], rare: [800, 1500], legendary: [1500, 3000] } as Record<MapRarity, [number, number]>,
    /** Applies to non-A chances and gold at the treasure spot. */
    lootMultiplier: { common: 1, rare: 1.5, legendary: 2.5 } as Record<MapRarity, number>,
    legendaryOnly: ['relics', 'components'] as LootCategory[],
  },
  manuals: {
    rarityWeights: { common: 70, rare: 25, legendary: 5 } as Record<MapRarity, number>,
    xpPerTier: { common: 60, rare: 150, legendary: 400 } as Record<MapRarity, number>,
    /** The highest hero level a manual of the player's tier can reach. */
    topLevelByTier: [3, 6, 9, 12, 15] as number[],
  },
  stepChests: { thresholds: [2000, 5000, 8000, 12000], chanceMultipliers: [1, 1, 1.5, 1.5] },
  /** Weighted consumable pool; `tiers` is the player tier range the item drops in. */
  consumables: [
    { itemId: 'healingPotion', weight: 3, tiers: [1, 2] },
    { itemId: 'standardHealingPotion', weight: 3, tiers: [3, 4] },
    { itemId: 'greaterHealingPotion', weight: 3, tiers: [5, 5] },
    { itemId: 'strengthDraught', weight: 1, tiers: [1, 5] },
    { itemId: 'arcaneTonic', weight: 1, tiers: [1, 5] },
    { itemId: 'ironskinBrew', weight: 1, tiers: [1, 5] },
    { itemId: 'nullrootTincture', weight: 1, tiers: [1, 5] },
    { itemId: 'quicksilver', weight: 1, tiers: [1, 5] },
    { itemId: 'firebomb', weight: 1, tiers: [1, 5] },
    { itemId: 'smokeBomb', weight: 1, tiers: [1, 5] },
    { itemId: 'emberWardSalve', weight: 0.5, tiers: [1, 5] },
    { itemId: 'tideWardSalve', weight: 0.5, tiers: [1, 5] },
    { itemId: 'stormWardSalve', weight: 0.5, tiers: [1, 5] },
    { itemId: 'stoneWardSalve', weight: 0.5, tiers: [1, 5] },
    { itemId: 'thornWardSalve', weight: 0.5, tiers: [1, 5] },
    { itemId: 'roguesRoll', weight: 0.5, tiers: [1, 5] },
    { itemId: 'huntersPack', weight: 0.5, tiers: [1, 5] },
    { itemId: 'explorersKit', weight: 0.5, tiers: [1, 5] },
    { itemId: 'healersSatchel', weight: 0.5, tiers: [1, 5] },
    { itemId: 'giftBasket', weight: 0.5, tiers: [1, 5] },
    { itemId: 'lantern', weight: 0.5, tiers: [1, 5] },
    { itemId: 'holyRelics', weight: 0.5, tiers: [1, 5] },
    { itemId: 'scholarsSatchel', weight: 0.5, tiers: [1, 5] },
    { itemId: 'trailMix', weight: 1, tiers: [1, 5] },
    { itemId: 'jerky', weight: 1, tiers: [1, 5] },
    { itemId: 'foragersTonic', weight: 0.5, tiers: [1, 5] },
    { itemId: 'huntersMusk', weight: 0.5, tiers: [1, 5] },
    { itemId: 'prospectorsDraught', weight: 0.5, tiers: [1, 5] },
    { itemId: 'trackersEye', weight: 0.5, tiers: [1, 5] },
    { itemId: LURE_ID, weight: 1, tiers: [1, 5] },
  ],
  /**
   * Gold and XP a drop is worth, as shares of the tier's short dungeon (gold
   * average, XP per hero). Dungeon runs, bosses and quests pay their own
   * dungeon's gold and XP instead; the two bonus rows use `bonusRows`.
   */
  amounts: {
    patrolGoblins: { gold: 1, xp: 0.25 },
    patrolHerd: { gold: 0.5, xp: 0.25 },
    patrolBandits: { gold: 1.5, xp: 0.25 },
    traveller: { gold: 1, xp: 0 },
    banditCamp: { gold: 2, xp: 0.3 },
    goblinRaid: { gold: 0.5, xp: 0.3 },
    beastDen: { gold: 0.5, xp: 0.3 },
    hauntedCrypt: { gold: 0.5, xp: 0.3 },
    elementalRift: { gold: 0, xp: 0.3 },
    abandonedCaravan: { gold: 1, xp: 0.3 },
    wantedOutlaw: { gold: 3, xp: 0.3 },
    monsterLair: { gold: 6, xp: 0.3 },
    ruinsDig: { gold: 0, xp: 0 },
    heist: { gold: 2, xp: 0 },
    fishingDock: { gold: 0, xp: 0 },
    treasureSpot: { gold: 2.5, xp: 0 },
    sanctum: { gold: 0, xp: 0.5 },
    stepChest: { gold: 2, xp: 0 },
  } as Partial<Record<LootSourceId, { gold: number; xp: number }>>,
  /** The day's first win and a new tier's first clear: shares of the dungeon's top gold and its XP. */
  bonusRows: { firstWin: { gold: 1, xp: 0.5 }, firstTierClear: { gold: 1, xp: 0.5 } },
  /** Elite patrols pay this many times the gold and XP. */
  eliteMultiplier: 2,
  /** Treasure maps last this long once found. */
  treasureMapHours: 48,
  /** Valuables: rarity weights of a drop, where they sell and the market's daily collector. */
  valuables: {
    rarityWeights: { common: 70, uncommon: 25, rare: 5 } as Record<ValuableRarity, number>,
    /** Full price here, `elsewhereShare` at every other buyer. */
    fullPriceAt: ['market', 'thievesGuild'] as ValuableBuyer[],
    elsewhereShare: 0.5,
    buyers: ['market', 'thievesGuild', 'smithy', 'huntingLodge', 'apothecary', 'trader'] as ValuableBuyer[],
    collectorMultiplier: 2,
    /** Weight of each valuable in the collector's daily pick; others weigh 1. */
    collectorWeights: { oldCoins: 2 } as Record<string, number>,
  },
  /** A valuable's price is its base price times this, by the source's tier: the enemy strength curve. */
  valuablePriceByTier: [1, 1.9, 3, 4.2, 5.6] as number[],
  /** Blueprint drops: weight by how many roster heroes favour the type; a complete tier gives mastery progress, or a component with `componentShare`. */
  blueprints: { favourWeights: [1, 2, 3], tierCompleteForges: 2, componentShare: 0 },
  /** Key fragments needed for one mysterious key. */
  keyFragmentsPerKey: 4,
  /** Sigil drops by slot, with a pity counter and a shard cap per tier. */
  sigils: { chanceBySlot: { short: 0.09, long: 0.23, boss: 0.46 }, pityAfter: 10, cap: 3, capShardsPerTier: 2 },
};

