import type { Loot, LootModifier, MapRarity } from './loot/types';
import type { ImageSourcePropType } from 'react-native';

import type { PlaceKind, SecretKind } from '@/content/places';
import type { WorkToolKind } from '@/content/workTools';
import type { PlaceTipSource, TipSource } from '@/content/secrets';
import type { Difficulty } from '@/content/difficulty';
import type { Rarity } from '@/content/gear';
import type { FamilyId } from '@/content/families';

import type { Element } from './elements';
import type { LatLng } from './generation/types';
export type { Rarity };

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
  | 'knuckles'
  | 'crossbow'
  | 'throwing'
  | 'totem'
  | 'runestone'
  | 'flasks';
export type ArmourType = 'plate' | 'mail' | 'leather' | 'robes';
export type OffhandType = 'shield' | 'buckler' | 'offhandBlade' | 'quiver' | 'tome' | 'focus';

/** Every gear type. */
export type GearType = WeaponType | ArmourType | OffhandType;

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
  /** The gear type; trinkets have none. */
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
  /** The stat the piece's damage rolls with, for weapons and damage off-hands; 'wielder' means the wielder's class damage stat. */
  damageStat?: DamageStat | 'wielder';
  /** An amulet's Resistance against one element (Normal-quality value, unrounded). */
  elementResist?: { element: Element; amount: number };
  /** A work tool: the off-hand line for workers, with the job it boosts and scavenges for (see content/workTools.ts). */
  workTool?: { kind: WorkToolKind; job: string };
};

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
  | { kind: 'revive'; hp: number }
  /** % points of crit chance for the run. */
  | { kind: 'crit'; add: number };

export type ConsumableDef = ItemBase & {
  slot: 'consumable';
  /** Share of max HP restored when used. */
  heal?: number;
  /** Healing consumables are drunk below the HP threshold. */
  when?: 'lowHp';
  /** Element this consumable protects its hero against for the whole run. */
  protectsAgainst?: Element;
  elixir?: Elixir;
  /** The boss id this weakness item weakens when its carrier meets that boss. */
  weakness?: string;
  /** A charm: what it raises in the run's loot (see loot/charms.ts). */
  charm?: LootModifier;
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

/** Combat keywords: what a piece of gear does in a fight on its own. */
export type Keyword =
  | 'pierce'
  | 'cleave'
  | 'guard'
  | 'parry'
  | 'reach'
  | 'stagger'
  | 'brace'
  | 'channel'
  | 'inspire'
  | 'mend';

export type ThreatId = 'holy' | 'beasts' | 'darkness' | 'traps' | 'poison' | 'element' | 'armoured';

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
  | 'trophyBeast'
  | 'sealedVault';

/** One effect of a missed threat. A half penalty halves every number (see "Half penalties"). */
export type ThreatPenalty =
  /** Enemies strike first in the first `fights` fights, or in all of them. */
  | { kind: 'exposed'; fights: number | 'all' }
  /** Party damage × (1 − pct). */
  | { kind: 'weakened'; pct: number }
  /** Share of max HP lost by each hero a trap catches. */
  | { kind: 'trapWounds'; pct: number }
  /** After each fight, % of max HP, ignores armour. */
  | { kind: 'fightWounds'; pct: number }
  /** Damage of the threat's element taken by heroes without Resist. */
  | { kind: 'elementalDamage'; multiplier: number }
  | { kind: 'enemyDamage'; tag: 'beast'; pct: number }
  | { kind: 'enemyHp'; tag: 'undead'; pct: number }
  /** Armoured: party damage against every enemy × (1 − pct). */
  | { kind: 'weakenedAgainst'; pct: number };

export type ThreatDef = {
  id: ThreatId;
  name: string;
  emoji: string;
  icon: ImageSourcePropType;
  /** The first tier the threat appears in, at level 1. */
  firstTier: number;
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

/** What answers an opportunity: the party's family at that level (empty = free). */
export type OpportunityAnswer = { family: FamilyId; level: 1 | 2 };

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
  | { kind: 'trophy'; hide: [min: number, max: number]; bone: number; shardChance: number }
  /** Sealed vault: a won run opens it (see game/secrets/rewards.ts). */
  | { kind: 'vault' };

export type OpportunityDef = {
  id: OpportunityId;
  name: string;
  emoji: string;
  description: string;
  /** Empty = free; any one answer answers it. */
  answers: OpportunityAnswer[];
  /** What it costs, supply points or mysterious keys; the party must opt in to pay. */
  cost?: { supply?: number; key?: number };
  /** Draw weight among a briefing's opportunities (1 when absent). */
  weight?: number;
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
  /** Valuables spent by id, any tier (lowest first). */
  valuables?: { valuableId: string; amount: number }[];
  /** Shards of any one element spent (the one held most). */
  anyShards?: number;
  /** A part recipe: known once every part (or gem) here has been seen, and its tier reached. */
  unlockedBy?: string[];
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
 * (beast damage, traps) work if any conscious hero has them.
 */
export type Ability =
  | { kind: 'damageVsTag'; tag: Tag; multiplier: number }
  /** Trap damage to the party is multiplied by this. */
  | { kind: 'trapReduce'; multiplier: number }
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
  /** This hero counts as having the keyword (traits). */
  | { kind: 'keyword'; keyword: Keyword }
  // Class signatures (see threats/signatures.ts and expeditions/simulate.ts).
  /** The party's penalties from this threat are multiplied by this. */
  | { kind: 'penaltyReduce'; threat: ThreatId; multiplier: number }
  /** Adds `add` tags of `family` when scoring the threat that family answers (only at these threat levels if given). */
  | { kind: 'familyVsThreat'; family: FamilyId; add: number; levels?: ThreatLevel[] }
  /** Unarmed or with knuckles, this hero has Pierce. */
  | { kind: 'fistsPierce' }
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
  /** The meal's bonus (above 1, or its amount) is multiplied by this. */
  | { kind: 'mealBoost'; multiplier: number }
  /** After every fight, conscious heroes heal this share of max HP. */
  | { kind: 'fightHeal'; pct: number }
  /** This hero's own damage ignores these restrictions. */
  | { kind: 'ignoresRestrictions'; restrictions: RestrictionId[] };

/** A hero's special: one active ability, rolled from its class's pool at recruitment (see content/specials.ts). */
export type SpecialId =
  | 'cleave'
  | 'aimedStrike'
  | 'flurry'
  | 'poison'
  | 'elementalBlast'
  | 'smite'
  | 'execute'
  | 'focus'
  | 'stagger'
  | 'entangle'
  | 'taunt'
  | 'dirtyTrick'
  | 'distraction'
  | 'secondWind'
  | 'manaShield'
  | 'ward'
  | 'vanish'
  | 'riposte'
  | 'mend'
  | 'regrowth'
  | 'rally'
  | 'patchUp'
  | 'steal'
  | 'doubleOrNothing'
  | 'meteor'
  | 'deepFreeze'
  | 'resurrection'
  | 'banish'
  | 'summon'
  | 'parley'
  | 'feast'
  | 'turret';

/** What a special does when it fires; every number lives in the data, none in engine code. */
export type SpecialEffect =
  /** Hits every enemy for `share` of a normal hit, elemental when the hero's element applies. */
  | { kind: 'allEnemies'; share: number; elemental: boolean }
  /** The hero's next hit is a sure crit. */
  | { kind: 'sureCrit' }
  /** `hits` quick hits at `share` each. */
  | { kind: 'multiHit'; hits: number; share: number }
  /** The target takes `share` of a hit per round for `rounds` rounds. */
  | { kind: 'damageOverTime'; share: number; rounds: number }
  /** One empowered hit: ×`multiplier`, at `target`, with a `missChance` miss chance. */
  | {
      kind: 'strike';
      multiplier: number;
      target: 'any' | 'boss' | 'tags' | 'belowHp';
      tags?: Tag[];
      belowPct?: number;
      missChance?: number;
    }
  /** The hero's next attack deals ×`multiplier`. */
  | { kind: 'nextAttack'; multiplier: number }
  /** `target` loses its next turn. */
  | { kind: 'skipTurn'; target: 'strongest' | 'one' | 'all' | 'boss'; chance: number }
  /** Every enemy targets this hero for `rounds` rounds. */
  | { kind: 'taunt'; rounds: number; damageTaken: number }
  /** The weakest ally isn't targeted for `rounds` rounds. */
  | { kind: 'shieldWeakest'; rounds: number }
  /** Absorbs the next `hits` hits on `target`. */
  | { kind: 'absorb'; target: 'self' | 'ally'; hits: number }
  /** Dodges every attack for `rounds` rounds. */
  | { kind: 'dodge'; rounds: number }
  /** Counters the next `hits` hits taken for `share` of a hit each. */
  | { kind: 'counter'; hits: number; share: number }
  /** Heals `target` this share of max HP (1 = back to full). */
  | { kind: 'heal'; target: 'self' | 'weakest' | 'party'; pct: number }
  /** The target heals this share of max HP per round, for `rounds` rounds. */
  | { kind: 'healOverTime'; pct: number; rounds: number }
  /** A knocked-out ally gets back up at this share of max HP. */
  | { kind: 'revive'; pct: number; chance: number }
  /** Party damage ×`multiplier` for `rounds` rounds. */
  | { kind: 'partyDamage'; multiplier: number; rounds: number }
  /** One enemy leaves the fight: defeated when `loot`, gone when not. */
  | { kind: 'removeEnemy'; tags?: Tag[]; loot: boolean; chance: number }
  /** A temporary ally dealing `share` of the hero's hit each round, for `rounds` (null: the whole fight). */
  | { kind: 'ally'; share: number; rounds: number | null }
  /** `rolls` extra loot rolls from the boss's row. */
  | { kind: 'extraLoot'; rolls: number };

/**
 * When a special fires on its own. Nothing in an effect may depend on the
 * trigger: playing a special by hand only replaces the trigger.
 */
export type SpecialTrigger =
  /** At the fight's first round; `minEnemies` (3+) or `boss` restricts it. */
  | { kind: 'fightStart'; minEnemies?: number; boss?: boolean }
  /** A `chance` chance on the hero's turn. */
  | { kind: 'heroTurn'; chance: number }
  /** The hero's first turn against an enemy with one of these `tags`. */
  | { kind: 'heroTurnVsTags'; tags: Tag[] }
  /** An enemy (the boss with `boss`) below `pct` of its HP. */
  | { kind: 'enemyBelow'; pct: number; boss?: boolean }
  | { kind: 'bossFirstTurn' }
  /** `who` (any conscious party member, the hero included) below `pct` of max HP. */
  | { kind: 'hpBelow'; pct: number; who: 'self' | 'ally' }
  /** The party's average HP share below `pct`. */
  | { kind: 'partyBelow'; pct: number }
  | { kind: 'firstHit' }
  | { kind: 'betweenFights' }
  | { kind: 'allyKnockedOut' }
  | { kind: 'bossWon' };

export type SpecialUses = 'perFight' | 'perExpedition' | 'betweenFights';

export type SpecialDef = {
  id: SpecialId;
  /** English; shown in French through frNames (see content/fr/names.ts). */
  name: string;
  icon: ImageSourcePropType;
  /** One short line: the effect, then the trigger. */
  description: string;
  kind: 'shared' | 'unique';
  effect: SpecialEffect;
  trigger: SpecialTrigger;
  uses: SpecialUses;
};

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
  icon: ImageSourcePropType;
  rarity: ClassRarity;
  /** How the class plays its role against threats. */
  family: ClassFamily;
  /** The team tag the class contributes to the party's families (see content/families.ts). */
  familyTag: FamilyId;
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
  /** The hero's special, rolled from its class's pool at recruitment (see game/team/specials.ts). */
  special: SpecialId;
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
  /** The recruit's 3d6 roll; missing means the average (10.5) everywhere. */
  roll?: HeroRoll;
  /** HP at `hpAt`; missing means full. Heroes at home heal from then on (see team/health.ts). */
  hp?: number;
  hpAt?: number;
  /** Knocked out: no healing at home before this time. */
  exhaustedUntil?: number;
  /**
   * The station job the hero works at, or null (see game/jobs/jobs.ts). An
   * outdoor gatherer works around the player (see game/jobs/gatherer.ts).
   */
  job: { jobId: string; since: number; tired: boolean } | null;
  /** Energy (0–100) as of `at`: drained while working a job, regained otherwise. */
  energy: { value: number; at: number };
};

/** Supply at launch: enough, some, or none. */
export type Hunger = 'fed' | 'underfed' | 'starving';

/** When a relic's effect holds: against a tagged foe, in the run's first fight, or against a threat. */
export type GearCondition = { tag: Tag } | { firstFight: true } | { threat: ThreatId };

/** One effect of a restored relic on the piece's wearer. */
export type RelicEffect =
  /** Adds the keyword (or makes it strong when the piece has it), only when `when` holds. */
  | { kind: 'keyword'; keyword: Keyword; when?: GearCondition }
  /** Crits deal ×multiplier damage, only when `when` holds. */
  | { kind: 'critDamage'; multiplier: number; when: GearCondition }
  /** Every crit staggers the foe, only when `when` holds. */
  | { kind: 'staggerOnCrit'; when: GearCondition }
  /** A kill heals the wearer `pct` of their max HP, only when `when` holds. */
  | { kind: 'healOnKill'; pct: number; when: GearCondition }
  /** Cuts the wearer's own share of that threat's penalty to ×multiplier. */
  | { kind: 'penaltyCut'; threat: ThreatId; multiplier: number }
  /** The whole party takes no penalty from that threat. */
  | { kind: 'cancelPenalty'; threat: ThreatId }
  /** The whole party ignores that threat's penalty, only when `when` holds. */
  | { kind: 'ignorePenalty'; threat: ThreatId; when: GearCondition }
  /** The element counts as resisted and its hits deal ×multiplier damage. */
  | { kind: 'immune'; element: Element; multiplier: number }
  /** The first hit of the run's first fight hits every enemy; Magic heroes only. */
  | { kind: 'firstSpellAll' };

/** A piece of gear: forged, looted or restored. */
export type GearInstance = {
  uid: string;
  itemId: string;
  /** How many affixes the piece carries (see gearRules.affixCount). */
  rarity: Rarity;
  /** Stat dice total (gearRules.dice, 3..18), before the rarity shift. */
  roll: number;
  affixes: { id: string; value: number }[];
  rerolls: number;
  relicId?: string;
  /** A non-relic Legendary's unique: the id of the relic whose effects it carries (unnamed). */
  unique?: string;
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
  | { type: 'event'; eventId: string }
  | { type: 'obstacle'; name: string; kind: ObstacleKind }
  /** Locals met on the way: always a quiet step since the Locals threat was removed. */
  | { type: 'locals'; npcId: string }
);

export type NpcDef = {
  id: string;
  name: string;
  description: string;
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
  /** The difficulty band the dungeon is tuned to (see content/difficulty.ts). */
  difficulty: Difficulty;
  /** The dungeon's place in its tier's chain, 0 first; the boss is 6. Overnight and secret dungeons have none. */
  chainIndex?: number;
  /** An overnight expedition: open every day alongside the rotation, not part of it. */
  overnight?: boolean;
  /** A secret dungeon, launched from a tipped place: never in the rotation, no first-win or first-clear rows. */
  secret?: boolean;
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
};

export type TreasureMap = {
  id: string;
  /** Tier of the source that dropped it; sets the loot. */
  tier: number;
  /** Sets the treasure's distance and how much it holds. */
  rarity: MapRarity;
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
  threats: { id: ThreatId; level: ThreatLevel; element?: Element; state: 'met' | 'half' | 'full' }[];
  /** The briefing's opportunity at the midpoint and what it gave, or null when there was none. */
  opportunity: OpportunityOutcome | null;
  /** Consumables that never triggered, broken back down (see threats/salvage.ts). */
  salvaged: { heroId: string; itemId: string; materials: MaterialStack[]; gold: number }[];
  /** Everything paid: gold, XP per hero and the drops (see game/loot). */
  loot: Loot;
  /** Total gold, `loot.gold` plus salvage. */
  gold: number;
  /** XP per hero before trait, meal and Guild Hall bonuses. */
  xp: number;
  /** A Sanctum Sigil of this tier; at the cap it crumbled into `sigilShards` instead. */
  sigil?: number;
  sigilShards?: { element: Element; amount: number };
  /** The secret prize rolled on top of the run's loot (see game/secrets/prize.ts). */
  prize?: Loot;
  /** The day's first win, a new tier's first clear: their rows were rolled on top. */
  firstWin?: boolean;
  firstTierClear?: boolean;
  /** The first clear of a chain dungeon: its row was rolled on top (once per dungeon). */
  firstDungeonClear?: boolean;
  consumablesUsed: string[];
  log: string[];
  seen: boolean;
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
  reward: Loot;
  /** A won fight's secret tip, granted when it ends. */
  tip?: { source: PlaceTipSource; sourceId: string; anchor: LatLng };
};

/** One hero away on a thieves' guild heist; the outcome is rolled when they set out. */
export type Heist = {
  id: string;
  placeId: string;
  heroId: string;
  startedAt: number;
  endsAt: number;
  success: boolean;
  reward: Loot;
  /** A successful heist's secret tip, granted when it ends. */
  tip?: { source: PlaceTipSource; sourceId: string; anchor: LatLng };
};

/** A dug ruin: a new one shows elsewhere a day later, for this player. */
export type DugRuin = { dugAt: number; position: LatLng };

/** A tip for a secret place, this player's own: where it was found and how long the place stays. */
export type SecretTip = {
  /** `${secret}|${sourceId}` */
  id: string;
  secret: SecretKind;
  source: TipSource;
  /** The spawn, place or run that gave the tip; seeds its marker. */
  sourceId: string;
  /** Where the tip was found; the marker sits 500 m – 1.5 km from it (300 m – 1 km for a secret quest). */
  anchor: LatLng;
  foundAt: number;
  expiresAt: number;
  /** Den and black market: the key was spent on entering; the offer stays open until used up or the place resets. */
  entered?: boolean;
  /** A fixed marker spot instead of the seeded ones (debug spawns). */
  position?: LatLng;
};
