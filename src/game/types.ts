import type { ImageSourcePropType } from 'react-native';

import type { Element } from './elements';

export type MaterialStack = {
  materialId: string;
  amount: number;
};

export type MaterialDef = {
  id: string;
  name: string;
  emoji: string;
  icon?: ImageSourcePropType;
};

export type Stats = {
  attack: number;
  defense: number;
  magic: number;
  hp: number;
};

export type WeaponType = 'sword' | 'wand' | 'bow' | 'axe' | 'mace' | 'dagger' | 'staff' | 'instrument';

export type Quality = 'crappy' | 'normal' | 'rare' | 'legendary';

/** What forging mastery is tracked by: each weapon type, plus armour. */
export type MasteryType = WeaponType | 'armour';

export type MasteryState = { level: number; progress: number };

export type EquipmentSlot = 'weapon' | 'armor' | 'consumable';

type ItemBase = {
  id: string;
  name: string;
  emoji: string;
  description?: string;
  icon?: ImageSourcePropType;
};

export type GearDef = ItemBase & {
  slot: 'weapon' | 'armor';
  weaponType?: WeaponType;
  stats: Partial<Stats>;
  /** Material tier: wood 1 … steel 5. */
  tier: number;
};

/** A charm in a hero's consumable slot: lasts one expedition. */
export type Charm =
  | { kind: 'crit'; chance: number }
  /** Party gold multiplier; several Lucky teeth count once. */
  | { kind: 'gold'; multiplier: number }
  /** The hero ignores the first trap that would hit them. */
  | { kind: 'wardTrap' };

export type ConsumableDef = ItemBase & {
  slot: 'consumable';
  /** Share of max HP restored when used. */
  heal?: number;
  /** Healing consumables are drunk below the HP threshold. */
  when?: 'lowHp';
  /** Element this consumable protects its hero against for the whole run. */
  protectsAgainst?: Element;
  charm?: Charm;
};

/** What a meal does for the run; one meal per expedition. */
export type MealEffect =
  /** Heals every conscious hero this share of max HP before the boss. */
  | { kind: 'bossHeal'; pct: number }
  | { kind: 'xp'; multiplier: number }
  | { kind: 'gold'; multiplier: number }
  | { kind: 'duration'; multiplier: number }
  /** Added to the retreat multiplier of a failed run's rewards, up to a full clear. */
  | { kind: 'retreat'; bonus: number };

/** A party-wide kit: stands in once for a missing class counter. */
export type KitEffect =
  | { kind: 'obstacle'; obstacle: ObstacleKind }
  /** Chance to calm the first all-beast fight. */
  | { kind: 'calmBeasts'; chance: number }
  /** The first locals react as if charmed. */
  | { kind: 'charmLocals' }
  /** Damage multiplier against undead in the first undead fight. */
  | { kind: 'undeadDamage'; multiplier: number };

/** Food and kits: held in the stock, taken by the whole party. */
export type ProvisionDef = ItemBase & {
  slot: 'provision';
  /** Supply points it covers. */
  supply?: number;
  meal?: MealEffect;
  kit?: KitEffect;
};

/** Owned by the player rather than a hero; never wears out. */
export type ToolDef = ItemBase & {
  slot: 'tool';
  toolType: 'pickaxe';
  /** Mines resources whose `pickaxeTier` is at most this. */
  tier: number;
};

export type ItemDef = GearDef | ConsumableDef | ToolDef | ProvisionDef;

export type RecipeDef = {
  id: string;
  station: 'forge' | 'provisions';
  /** The Provisions station's tab. */
  tab?: 'kitchen' | 'alchemy';
  /** A crafted item, or a material for smelting recipes. */
  output: { itemId: string } | { materialId: string; amount: number };
  inputs: MaterialStack[];
  unlockedByDefault: boolean;
  /** Recipes learned the first time this one is crafted. */
  unlocks?: string[];
};

export type HeroClassId =
  | 'warrior'
  | 'ranger'
  | 'fireMage'
  | 'frostMage'
  | 'thief'
  | 'barbarian'
  | 'cleric'
  | 'paladin'
  | 'druid'
  | 'troubadour'
  | 'sorcerer';

export type ClassRarity = 'common' | 'uncommon';

/** What a dungeon's encounters are made of; heroes with matching abilities counter them. */
export type Tag = 'undead' | 'beast' | 'trap' | 'obstacle' | 'locals' | Element;

export type ObstacleKind = 'rubble' | 'locked' | 'barricade';

export type LocalsReactionKey = 'charm' | 'provoke' | 'pickpocket';

/**
 * A class ability: one of a few effects the simulation knows. Party-wide ones
 * (disarm, calm, obstacles, locals) work if any conscious hero has them.
 */
export type Ability =
  | { kind: 'damageVsTag'; tag: Tag; multiplier: number }
  /** Chance per trap to skip it for the whole party. */
  | { kind: 'trapDisarm'; chance: number }
  /** Trap damage to the party is multiplied by this. */
  | { kind: 'trapReduce'; multiplier: number }
  | { kind: 'obstacleSolve'; kinds: ObstacleKind[] }
  /** Chance per all-beast fight to skip it. */
  | { kind: 'calmBeasts'; chance: number }
  | { kind: 'localsReaction'; key: LocalsReactionKey }
  /** After each encounter, conscious heroes regain this share of max HP. */
  | { kind: 'partyHeal'; pct: number }
  /** This share of the damage aimed at the most hurt ally is taken by this hero instead. */
  | { kind: 'protect'; share: number }
  /** Damage multiplier while this hero is below the HP share. */
  | { kind: 'rage'; belowPct: number; multiplier: number }
  /** Damage multiplier for the whole party while this hero is conscious; the best one applies. */
  | { kind: 'partyDamageBuff'; multiplier: number }
  | { kind: 'critBonus'; chance: number }
  /** Gold from cache events is multiplied by this. */
  | { kind: 'cacheBonus'; multiplier: number }
  /** Replaces the elemental advantage multiplier for this hero's attacks. */
  | { kind: 'elementalAdvantage'; multiplier: number }
  // Personal traits. Party-wide ones count once per trait, however many heroes have it.
  | { kind: 'statMultiplier'; stat: keyof Stats; multiplier: number }
  | { kind: 'goldMultiplier'; multiplier: number }
  | { kind: 'xpMultiplier'; multiplier: number }
  /** Ambushes don't get the first strike. */
  | { kind: 'ambushAlert' }
  /** Hunter's stew heals this hero this much more. */
  | { kind: 'stewBoost'; multiplier: number }
  /** Damage this hero takes is multiplied by this. */
  | { kind: 'damageTaken'; multiplier: number }
  /** Healing at home is multiplied by `multiplier`; exhaustion lasts `exhaustion` times as long. */
  | { kind: 'healRate'; multiplier: number; exhaustion: number }
  /** Added to the supply points this hero needs (never below 0). */
  | { kind: 'supplyNeed'; add: number }
  /** Underfed and Starving penalties are multiplied by this for this hero. */
  | { kind: 'hungerResist'; multiplier: number }
  /** Trap trigger chance multiplier. */
  | { kind: 'trapTrigger'; multiplier: number }
  /** Added to the share of max HP below which this hero drinks a potion. */
  | { kind: 'potionThreshold'; add: number }
  /** Locals who would ignore the party attack with this chance; pickpockets get noticed more. */
  | { kind: 'hostileLocals'; chance: number; noticeBonus: number };

export type TraitDef = {
  id: string;
  name: string;
  description: string;
  /** Positive traits make a recruit dearer, negative ones cheaper. */
  positive: boolean;
  effects: Ability[];
};

export type HeroClassDef = {
  name: string;
  emoji: string;
  rarity: ClassRarity;
  /** Its attacks use this element unless its weapon is infused. */
  element?: Element;
  baseStats: Stats;
  /** Added per level above 1. */
  growth: Stats;
  /** The weapon types this class can use, with the multiplier on their stats. Armour is open to all. */
  affinities: Partial<Record<WeaponType, number>>;
  /** Elements this class takes no extra damage from. */
  resists?: Element[];
  /** Relative chance of being the one enemies attack; tanks have more. */
  threat: number;
  abilities: Ability[];
};

export type HeroState = {
  id: string;
  name: string;
  classId: HeroClassId;
  /** Personal trait id (see content/traits.ts). */
  trait: string;
  level: number;
  /** XP towards the next level. */
  xp: number;
  equipment: {
    weapon: string | null;
    armor: string | null;
    /** Consumable item id (potion, elixir or charm); equipping one takes it out of the stock. */
    consumable: string | null;
  };
  /** HP at `hpAt`; missing means full. Heroes at home heal from then on (see team/health.ts). */
  hp?: number;
  hpAt?: number;
  /** Knocked out: no healing at home before this time. */
  exhaustedUntil?: number;
};

/** Supply at launch: enough, some, or none. */
export type Hunger = 'fed' | 'underfed' | 'starving';

/** A forged piece of gear. */
export type GearInstance = {
  uid: string;
  itemId: string;
  quality: Quality;
  /**
   * Stat roll factor (see rollRules): multiplies the piece's stats together
   * with its quality. Set by every forge; gear from before rolls counts as 1.
   */
  roll?: number;
  /** Infused element; a piece can only be infused once. */
  element?: Element;
};

export type ActiveExpedition = {
  id: string;
  dungeonId: string;
  heroIds: string[];
  startedAt: number;
  endsAt: number;
  /** Seed for the resolution so it gives the same result whenever it runs. */
  seed: string;
  /** The tutorial's first expedition always succeeds. */
  guaranteed?: boolean;
  /** The daily modifier the dungeon had at launch, kept if the rotation changes. */
  modifierId?: string | null;
  /** Supply status at launch. */
  hunger?: Hunger;
  /** Supply points taken. */
  supplyUsed?: number;
  /** Meal eaten (provision item id). */
  mealId?: string | null;
  /** Kit taken; it comes back if it never triggers. */
  kitId?: string | null;
  notificationId: string | null;
};

export type LootEntry = {
  materialId: string;
  min: number;
  max: number;
  chance: number;
};

export type MobDef = {
  id: string;
  name: string;
  hp: number;
  /** Damage per round before the target's defense. */
  damage: number;
  element?: Element;
  /** E.g. undead or beast; the element is a tag too, added by `mobTags`. */
  tags: Tag[];
};

export type BossDef = MobDef & {
  /** `enrage`: hits harder below half HP. `sweep`: hits every hero each round, a bit softer. */
  effect?: 'enrage' | 'sweep';
};

export type MobGroup = { mobId: string; count: number };

export type EncounterDef = { weight: number } & (
  | { type: 'fight'; mobs: MobGroup[] }
  | {
      type: 'trap';
      name: string;
      /** Share of max HP lost by each hero it catches. */
      damagePct: number;
      targets: 'one' | 'all';
      triggerChance: number;
      element?: Element;
    }
  | { type: 'event'; eventId: string }
  /** Solved for free by a hero with the ability; otherwise costs HP and maybe a detour fight. */
  | { type: 'obstacle'; name: string; kind: ObstacleKind; hpCostPct: number; detourChance: number }
  | { type: 'locals'; npcId: string }
);

/** How locals help a party that charms them. */
export type NpcHelp =
  | { kind: 'heal'; pct: number }
  /** This share of the dungeon's top gold reward. */
  | { kind: 'gold'; share: number }
  /** The party skips the next trap. */
  | { kind: 'tip' };

export type NpcDef = {
  id: string;
  name: string;
  description: string;
  help: NpcHelp;
  /** What they turn into when provoked or caught: scaled to the dungeon's tier in `enemies.ts`. */
  hostile: { name: string; count: number; hp: number; damage: number };
};

/** A daily twist on one dungeon. Only adjusts data; needs every tag in `requires`. */
export type DungeonModifier = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  requires: Tag[];
  /** Encounters with this tag get their weight multiplied. */
  boost?: { tag: Tag; multiplier: number };
  /** Every enemy takes this element. */
  enemyElement?: Element;
  gold?: number;
  materials?: number;
};

export type EventDef = { id: string; name: string } & (
  | { kind: 'spring'; healPct: number }
  /** Bonus gold: this share of the dungeon's top gold reward. */
  | { kind: 'cache'; goldShare: number }
  /** One of the dungeon's fights, with the enemies striking first. */
  | { kind: 'ambush' }
);

export type ExpeditionOutcome = 'flawless' | 'success' | 'retreat' | 'defeat';

export type DungeonDef = {
  id: string;
  name: string;
  emoji: string;
  /** Tier N shows up once the tier N-1 boss has been beaten. */
  tier: number;
  /** The tier's last dungeon; beating it reveals the next tier. Always available. */
  isBoss?: boolean;
  /** Regular dungeons rotate daily: one `short` (farm) and one `long` slot per tier. */
  slot?: 'short' | 'long';
  /** An overnight quest: open every day alongside the rotation, not part of it. */
  overnight?: boolean;
  /** Set by a daily modifier. */
  enemyElement?: Element;
  rewardMultipliers?: { gold: number; materials: number };
  modifierId?: string;
  durationMinutes: number;
  /** Number of encounters, boss included. */
  encounterCount: [min: number, max: number];
  /** Weighted pool the encounters before the boss are drawn from. */
  encounters: EncounterDef[];
  boss: BossDef;
  /** Full reward for beating the boss; retreats get the cleared share. */
  gold: [min: number, max: number];
  /** XP per hero for beating the boss; retreats get the cleared share. */
  xp: number;
  /** Rolled once; amounts are scaled by the share of encounters cleared. */
  loot: LootEntry[];
  /** Only dropped when the boss is beaten. */
  recipeDrops: { recipeId: string; chance: number }[];
  /** Chance a successful run rolls one main reward from the pool. */
  mainRewardChance: number;
  /** Chance of a second main reward on top (boss dungeons). */
  mainRewardExtraRollChance?: number;
};

export type MainRewardKind = 'goldPouch' | 'sigil' | 'treasureMap' | 'lure';

/** A main reward as granted; a Sigil at its cap turns into shards, a map at its cap into a little gold. */
export type MainReward =
  | { kind: 'goldPouch'; gold: number }
  | { kind: 'sigil'; tier: number }
  | { kind: 'treasureMap'; mapId: string; tier: number }
  | { kind: 'lure' }
  | { kind: 'shards'; element: Element; amount: number }
  | { kind: 'mapGold'; gold: number };

export type TreasureMap = {
  id: string;
  /** Tier of the dungeon that dropped it; sets the loot. */
  tier: number;
  expiresAt: number;
  /** Set when the map is first read, from where the player stood. */
  location: { latitude: number; longitude: number } | null;
};

export type ActiveLure = {
  id: string;
  activatedAt: number;
  center: { latitude: number; longitude: number };
};

export type SanctumDef = {
  id: string;
  name: string;
  element: Element;
  emoji: string;
  description: string;
  guardian: { name: string; description: string; effect?: BossDef['effect'] };
  /** Names of the guardian's minions, weakest first. */
  minions: [string, string];
};

export type ExpeditionReport = {
  id: string;
  dungeonId: string;
  heroIds: string[];
  finishedAt: number;
  outcome: ExpeditionOutcome;
  /** Boss beaten (flawless or success). */
  success: boolean;
  encountersCleared: number;
  encounterCount: number;
  /** HP each hero set out with (`before`) and came back with. */
  heroHp: { heroId: string; hp: number; maxHp: number; before?: number }[];
  hunger?: Hunger;
  supplyUsed?: number;
  mealId?: string | null;
  kitId?: string | null;
  /** The kit triggered and was used up. */
  kitUsed?: boolean;
  /** Extra rewards rolled on success, besides gold, loot and recipes. */
  mainRewards: MainReward[];
  gold: number;
  materials: MaterialStack[];
  recipeId: string | null;
  xp: number;
  consumablesUsed: string[];
  /** Bonus for the first win in a pool dungeon. */
  firstClear?: { gold: number; xp: number };
  /** The blueprint taught by the day's first win in a pool dungeon. */
  dailyBlueprint?: string;
  /** A Guild Hall charter, for the first win against a tier boss. */
  charter?: boolean;
  log: string[];
  seen: boolean;
};

export type ChestDef = {
  id: string;
  name: string;
  emoji: string;
  steps: number;
  gold: [min: number, max: number];
  loot: LootEntry[];
  /** Chance to teach one Provisions recipe the player does not know yet. */
  recipeChance: number;
};
