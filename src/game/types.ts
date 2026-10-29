import type { ImageSourcePropType } from 'react-native';

import type { PlaceKind } from '@/content/places';

import type { Element } from './elements';
import type { LatLng } from './generation/types';

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

/** The eight combat stats; evasion and crit are % points. */
export type StatKey = 'hp' | 'power' | 'magic' | 'armour' | 'resistance' | 'evasion' | 'speed' | 'crit';
export type Stats = Record<StatKey, number> & { luck: number };
/** The stat a hero's hits roll with: Power for weapons, Magic for wands, staves and lutes. */
export type DamageStat = 'power' | 'magic';
/** An enemy's pace, turned into a Speed by its tier (see enemySpeedRules). */
export type SpeedClass = 'slow' | 'normal' | 'fast';

/**
 * A recruit's 3d6 roll (sums 3–18; a missing roll means 10.5 everywhere, the
 * average): each sum pulls the stat's base value and growth up or down (see
 * team/stats.ts).
 */
export type HeroRoll = {
  base: Record<StatKey, number>;
  growth: Record<StatKey, number>;
  /** The 10% chance of +1 on a random approach. */
  approach?: Approach;
  /** The Gambler's third primary stat, rolled at recruitment. */
  primary?: StatKey;
};

export type WeaponType =
  | 'sword'
  | 'axe'
  | 'mace'
  | 'dagger'
  | 'bow'
  | 'spear'
  | 'warhammer'
  | 'wand'
  | 'staff'
  | 'lute'
  | 'censer'
  | 'knuckles';
export type ArmourType = 'plate' | 'mail' | 'leather' | 'robes';
export type OffhandType = 'shield' | 'buckler' | 'offhandBlade' | 'quiver' | 'tome' | 'focus';

/** Every gear type; also the mastery key. */
export type GearType = WeaponType | ArmourType | OffhandType;

export type Quality = 'crappy' | 'normal' | 'rare' | 'legendary';

/** What forging mastery is tracked by: each gear type. */
export type MasteryType = GearType;

export type MasteryState = { level: number; progress: number };

/** `potion` is the Alchemist's second slot, for healing consumables only. */
export type EquipmentSlot = 'weapon' | 'armor' | 'offhand' | 'trinket' | 'consumable' | 'potion';

type ItemBase = {
  id: string;
  name: string;
  emoji: string;
  description?: string;
  icon?: ImageSourcePropType;
};

export type GearDef = ItemBase & {
  slot: 'weapon' | 'armor' | 'offhand' | 'trinket';
  /** The gear type (also the mastery key); trinkets have none. */
  gearType?: GearType;
  stats: Partial<Stats>;
  /** Material tier: wood 1 … steel 5. */
  tier: number;
  /** A weapon that takes the off-hand slot: warhammer, staff. */
  twoHanded?: boolean;
  /** Combat keywords the piece carries (see gear-keywords.csv). */
  keywords: Keyword[];
  /** The Speed malus is in the profile; threat penalties count double. */
  heavy?: boolean;
  /** Counts as concealed on Sacred ground. */
  concealed?: boolean;
  /** The stat the piece's damage rolls with, for weapons and damage off-hands. */
  damageStat?: DamageStat;
};

/** A charm in a hero's consumable slot: lasts one expedition. */
export type Charm =
  | { kind: 'crit'; chance: number }
  /** Party gold multiplier; several Lucky teeth count once. */
  | { kind: 'gold'; multiplier: number };

/** What a hero consumable does for the run (see expeditions/simulate.ts). */
export type Elixir =
  | { kind: 'stat'; stat: 'power' | 'magic' | 'armour' | 'resistance'; multiplier: number }
  | { kind: 'speed'; add: number }
  /** Before the run's first fight, fire damage to every enemy (tier-1 strength, scaled like enemies). */
  | { kind: 'firebomb'; damage: number }
  /** Infuses the hero's weapon for the run, replacing a permanent infusion. */
  | { kind: 'oil'; element: Element }
  /** Instead of a knock-out, the party escapes: the run ends as a retreat with this loot bonus. */
  | { kind: 'smokeBomb'; retreatBonus: number }
  /** Once per run, a knocked-out carrier gets back up with this share of max HP. */
  | { kind: 'revive'; hp: number };

export type ConsumableDef = ItemBase & {
  slot: 'consumable';
  /** Share of max HP restored when used. */
  heal?: number;
  /** Healing consumables are drunk below the HP threshold. */
  when?: 'lowHp';
  /** Element this consumable protects its hero against for the whole run. */
  protectsAgainst?: Element;
  /** A kit: what it gives its carrier against threats. */
  kit?: KitEffect;
  charm?: Charm;
  elixir?: Elixir;
  /** The boss id this weakness item weakens when its carrier meets that boss. */
  weakness?: string;
};

/** What a meal does for the run; one meal per expedition. */
export type MealEffect =
  /** Heals every conscious hero this share of max HP before the boss. */
  | { kind: 'bossHeal'; pct: number }
  | { kind: 'xp'; multiplier: number }
  | { kind: 'gold'; multiplier: number }
  | { kind: 'duration'; multiplier: number }
  /** Added to the retreat multiplier of a failed run's rewards, up to a full clear. */
  | { kind: 'retreat'; bonus: number }
  | { kind: 'maxHp'; multiplier: number }
  /** Opportunity rewards are multiplied by this. */
  | { kind: 'opportunity'; multiplier: number }
  | { kind: 'speed'; add: number }
  | { kind: 'resistance'; multiplier: number }
  /** Crit chance in % points added to every hero. */
  | { kind: 'crit'; add: number }
  /** The penalties of these threats are multiplied by this. */
  | { kind: 'penaltyCut'; threats: ThreatId[]; multiplier: number };

/** What a hero can bring to bear on a threat. */
export type Approach = 'might' | 'finesse' | 'wits' | 'faith' | 'presence';

/** Keywords answer keyword threats; classes, traits, gear and kits give them. */
export type Keyword =
  | 'light'
  | 'watchful'
  | 'calm'
  | 'antidote'
  | 'pierce'
  | 'cleave'
  | 'blessed'
  | 'guard'
  | 'parry'
  | 'reach'
  | 'stagger'
  | 'brace'
  | 'channel'
  | 'inspire'
  | 'mend';

export type ThreatId =
  | 'traps'
  | 'element'
  | 'beasts'
  | 'undead'
  | 'brute'
  | 'rubble'
  | 'poison'
  | 'locals'
  | 'swarm'
  | 'darkness'
  | 'locked'
  | 'desecrated'
  | 'casters'
  | 'ambush'
  | 'thieves'
  | 'armoured'
  | 'puzzle'
  | 'maze'
  | 'underwater';

export type ThreatCategory = 'environment' | 'obstacle' | 'holy' | 'enemy' | 'social';

/** Light, strong or extreme: higher levels need better answers and bite harder when missed. */
export type ThreatLevel = 1 | 2 | 3;

export type RestrictionId =
  | 'antiMagic'
  | 'sacredGround'
  | 'noHealing'
  | 'cursedLuck'
  | 'thickFog'
  | 'barren'
  | 'narrowPassages'
  | 'spoiledStores';

export type OpportunityId =
  | 'healingSpring'
  | 'hiddenCache'
  | 'richVein'
  | 'bounty'
  | 'prisoners'
  | 'refugees'
  | 'forgottenShrine'
  | 'oldInscriptions'
  | 'trophyBeast';

/** What meets a threat: the best hero's approach score, the number of heroes with a keyword, or with Resist(element). */
export type ThreatAnswer =
  | { kind: 'approach'; approach: Approach }
  | { kind: 'keyword'; keyword: Keyword }
  | { kind: 'resist' };

/** One effect of a missed threat. A half penalty halves every number (see "Half penalties"). */
export type ThreatPenalty =
  /** Enemies strike first in the first `fights` fights, or in all of them. */
  | { kind: 'exposed'; fights: number | 'all' }
  /** Party damage × (1 − pct). */
  | { kind: 'weakened'; pct: number }
  /** Share of max HP lost by each hero a trap catches. */
  | { kind: 'trapWounds'; pct: number }
  /** After (poison: all) or before (casters: one) each fight, % of max HP, ignores armour. */
  | { kind: 'fightWounds'; pct: number; targets: 'all' | 'one' }
  /** Expedition time × (1 + pct). */
  | { kind: 'delay'; pct: number }
  /** Extra supply points needed at launch. */
  | { kind: 'hunger'; supply: number }
  /** Gold and materials × (1 − pct). */
  | { kind: 'lostLoot'; pct: number }
  /** The locals turn hostile. */
  | { kind: 'extraFight' }
  /** Damage of the threat's element taken by heroes without Resist. */
  | { kind: 'elementalDamage'; multiplier: number }
  | { kind: 'enemyDamage'; tag: 'beast'; pct: number }
  | { kind: 'enemyHp'; tag: 'undead'; pct: number }
  /** Armoured: party damage against every enemy × (1 − pct). */
  | { kind: 'weakenedAgainst'; pct: number }
  /** Per fight of 3+ enemies, copies of its weakest mob. */
  | { kind: 'extraEnemies'; count: number }
  /** The boss deals × (1 + pct). */
  | { kind: 'bruteDamage'; pct: number }
  | { kind: 'healingHalved' };

export type ThreatDef = {
  id: ThreatId;
  name: string;
  emoji: string;
  category: ThreatCategory;
  /** The first tier the threat appears in, at level 1. */
  firstTier: number;
  answer: ThreatAnswer;
  /** Locked: Might forces it (loses some loot). Locals: Might intimidates them (no help, no fight). */
  alternative?: Approach;
  /** Penalties at levels 1, 2 and 3. */
  penalties: [ThreatPenalty[], ThreatPenalty[], ThreatPenalty[]];
  /** One short line: what it is and what happens if missed. */
  description: string;
};

/** A threat as it stands in one dungeon today. */
export type ActiveThreat = {
  id: ThreatId;
  level: ThreatLevel;
  /** The Element threat's element, from the dungeon. */
  element?: Element;
  /** The daily surge name, when it raised the level. */
  surge?: 'restlessDead' | 'boobyTrapped' | 'packHunt';
};

/** What a dungeon shows today, kept by an expedition for its whole run. */
export type Briefing = {
  threats: ActiveThreat[];
  restriction: RestrictionId | null;
  opportunity: OpportunityId | null;
};

/** A rule the whole briefing plays under, that cuts some answers short. */
export type RestrictionDef = {
  id: RestrictionId;
  name: string;
  emoji: string;
  description: string;
};

/** What answers an opportunity: any one of them (empty = free). */
export type OpportunityAnswer = { approach: Approach; score: number } | { keyword: Keyword };

/** What an answered opportunity pays; one kind per opportunity. */
export type OpportunityReward =
  /** Healing spring: every conscious hero heals this share of max HP. */
  | { kind: 'heal'; pct: number }
  /** Hidden cache: this share of the dungeon's top gold. */
  | { kind: 'goldShare'; share: number }
  /** Rich vein: `base + tier` of the tier's ore material. */
  | { kind: 'ore'; base: number; materials: string[] }
  /** Bounty: gold × this for the run. */
  | { kind: 'goldMultiplier'; multiplier: number }
  /** Prisoners: this share of the top gold, plus a chance a prisoner joins the roster. */
  | { kind: 'prisoners'; share: number; recruitChance: number }
  /** Refugees: one roll of the pilgrim traveller's reward table (see travellerRules.pilgrimRewards). */
  | { kind: 'pilgrimReward' }
  /** Forgotten shrine: party damage × this for the rest of the run. */
  | { kind: 'partyDamage'; multiplier: number }
  /** Old inscriptions: XP × this, plus a chance to teach one unknown Provisions recipe. */
  | { kind: 'xp'; multiplier: number; recipeChance: number }
  /** Trophy beast: materials, plus a chance of one shard of a random element. */
  | { kind: 'trophy'; hide: [min: number, max: number]; bone: number; shardChance: number };

export type OpportunityDef = {
  id: OpportunityId;
  name: string;
  emoji: string;
  description: string;
  /** Empty = free; any one answer answers it. */
  answers: OpportunityAnswer[];
  /** Supply points it costs; the party must opt in to pay them. */
  cost?: { supply: number };
  reward: OpportunityReward;
};

/** What an answered opportunity gave a run; one kind per opportunity. */
export type OpportunityOutcome = {
  id: OpportunityId;
  answered: boolean;
  /** Gold it handed over on the spot (part of the run's bonus gold). */
  gold?: number;
  /** Materials it gave: ore, trophies, shards. */
  materials?: MaterialStack[];
  /** Bounty: the dungeon's rolled gold is multiplied by this. */
  goldMultiplier?: number;
  /** Forgotten shrine: party damage multiplier for the rest of the run. */
  damageMultiplier?: number;
  /** Old inscriptions: XP multiplier, and whether it taught a recipe. */
  xpMultiplier?: number;
  recipe?: boolean;
  /** Prisoners: whether a prisoner joins the roster. */
  recruit?: boolean;
  /** Refugees: the pilgrim traveller's reward rolled. */
  pilgrim?: 'blessing' | 'gold' | 'keyFragment';
};

/** What a kit gives its carrier against the threats it covers. */
export type KitEffect = {
  threats: ThreatId[];
  /** Adds to the answer approach of these threats (the carrier's own approach for 'threat'). */
  approach?: Approach | 'threat';
  /** Added to the approach instead of approachRules.kitBonus. */
  bonus?: number;
  keywords?: Keyword[];
  /** Heals its carrier once, like a potion. */
  heal?: number;
};

/** Food: held in the stock, taken by the whole party. */
export type ProvisionDef = ItemBase & {
  slot: 'provision';
  /** Supply points it covers. */
  supply?: number;
  meal?: MealEffect;
};

/** Walking consumables, used from the map for a while (see gatheringConfig.walkEffects). */
export type WalkEffectKind = 'forage' | 'musk' | 'prospect' | 'track';
/** Care given to a hero at home. */
export type HomeCare = { kind: 'heal'; share: number } | { kind: 'rest' };
/** Held in the stock and used by the player, never carried by a hero. */
export type UtilityDef = ItemBase & {
  slot: 'utility';
  walk?: WalkEffectKind;
  homeCare?: HomeCare;
};

/** Owned by the player rather than a hero; never wears out. */
export type ToolDef = ItemBase & {
  slot: 'tool';
  toolType: 'pickaxe';
  /** Mines resources whose `pickaxeTier` is at most this. */
  tier: number;
};

export type ItemDef = GearDef | ConsumableDef | ToolDef | ProvisionDef | UtilityDef;

export type RecipeDef = {
  id: string;
  station: 'forge' | 'provisions';
  /** The Provisions station's tab. */
  tab?: 'kitchen' | 'alchemy';
  /** A crafted item, or a material for smelting recipes. */
  output: { itemId: string } | { materialId: string; amount: number };
  inputs: MaterialStack[];
  unlockedByDefault: boolean;
  /** Counted as known once the player's highest unlocked tier reaches this. */
  availableFromTier?: number;
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
  | 'sorcerer'
  | 'scholar'
  | 'exorcist'
  | 'duelist'
  | 'smuggler'
  | 'diplomat'
  | 'necromancer'
  | 'beastmaster'
  | 'engineer'
  | 'alchemist'
  | 'porter'
  | 'scout'
  | 'curseBreaker'
  | 'cook'
  | 'monk'
  | 'gambler';

export type ClassRarity = 'common' | 'uncommon' | 'rare';

/** How a class plays its role against threats (see doc/design/threats/classes.csv). */
export type ClassFamily = 'answerer' | 'fighter' | 'converter' | 'ruleBender';

/** The enemy families a mob can belong to; the first of its tags is the main one. */
export type FamilyTag =
  | 'bird'
  | 'vermin'
  | 'carapace'
  | 'spirit'
  | 'goblinoid'
  | 'humanoid'
  | 'brute'
  | 'construct'
  | 'dragon'
  | 'caster'
  | 'elemental';

/** The tags encounters and mobs carry; threats and abilities play on them. */
export type Tag = 'undead' | 'beast' | 'trap' | 'obstacle' | 'locals' | Element | FamilyTag;

export type ObstacleKind = 'rubble' | 'locked' | 'barricade';

/**
 * A class ability: one of a few effects the simulation knows. Party-wide ones
 * (beast damage, traps, pickpocket) work if any conscious hero has them.
 */
export type Ability =
  | { kind: 'damageVsTag'; tag: Tag; multiplier: number }
  /** Trap damage to the party is multiplied by this. */
  | { kind: 'trapReduce'; multiplier: number }
  /** A thief lifts some gold from locals who don't help. */
  | { kind: 'pickpocket' }
  /** After each encounter, conscious heroes regain this share of max HP. */
  | { kind: 'partyHeal'; pct: number }
  /** This share of the damage aimed at the most hurt ally is taken by this hero instead. */
  | { kind: 'protect'; share: number }
  /** Damage multiplier while this hero is below the HP share. */
  | { kind: 'rage'; belowPct: number; multiplier: number }
  /** Damage multiplier for the whole party while this hero is conscious; the best one applies. */
  | { kind: 'partyDamageBuff'; multiplier: number }
  | { kind: 'critBonus'; chance: number }
  /** Gold from cache events and the hidden cache opportunity is multiplied by this. */
  | { kind: 'cacheBonus'; multiplier: number }
  /** Replaces the elemental advantage multiplier for this hero's attacks. */
  | { kind: 'elementalAdvantage'; multiplier: number }
  // Personal traits. Party-wide ones count once per trait, however many heroes have it.
  | { kind: 'statMultiplier'; stat: keyof Stats; multiplier: number }
  | { kind: 'goldMultiplier'; multiplier: number }
  | { kind: 'xpMultiplier'; multiplier: number }
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
  /** Added to the share of max HP below which this hero drinks a potion. */
  | { kind: 'potionThreshold'; add: number }
  /** Added to this hero's score for one approach (traits). */
  | { kind: 'approach'; approach: Approach; add: number }
  /** This hero counts as having the keyword (traits). */
  | { kind: 'keyword'; keyword: Keyword }
  // Class signatures (see threats/signatures.ts and expeditions/simulate.ts).
  /** The party's missed-threat Delay or Hunger penalties are multiplied by this. */
  | { kind: 'penaltyReduce'; penalty: 'delay' | 'hunger'; multiplier: number }
  /** Against this threat (at these levels; all if left out), this hero counts as `count` heroes with its keyword. */
  | { kind: 'keywordCount'; threat: ThreatId; count: number; levels?: ThreatLevel[] }
  /** Against this threat, this hero's approach gets `add`, or counts as at least `score`. */
  | { kind: 'approachFor'; threat: ThreatId; approach: Approach; add?: number; score?: number }
  /** Added to the approach bonus of this hero's own kit. */
  | { kind: 'kitBonus'; add: number }
  /** Unarmed or with knuckles, this hero has Pierce. */
  | { kind: 'fistsPierce' }
  /** The kit in this hero's consumable slot counts as carried by the hero they pick (HeroState.kitFor). */
  | { kind: 'carryKit' }
  /** A second consumable slot for healing consumables (HeroState.equipment.potion). */
  | { kind: 'potionSlot' }
  /** Lowers the party's worst Extreme threat to Strong. */
  | { kind: 'lowerThreat' }
  /** Cancels the briefing's restriction: this one only, or any. */
  | { kind: 'cancelRestriction'; restriction?: RestrictionId }
  /** The opportunity's reward bonus (above 1, or its chances) is multiplied by this. */
  | { kind: 'opportunityBoost'; opportunity: OpportunityId; multiplier: number }
  /** At this threat level, the enemies with the tag of the first fight that has any fight for the party in the next fight. */
  | { kind: 'raiseAllies'; threat: ThreatId; level: ThreatLevel; tag: Tag; max: number; damage: number }
  /** This hero's crits deal this multiplier instead in fights that start against a single enemy. */
  | { kind: 'singleEnemyCrit'; multiplier: number }
  /** The Thieves threat costs no loot; it pays this share of the dungeon's top gold at levels 1, 2 and 3. */
  | { kind: 'fence'; shares: [number, number, number] }
  /** The meal's bonus (above 1, or its amount) is multiplied by this. */
  | { kind: 'mealBoost'; multiplier: number }
  /** After every fight, conscious heroes heal this share of max HP. */
  | { kind: 'fightHeal'; pct: number }
  /** This hero's own damage ignores these restrictions. */
  | { kind: 'ignoresRestrictions'; restrictions: RestrictionId[] };

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
  /** How the class plays its role against threats. */
  family: ClassFamily;
  /** Highest unlocked tier from which taverns offer the class; null = never (rare classes). */
  poolTier: number | null;
  /** Its attacks use this element unless its weapon is infused. */
  element?: Element;
  /** The stats the class starts with at level 1 (Luck is not class-based). */
  baseStats: Omit<Stats, 'luck'>;
  /** The stats that grow every level; the others only at milestones. */
  primary: StatKey[];
  /** A stat that grows at half a primary step per level. */
  halfRate?: StatKey;
  /** The stat its unarmed attacks roll with; weapons decide their own. */
  damageStat: DamageStat;
  /** Approach scores; the Gambler's are rolled at the daily reset. */
  approaches: Record<Approach, number>;
  keywords: Keyword[];
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
    offhand: string | null;
    trinket: string | null;
    /** Consumable item id (potion, elixir or charm); equipping one takes it out of the stock. */
    consumable: string | null;
    /** The Alchemist's second slot: a healing consumable. */
    potion?: string | null;
  };
  /** A Porter's pick: the hero the kit in their consumable slot is carried for. */
  kitFor?: string;
  /** The recruit's 3d6 roll; missing means the average (10.5) everywhere. */
  roll?: HeroRoll;
  /** The approach picks made at levels 5 and 10, in order. */
  approachPicks?: Approach[];
  /** The Gambler's approach scores, rolled at the daily reset (`day` is the rotation day). */
  gamble?: { day: number; approaches: Record<Approach, number> };
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
  /** A Legendary forge's +1 Luck roll (see gearLuckRules). */
  luck?: number;
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
  /** A chapel's blessing was spent on this run (see serviceRules.chapel). */
  blessed?: boolean;
  /** The dungeon's briefing at launch, kept for the whole run (empty when none). */
  briefing?: Briefing;
  /** The party opted into the briefing's opportunity cost. */
  optIn?: boolean;
  /** Supply status at launch. */
  hunger?: Hunger;
  /** Supply points taken. */
  supplyUsed?: number;
  /** Meal eaten (provision item id). */
  mealId?: string | null;
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
  /** Damage per round before the target's defence. */
  damage: number;
  /** The stat this enemy's hits roll against: Armour for Power, Resistance for Magic. */
  damageType: DamageStat;
  /** Turn order and extra attacks, from its speed class and tier. */
  speed: number;
  element?: Element;
  /** The tags in order: the first is the enemy's main family. The element is a tag too, added by `mobTags`. */
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
      /** Live only when the briefing has the traps threat; it wounds whoever it catches. */
      type: 'trap';
      name: string;
      targets: 'one' | 'all';
      element?: Element;
    }
  /** A quiet step unless the briefing has the locals threat: help, intimidation or a hostile fight. */
  | { type: 'event'; eventId: string }
  | { type: 'obstacle'; name: string; kind: ObstacleKind }
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
  hostile: { name: string; count: number; hp: number; damage: number; tags: Tag[] };
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

/** A walking consumable in use; one per item, replaced (timer restarted) when used again. */
export type WalkEffect = { id: string; itemId: string; startedAt: number; endsAt: number; center: { latitude: number; longitude: number } };

export type SanctumDef = {
  id: string;
  name: string;
  element: Element;
  emoji: string;
  description: string;
  guardian: { name: string; description: string; effect?: BossDef['effect']; tags: Tag[] };
  /** The guardian's minions, weakest first. */
  minions: [SanctumFoe, SanctumFoe];
};

/** A Sanctum fighter with its family tags. */
export type SanctumFoe = { name: string; tags: Tag[] };

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
  /** The briefing the expedition played under (empty when it had none). */
  briefing?: Briefing;
  /** Each drawn threat, its level and how the party fared against it. */
  threats: { id: ThreatId; level: ThreatLevel; element?: Element; state: 'met' | 'half' | 'full'; forced?: boolean; intimidated?: boolean }[];
  /** The briefing's opportunity at the midpoint and what it gave, or null when there was none. */
  opportunity: OpportunityOutcome | null;
  /** Consumables that never triggered, broken back down (see threats/salvage.ts). */
  salvaged: { heroId: string; itemId: string; materials: MaterialStack[]; gold: number }[];
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

/** What a place pays out (fight win, dig, heist): placeholder tables until the loot rework (see content/placeRewards.ts). */
export type PlaceReward = {
  gold: number;
  /** XP per hero who took part. */
  xp: number;
  materials: MaterialStack[];
  consumables: { itemId: string; amount: number }[];
  /** Gear pieces; their uids are given when granted. */
  gear: GearInstance[];
  /** A recipe the player doesn't know yet. */
  recipeId?: string;
  keyFragments: number;
};

/** A fight at a fight event or monster lair, played out at the start and settled when its time is up. */
export type PlaceFight = {
  id: string;
  placeId: string;
  kind: PlaceKind;
  tier: number;
  heroIds: string[];
  startedAt: number;
  endsAt: number;
  /** A win hides the place until then. */
  placeExpiresAt: number;
  won: boolean;
  hp: { heroId: string; hp: number; maxHp: number }[];
  salvaged: ExpeditionReport['salvaged'];
  reward: PlaceReward;
};

/** One hero away on a thieves' guild heist; the outcome is rolled when they set out. */
export type Heist = {
  id: string;
  placeId: string;
  heroId: string;
  startedAt: number;
  endsAt: number;
  success: boolean;
  reward: PlaceReward;
};

/** A dug ruin: a new one shows elsewhere a day later, for this player. */
export type DugRuin = { dugAt: number; position: LatLng };
