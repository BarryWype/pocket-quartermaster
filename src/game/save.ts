import { MASTERY_TYPES } from '@/content/forging';
import type { GuildTrackId } from '@/content/guild';
import { startingHeroes } from '@/content/heroes';
import { recipes } from '@/content/recipes';

import type { LatLng } from './generation/types';
import type {
  ActiveExpedition,
  ActiveLure,
  ExpeditionReport,
  GearInstance,
  HeroState,
  MasteryState,
  MasteryType,
  TreasureMap,
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
  /** Sanctum spawn id → when it refreshes; one attempt per spawn, win or lose. */
  usedSanctums: Record<string, number>;
  /** Forging mastery per weapon type and armour; a type is added when first met. */
  mastery: Partial<Record<MasteryType, MasteryState>>;
  /** Tavern offer id → when the offers refresh; recruited offers stay gone until then. */
  takenOffers: Record<string, number>;
  /** The "taverns are open" tip was closed. */
  tavernHintSeen: boolean;
  /** Guild Hall ranks bought, by track. */
  guild: Partial<Record<GuildTrackId, number>>;
  /** Needed for ⭐ Guild Hall milestones. */
  charters: number;
  /** Boss dungeon id → rotation day its daily bonus (guaranteed reward and extra roll) was last claimed. */
  bossBonusDays: Record<string, number>;
  /** When home heroes last got their training XP (null before the first check). */
  trainedAt: number | null;
  /** Counter for unique ids (gear, maps, lures, fights, heroes). */
  nextUid: number;
};

export function createInitialSave(): SaveData {
  return {
    gold: 0,
    materials: {},
    consumables: {},
    gear: [],
    tools: [],
    heroes: startingHeroes,
    expeditions: [],
    reports: [],
    clearedDungeons: [],
    firstClears: [],
    knownRecipes: recipes.filter((r) => r.unlockedByDefault).map((r) => r.id),
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
    usedSanctums: {},
    takenOffers: {},
    tavernHintSeen: false,
    guild: {},
    charters: 0,
    trainedAt: null,
    bossBonusDays: {},
    mastery: Object.fromEntries(MASTERY_TYPES.map((type) => [type, { level: 1, progress: 0 }])),
    nextUid: 1,
  };
}
