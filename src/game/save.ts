import type { GuildTrackId } from '@/content/guild';
import { startingHeroes } from '@/content/heroes';
import type { PlaceKind } from '@/content/places';
import { provisionRules } from '@/content/provisions';
import { recipes } from '@/content/recipes';
import type { TipId } from '@/content/reveal';

import { startingRecipes } from './crafting/recipeUnlocks';
import { startingMastery } from './forging/mastery';

import type { ManualRarity } from './loot/types';
import type { AutoGatherSave } from './gathering/autoGather';
import type { LatLng } from './generation/types';
import type { PatrolFight } from './patrols/fight';
import type { QuestsState } from './quests/types';
import type {
  ActiveExpedition,
  ActiveLure,
  DugRuin,
  ExpeditionReport,
  GearInstance,
  HeroClassId,
  HeroState,
  Heist,
  MasteryState,
  MasteryType,
  PlaceFight,
  SecretTip,
  TreasureMap,
  WalkEffect,
} from './types';

/** The first-session walkthrough, in order. Each step waits for one player action. */
export type TutorialStep =
  | 'gatherWood'
  | 'forgeSword'
  | 'equipSword'
  | 'seeThreat'
  | 'gatherKit'
  | 'craftKit'
  | 'equipKit'
  | 'sendExpedition'
  | 'awaitReport'
  | 'readReport'
  | 'done';

/** One node the tutorial spawned on the map for this player. */
export type TutorialSpawn = {
  id: string;
  materialId: string;
  /** Null when location is off: only "Collect from here" reaches it. */
  position: LatLng | null;
  spawnedAt: number;
  collected: boolean;
};

export type SaveData = {
  gold: number;
  materials: Record<string, number>;
  consumables: Record<string, number>;
  gear: GearInstance[];
  /** Item ids of the tools the player owns, e.g. pickaxes. */
  tools: string[];
  knownRecipes: string[];
  heroes: HeroState[];
  expeditions: ActiveExpedition[];
  /** Finished expeditions, newest first. */
  reports: ExpeditionReport[];
  /** Dungeons won at least once; unlocks tiers. */
  clearedDungeons: string[];
  /** Spawn id → time the spawn expires; collected spawns stay hidden until then. */
  collected: Record<string, number>;
  tutorial: {
    step: TutorialStep;
    /** The nodes spawned for this player, both phases; kept once picked up. */
    spawns: TutorialSpawn[];
    /** When a tutorial node was last picked up. */
    lastPickupAt: number | null;
    /** The tutorial expedition's loot was given (by the run, or by skipping). */
    rewarded: boolean;
  };
  /** Steps counted while the app was open today (Android has no step history). */
  steps: { day: string; count: number };
  /** Step chests opened on `day`, by id. */
  chests: { day: string; opened: string[] };
  /** Sanctum Sigils held, by tier (capped). */
  sigils: number[];
  /** Successful expeditions in a row without a Sigil. */
  sigilPity: number;
  /** The first Sigil is guaranteed once; this records that it came. */
  firstSigilGiven: boolean;
  treasureMaps: TreasureMap[];
  lures: number;
  activeLure: ActiveLure | null;
  /** Walking consumables in use; one entry per item (see gatheringConfig.walkEffects). */
  walkEffects: WalkEffect[];
  /** Sanctum spawn id → when it refreshes; one attempt per spawn, win or lose. */
  usedSanctums: Record<string, number>;
  /** Forging mastery per weapon type and armour; a type is added when first met. */
  mastery: Partial<Record<MasteryType, MasteryState>>;
  /** Tavern offer id → when the offers refresh; recruited offers stay gone until then. */
  takenOffers: Record<string, number>;
  /** Lifetime counters the gradual reveal reads; never pruned. */
  stats: { patrolsWon: number; questsDone: number };
  /** Tips already closed, and tips waiting to show, oldest first. */
  tips: { seen: TipId[]; pending: TipId[] };
  /** The cooking tip (shown when supply first runs low) was closed. */
  cookingHintSeen: boolean;
  /** Guild Hall ranks bought, by track. */
  guild: Partial<Record<GuildTrackId, number>>;
  /** Rotation day of the last first win of the day (dungeons and tier bosses); null before the first. */
  firstWinDay: number | null;
  /** Local day (ISO date) → bonus gathers used today (see `walkingBonus`). */
  freshGathers: { day: string; used: number };
  /** When home heroes last got their training XP (null before the first check). */
  trainedAt: number | null;
  /** Auto-gather's processed path and recent walk summaries. */
  autoGather: AutoGatherSave;
  /** The hero the background task sends at patrols by itself. */
  escort: { heroId: string } | null;
  /** Patrol fights under way, resolved when their time is up. */
  patrolFights: PatrolFight[];
  /** Patrol id → window end it was beaten in; hidden until then, pruned after. */
  beatenPatrols: Record<string, number>;
  /** Traveller id → window end it was helped in. */
  helpedTravellers: Record<string, number>;
  /** Trader trade key (`spawn id:trade index`) → times used this window. */
  traderUses: Record<string, number>;
  /** Key fragments gathered from travellers, until they form a whole key. */
  keyFragments: number;
  /** Tips for secret places, active or expired (pruned on new tips). */
  secretTips: SecretTip[];
  /** Place id → when it expires; places used up by this player (sold out, dug, won) hide until then. */
  usedPlaces: Record<string, number>;
  /** Shop stock bought per place, by stock line; dropped once the place expires, so stock resets. */
  placePurchases: Record<string, { expiresAt: number; bought: Record<string, number> }>;
  /** Chapel id → when it expires; its free care was taken on this visit. */
  chapelVisits: Record<string, number>;
  /** A chapel's blessing, waiting for the next expedition. */
  expeditionBlessing: boolean;
  /** Fights at fight events and monster lairs under way. */
  placeFights: PlaceFight[];
  /** Thieves' guild heists under way. */
  heists: Heist[];
  /** Classes the player has met (offered or recruited); the class list shows the others as not met yet. */
  seenClasses: HeroClassId[];
  /** Ruins dug towards the relic, 0–4; the 5th dig pays it and starts again. */
  ruinsProgress: number;
  /** Ruin id → when and where it was dug; a replacement ruin shows elsewhere 24 h later. */
  dugRuins: Record<string, DugRuin>;
  /** Background fight result id → when it was applied; idempotence and pruning. */
  appliedBackgroundResults: Record<string, number>;
  /** Valuables held, by `valuableId:tier` (their value rises with the tier). */
  valuables: Record<string, number>;
  /** Relics found but not restored yet. */
  relics: { uid: string; relicId: string }[];
  /** Training manuals held, by rarity. */
  manuals: Partial<Record<ManualRarity, number>>;
  /** Monster-part recipes unlocked (a part's first find). */
  partRecipes: string[];
  /** Parts and gems found at least once; a part recipe unlocks once all of its have been seen. */
  seenParts: string[];
  /** Debug: the collector every market uses on that day. */
  collectorOverride?: { dayKey: string; valuableId: string };
  /** Debug: every kind shows, whatever its condition. */
  revealAll?: boolean;
  /** Daily quests: the list plus arrival, reroll and secret bookkeeping. */
  quests: QuestsState;
  /** Place kinds the player has seen; quest objectives unlock from these. */
  seenPlaceKinds: PlaceKind[];
  /** Lifetime steps; the walk quest measures progress with this. */
  stepsTotal: number;
  /** Counter for unique ids (gear, maps, lures, fights, heroes). */
  nextUid: number;
};

export function createInitialSave(): SaveData {
  return {
    gold: 0,
    materials: {},
    consumables: { ...provisionRules.startingStock },
    gear: [],
    tools: [],
    heroes: startingHeroes,
    expeditions: [],
    reports: [],
    clearedDungeons: [],
    knownRecipes: [...new Set([...recipes.filter((r) => r.unlockedByDefault).map((r) => r.id), ...startingRecipes])],
    collected: {},
    tutorial: { step: 'gatherWood', spawns: [], lastPickupAt: null, rewarded: false },
    steps: { day: '', count: 0 },
    chests: { day: '', opened: [] },
    sigils: [],
    sigilPity: 0,
    firstSigilGiven: false,
    treasureMaps: [],
    lures: 0,
    activeLure: null,
    walkEffects: [],
    usedSanctums: {},
    takenOffers: {},
    stats: { patrolsWon: 0, questsDone: 0 },
    tips: { seen: [], pending: [] },
    cookingHintSeen: false,
    guild: {},
    trainedAt: null,
    firstWinDay: null,
    freshGathers: { day: '', used: 0 },
    autoGather: { processedUntil: 0, anchor: null, history: [] },
    escort: null,
    patrolFights: [],
    beatenPatrols: {},
    helpedTravellers: {},
    traderUses: {},
    keyFragments: 0,
    appliedBackgroundResults: {},
    secretTips: [],
    usedPlaces: {},
    placePurchases: {},
    chapelVisits: {},
    expeditionBlessing: false,
    placeFights: [],
    heists: [],
    seenClasses: [...new Set(startingHeroes.map((h) => h.classId))],
    ruinsProgress: 0,
    dugRuins: {},
    // Mastery starts with the starting recipes' types (their ids are `<type><tier>`), level 1.
    mastery: Object.fromEntries(startingRecipes.map((id) => [id.replace(/\d+$/, '') as MasteryType, startingMastery(1)])),
    valuables: {},
    relics: [],
    manuals: {},
    partRecipes: [],
    seenParts: [],
    quests: { list: [], lastArrivalDay: null, rerollDay: null, rerolls: 0, secretDay: null, completions: [] },
    seenPlaceKinds: [],
    stepsTotal: 0,
    nextUid: 1,
  };
}
