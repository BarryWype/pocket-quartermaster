import type { ImageSourcePropType } from 'react-native';

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

export type WeaponType = 'sword' | 'wand' | 'bow';

export type EquipmentSlot = 'weapon' | 'armor' | 'consumable';

type ItemBase = {
  id: string;
  name: string;
  emoji: string;
  icon?: ImageSourcePropType;
};

export type GearDef = ItemBase & {
  slot: 'weapon' | 'armor';
  weaponType?: WeaponType;
  stats: Partial<Stats>;
  maxDurability: number;
};

export type ConsumableDef = ItemBase & {
  slot: 'consumable';
  /** Share of max HP restored when used. */
  heal?: number;
  /** When a healing consumable is used: below the HP threshold, or before the boss. */
  when?: 'lowHp' | 'beforeBoss';
  /** Element (or trap) this consumable protects its hero against for the whole run. */
  protectsAgainst?: string;
};

/** Owned by the player rather than a hero; never wears out. */
export type ToolDef = ItemBase & {
  slot: 'tool';
  toolType: 'pickaxe';
  /** Mines resources whose `pickaxeTier` is at most this. */
  tier: number;
};

export type ItemDef = GearDef | ConsumableDef | ToolDef;

export type RecipeDef = {
  id: string;
  station: 'forge' | 'alchemy';
  /** A crafted item, or a material for smelting recipes. */
  output: { itemId: string } | { materialId: string; amount: number };
  inputs: MaterialStack[];
  unlockedByDefault: boolean;
  /** Recipes learned the first time this one is crafted. */
  unlocks?: string[];
};

export type HeroClassId = 'warrior' | 'archer' | 'fireMage';

export type HeroClassDef = {
  name: string;
  emoji: string;
  baseStats: Stats;
  /** Added per level above 1. */
  growth: Stats;
  /** Multiplier on a weapon's stats when this class wields it. */
  affinities: Partial<Record<WeaponType, number>>;
  /** Elements this class takes no extra damage from. */
  resists?: string[];
  /** Relative chance of being the one enemies attack; tanks have more. */
  threat: number;
  /** Abilities traps and events can check, e.g. 'spotTraps'. None yet. */
  traits?: string[];
};

export type HeroState = {
  id: string;
  name: string;
  classId: HeroClassId;
  level: number;
  /** XP towards the next level. */
  xp: number;
  equipment: {
    weapon: string | null;
    armor: string | null;
    /** Consumable item id; equipping one takes it out of the stock. */
    consumable: string | null;
  };
};

/** A crafted piece of gear; each one wears down on its own. */
export type GearInstance = {
  uid: string;
  itemId: string;
  durability: number;
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
  element?: string;
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
      element?: string;
      /** A class trait or consumable protection that avoids it. */
      avoidedBy?: string;
    }
  | { type: 'event'; eventId: string }
);

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
  /** The tier's last dungeon; beating it reveals the next tier. */
  isBoss?: boolean;
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
  /** Durability lost per equipped gear piece. */
  durabilityLoss: [min: number, max: number];
  /** Rolled once; amounts are scaled by the share of encounters cleared. */
  loot: LootEntry[];
  /** Only dropped when the boss is beaten. */
  recipeDrops: { recipeId: string; chance: number }[];
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
  /** HP each hero came back with, for injuries later. */
  heroHp: { heroId: string; hp: number; maxHp: number }[];
  gold: number;
  materials: MaterialStack[];
  recipeId: string | null;
  xp: number;
  consumablesUsed: string[];
  /** Item ids of gear that broke. */
  brokenGear: string[];
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
  /** Chance to teach one alchemy recipe the player does not know yet. */
  recipeChance: number;
};
