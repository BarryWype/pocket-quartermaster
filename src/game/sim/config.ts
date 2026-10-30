import type { GuildTrackId } from '@/content/guild';

import type { LatLng } from '../generation/types';

export type Profile = {
  /** Minutes walked per day, split evenly across the sessions. */
  walkMinutes: number;
  /** Hours of the day (UTC) the app is opened, e.g. 12.5 for 12:30. */
  sessionHours: number[];
  stepsPerDay: number;
  /** Share of walking time with auto-gather on, phone in the pocket; the rest is spent tapping. */
  autoShare: number;
  /** Lowest odds the bot accepts for a regular expedition. */
  oddsThreshold: number;
  /** Share of seen patrols the bot engages with its own party. */
  patrolEngageShare: number;
  /** The background escort hero fights pocket-mode patrols. */
  pocketEscort: boolean;
};

export const profiles: Record<string, Profile> = {
  casual: { walkMinutes: 20, sessionHours: [8, 19], stepsPerDay: 5000, oddsThreshold: 0.6, autoShare: 0.8, patrolEngageShare: 0.3, pocketEscort: true },
  regular: { walkMinutes: 45, sessionHours: [8, 12.5, 19], stepsPerDay: 8000, oddsThreshold: 0.6, autoShare: 0.5, patrolEngageShare: 0.6, pocketEscort: true },
  dedicated: { walkMinutes: 90, sessionHours: [7, 10, 13, 17, 21], stepsPerDay: 13000, oddsThreshold: 0.6, autoShare: 0.2, patrolEngageShare: 0.8, pocketEscort: true },
};

export const simConfig = {
  /** Day 1 of every run, plus a seeded offset so seeds meet different rotations. */
  startDay: Date.UTC(2026, 10, 2),
  startOffsetDays: 60,
  /** The reference location for taverns, Sanctums and treasure (the Wellington fixture). */
  location: { latitude: -41.2865, longitude: 174.7762 } as LatLng,
  walk: {
    /** Walking speed, metres per second. */
    speed: 1.4,
    /** The greedy walker probably gathers more than a person; 0.5 halves every walk. */
    efficiency: 1,
    /** Each walk yields up to ±this share more or less than the average. */
    variation: 0.25,
    /** Walks measured per pickaxe set: the gathering balance test's places and hours. */
    sampleMinutes: 30,
    samples: [
      { latitude: -41.2865, longitude: 174.7762 },
      { latitude: 48.8566, longitude: 2.3522 },
      { latitude: 40.7128, longitude: -74.006 },
      { latitude: 35.6762, longitude: 139.6503 },
    ] as LatLng[],
    sampleHours: [6, 12, 18],
  },
  /** Patrols and travellers met while walking. */
  patrols: { enabled: true, travellerRecruits: true },
  /** A place at distance d is reachable on a day with chance min(1, scale × metres walked ÷ (2 × d)). */
  reach: { scale: 1 },
  odds: {
    /** Odds runs per estimate inside the bot (the app uses 300). */
    runs: 100,
    /** Quicker estimate used to compare heroes while building a party. */
    searchRuns: 30,
    /** Boss attempts need at least these odds. */
    boss: 0.45,
    sanctum: 0.5,
    /** Stop adding heroes to a party once its odds reach this. */
    enough: 0.9,
    /** A dungeon of the highest tier that can drop a blueprint the team lacks is worth trying at these odds. */
    blueprint: 0.35,
    /** When nothing reaches the profile's threshold and nobody is out, the best option still goes if it reaches this. */
    fallback: 0.3,
  },
  /** Consumables kept in stock. */
  stock: { healingPotion: 3, emberWardSalve: 2 } as Record<string, number>,
  provisions: {
    /** Supply points kept in stock, cooked `batch` at a time. */
    supplyBuffer: 18,
    batch: 5,
    /** Meals kept in stock, of each kind. The bot equips no kits. */
    meals: 2,
    /** Potions are drunk at home when current HP costs the party more than this much success chance. */
    potionGain: 0.15,
  },
  /** Re-forge a worn piece only when the chance of a better quality is at least this. */
  reforgeChance: 0.2,
  reforgesPerSession: 6,
  /** Gold kept back for recruits while the roster has room (on top of the next recruit's price). */
  recruitReserve: 0,
  /** Gold-equivalent of one XP point per hero, used only to rank dungeons. */
  xpGoldValue: 0.5,
  /** Guild Hall ranks are bought in this order. */
  guildPriority: [
    'gold',
    'betterRetreats',
    'stepChests',
    'heroXp',
    'tavernDiscount',
    'training',
    'fasterExpeditions',
    'shards',
    'tavernOffer',
    'rosterSlot7',
    'sigilCap',
    'rosterSlot8',
  ] as GuildTrackId[],
  /** Odds matrix: runs per cell. */
  matrix: { runs: 200 },
};

export type SimConfig = typeof simConfig;

/**
 * Hero level expected while playing each tier: the median level of the party
 * at each boss's first attempt, as `npm run sim` measures it for the regular
 * profile. The balance tests and the odds matrix use it; update it when the
 * report's "Party level at the first attempt" moves.
 */
export const expectedLevels = [3, 6, 9, 12, 15];

/** The bot's rules, printed at the top of the report. Keep in step with `bot.ts`. */
export const BOT_RULES = [
  'Day 1 starts with the tutorial, played through the real functions, then skipped to done.',
  'Walking: each session adds its share of the day’s walk, at the average yield per minute measured for the pickaxes owned (±variation). The profile’s auto-gather share of that time is walked with the phone in the pocket, at the auto-gather yield measured on the same walks (20 m radius, no detours towards nodes); the rest is spent tapping. A lure in stock is used on the first walk of the day. The day’s first gathers (the lure’s spawns, then the tapping walk, then the auto-gather walk) get the daily walking bonus: ×1.5, rounded up.',
  'Collect: finished expeditions, ready step chests and Guild Hall training.',
  'Forge: the next pickaxe as soon as it can be made; then, per hero, the biggest upgrade first (best tier of a weapon they can use, and armour). New pieces go to whoever gains most; spare pieces are salvaged. Steel is smelted when a wanted forge is short of it.',
  'Re-forge a worn piece of the best known tier while the chance of a better quality is at least 20% and the materials for one more forge remain; keep the better piece, salvage the other.',
  'Cook supply in batches of 5 (jerky while meat lasts, else trail mix) to keep 18 points in stock; then keep 3 healing potions, 2 of each meal and 2 of each charm; brew ember ward salves only when one of today’s dungeons deals fire (a fire element threat, or fire mobs).',
  'Meal: Hunter’s stew for a boss; Comfort broth when the odds are below 50%; Quick bites when they bring the party back a session earlier; Scholar’s porridge while the party is below the tier’s expected level; Merchant’s pie otherwise.',
  'Consumables: the bot equips no kits and never opts into an opportunity; an ember ward salve takes the place of a potion on runs that deal fire.',
  'HP: odds use current HP, so parties favour rested heroes. When current HP costs the chosen party more than 15 points against full HP, it drinks potions at home (most hurt first); if that is not enough, the dungeon waits for a later session.',
  'Patrols: finished expeditions are collected before the walk, so those heroes are home for it; patrols and travellers are met on walks at the measured sighting rate (by kind and tier roll), and new expeditions are sent after. During the profile’s pocket (auto-gather) share, the escort hero — the home hero with the most current HP — takes goblin and herd patrols through the game’s own background rules (70% odds, stands down under 50% HP). Anything else is engaged with probability patrolEngageShare by the cheapest party of home, non-exhausted heroes whose odds reach 0.75. Wounded travellers get a healing potion, pilgrims a meal (or supply points when 8+ are held), traders are traded with while more than 20 of the material is held; traveller recruits (offered from 6 heroes) join when the roster has room.',
  'Supply: when the stock is short for a launch and a tavern is reachable today, buy the missing points as emergency jerky.',
  'Infuse the best plain weapon with the held stone that does best against the most common enemy element of the current tier.',
  'Recruit when a tavern is reachable today, the roster has room and the gold covers the price: classes whose answers turn a missed threat of today’s tier briefings met first, then classes the roster lacks.',
  'Guild Hall: buy ranks in priority order, keeping the next recruit’s price while the roster has room.',
  'Sanctums: with a Sigil, a reachable Sanctum and odds ≥ 0.5 with the best heroes at home, use the highest Sigil tier that passes.',
  'Treasure: read every map; dig it up on a day its spot is reachable.',
  'Expeditions: the unbeaten boss of the highest tier first when its odds are ≥ 0.45. Then, while heroes are idle, the open dungeon of the top two tiers with the best expected value per hour among those with odds ≥ the profile threshold; the day’s first win and a new tier’s first clear add their rows’ gold. A dungeon of the highest tier whose tier still has a favoured gear blueprint the team lacks only needs odds ≥ 0.35. When the gap to the next session is at least the overnight expedition’s duration, the overnight expeditions of the top two tiers join the ranking at their full value over that gap — but only one overnight expedition can be out at a time. Parties are built greedily (add the hero who raises the odds most) and each hero takes a potion (an ember ward salve for fire runs).',
];
