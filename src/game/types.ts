export type MaterialStack = {
  materialId: string;
  amount: number;
};

export type MaterialDef = {
  id: string;
  name: string;
  emoji: string;
};

export type Stats = {
  attack: number;
  defense: number;
  magic: number;
  hp: number;
};

export type WeaponType = 'sword' | 'dagger' | 'knife' | 'wand' | 'bow';

export type EquipmentSlot = 'weapon' | 'armor' | 'consumable';

type ItemBase = {
  id: string;
  name: string;
  emoji: string;
};

export type GearDef = ItemBase & {
  slot: 'weapon' | 'armor';
  weaponType?: WeaponType;
  stats: Partial<Stats>;
  maxDurability: number;
};

export type ConsumableDef = ItemBase & {
  slot: 'consumable';
  /** Flat bonus to the hero's power for one expedition. */
  power: number;
  /** Dungeon hazard this consumable protects against. */
  protectsAgainst?: string;
};

export type ItemDef = GearDef | ConsumableDef;

export type RecipeDef = {
  id: string;
  station: 'forge' | 'alchemy';
  itemId: string;
  inputs: MaterialStack[];
  unlockedByDefault: boolean;
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
  /** Dungeon hazards this class ignores. */
  resists?: string[];
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
  notificationId: string | null;
};

export type LootEntry = {
  materialId: string;
  min: number;
  max: number;
  chance: number;
};

export type DungeonDef = {
  id: string;
  name: string;
  emoji: string;
  durationMinutes: number;
  /** Team power that gives a 50% success chance. */
  difficulty: number;
  /** Heroes without protection lose power here, e.g. 'fire'. */
  hazard?: string;
  enemies: string[];
  boss: string;
  gold: [min: number, max: number];
  /** XP per hero on success; failures give a share of it. */
  xp: number;
  /** Durability lost per equipped gear piece. */
  durabilityLoss: [min: number, max: number];
  loot: LootEntry[];
  recipeDrops: { recipeId: string; chance: number }[];
};

export type ExpeditionReport = {
  id: string;
  dungeonId: string;
  heroIds: string[];
  finishedAt: number;
  success: boolean;
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
  /** Chance to teach one recipe the player does not know yet. */
  recipeChance: number;
};
