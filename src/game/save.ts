import type { GuildTrackId } from '@/content/guild';
import { startingHeroes } from '@/content/heroes';
import { provisionRules } from '@/content/provisions';
import { recipes } from '@/content/recipes';

import { startingRecipes } from './crafting/recipeUnlocks';
import { startingMastery } from './forging/mastery';

import type { AutoGatherSave } from './gathering/autoGather';
import type { LatLng } from './generation/types';
import type { PatrolFight } from './patrols/fight';
import type {
  ActiveExpedition,
  ActiveLure,
  DugRuin,
  ExpeditionReport,
  GearInstance,
  HeroState,
  Heist,
  MasteryState,
  MasteryType,
  PlaceFight,
  TreasureMap,
  WalkEffect,
} from './types';

/** The first-session walkthrough, in order. Each step waits for one player action. */
export type TutorialStep =
  | 'collectWood'
  | 'forgeSword'
  | 'equipSword'
  | 'sendExpedition'
  | 'awaitReport'
  | 'readReport'
  | 'findSanctum'
  | 'sanctumIntro'
  | 'outro'
  | 'done';

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
  /** Pool dungeons whose first-clear bonus was paid. */
  firstClears: string[];
  /** Spawn id → time the spawn expires; collected spawns stay hidden until then. */
  collected: Record<string, number>;
  tutorial: {
    step: TutorialStep;
    /** Where the guaranteed first wood node sits, set from the first GPS fix. */
    woodSpot: LatLng | null;
  };
  /** Steps counted while the app was open today (Android has no step history). */
  steps: { day: string; count: number };
  /** Chests opened on `day`. */
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
  /** The "taverns are open" tip was closed. */
  tavernHintSeen: boolean;
  /** The cooking tip (shown when supply first runs low) was closed. */
  cookingHintSeen: boolean;
  /** Guild Hall ranks bought, by track. */
  guild: Partial<Record<GuildTrackId, number>>;
  /** Needed for ⭐ Guild Hall milestones. */
  charters: number;
  /** Boss dungeon id → rotation day its daily bonus (guaranteed reward and extra roll) was last claimed. */
  bossBonusDays: Record<string, number>;
  /** Pool dungeon id → rotation day its guaranteed daily blueprint was last claimed. */
  blueprintBonusDays: Record<string, number>;
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
  /** Ruins dug towards the relic, 0–4; the 5th dig pays it and starts again. */
  ruinsProgress: number;
  /** Ruin id → when and where it was dug; a replacement ruin shows elsewhere 24 h later. */
  dugRuins: Record<string, DugRuin>;
  /** Background fight result id → when it was applied; idempotence and pruning. */
  appliedBackgroundResults: Record<string, number>;
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
    firstClears: [],
    knownRecipes: [...new Set([...recipes.filter((r) => r.unlockedByDefault).map((r) => r.id), ...startingRecipes])],
    collected: {},
    tutorial: { step: 'collectWood', woodSpot: null },
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
    tavernHintSeen: false,
    cookingHintSeen: false,
    guild: {},
    charters: 0,
    trainedAt: null,
    bossBonusDays: {},
    blueprintBonusDays: {},
    freshGathers: { day: '', used: 0 },
    autoGather: { processedUntil: 0, anchor: null, history: [] },
    escort: null,
    patrolFights: [],
    beatenPatrols: {},
    helpedTravellers: {},
    traderUses: {},
    keyFragments: 0,
    appliedBackgroundResults: {},
    usedPlaces: {},
    placePurchases: {},
    chapelVisits: {},
    expeditionBlessing: false,
    placeFights: [],
    heists: [],
    ruinsProgress: 0,
    dugRuins: {},
    // Mastery starts with the starting recipes' types (their ids are `<type><tier>`), level 1.
    mastery: Object.fromEntries(startingRecipes.map((id) => [id.replace(/\d+$/, '') as MasteryType, startingMastery(1)])),
    nextUid: 1,
  };
}
