import type { GuildTrackId } from '@/content/guild';

import type { LatLng } from '../generation/types';

export type Profile = {
  /** Minutes walked per day, split evenly across the sessions. */
  walkMinutes: number;
  /** Hours of the day (UTC) the app is opened, e.g. 12.5 for 12:30. */
  sessionHours: number[];
  stepsPerDay: number;
  /** Lowest odds the bot accepts for a regular expedition. */
  oddsThreshold: number;
};

export const profiles: Record<string, Profile> = {
  casual: { walkMinutes: 20, sessionHours: [8, 19], stepsPerDay: 5000, oddsThreshold: 0.6 },
  regular: { walkMinutes: 45, sessionHours: [8, 12.5, 19], stepsPerDay: 8000, oddsThreshold: 0.6 },
  dedicated: { walkMinutes: 90, sessionHours: [7, 10, 13, 17, 21], stepsPerDay: 13000, oddsThreshold: 0.6 },
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
  /** A place at distance d is reachable on a day with chance min(1, scale × metres walked ÷ (2 × d)). */
  reach: { scale: 1 },
  odds: {
    /** Odds runs per estimate inside the bot (the app uses 100). */
    runs: 24,
    /** Boss attempts need at least these odds. */
    boss: 0.45,
    sanctum: 0.5,
    /** Stop adding heroes to a party once its odds reach this. */
    enough: 0.9,
    /** When nothing reaches the profile's threshold and nobody is out, the best option still goes if it reaches this. */
    fallback: 0.3,
  },
  /** Consumables kept in stock. */
  stock: { healingPotion: 3, ration: 3, fireResistanceElixir: 2 } as Record<string, number>,
  /** Re-forge a worn piece only when the chance of a better quality is at least this. */
  reforgeChance: 0.2,
  reforgesPerSession: 6,
  /** Gold kept back for recruits while the roster has room (on top of the next recruit's price). */
  recruitReserve: 0,
  /** Gold-equivalent of one XP point per hero, used only to rank dungeons. */
  xpGoldValue: 0.5,
  /** Guild Hall ranks are bought in this order. */
  guildPriority: [
    'mainRewards',
    'gold',
    'betterRetreats',
    'stepChests',
    'heroXp',
    'tavernDiscount',
    'training',
    'fasterExpeditions',
    'shards',
    'tavernOffer',
    'scouting',
    'rosterSlot7',
    'partySlot',
    'sigilCap',
    'rosterSlot8',
  ] as GuildTrackId[],
  /** Odds matrix: runs per cell and the level of the reference team at each tier. */
  matrix: { runs: 200, levels: [1, 3, 5, 7, 9] },
};

export type SimConfig = typeof simConfig;

/** The bot's rules, printed at the top of the report. Keep in step with `bot.ts`. */
export const BOT_RULES = [
  'Day 1 starts with the tutorial, played through the real functions, then skipped to done.',
  'Walking: each session adds its share of the day’s walk, at the average yield per minute measured for the pickaxes owned (±variation). A lure in stock is used on the first walk of the day.',
  'Collect: finished expeditions, ready step chests and Guild Hall training.',
  'Forge: the next pickaxe as soon as it can be made; then, per hero, the biggest upgrade first (best tier of a weapon they can use, and armour). New pieces go to whoever gains most; spare pieces are salvaged. Steel is smelted when a wanted forge is short of it.',
  'Re-forge a worn piece of the best known tier while the chance of a better quality is at least 20% and the materials for one more forge remain; keep the better piece, salvage the other.',
  'Keep 3 healing potions and 3 rations; brew fire elixirs only when one of today’s dungeons deals fire.',
  'Infuse the best plain weapon with the held stone that does best against the most common enemy element of the current tier.',
  'Recruit when a tavern is reachable today, the roster has room and the gold covers the price: classes that counter the current tier’s tags first, then classes the roster lacks.',
  'Guild Hall: buy ranks in priority order, keeping the next recruit’s price while the roster has room.',
  'Sanctums: with a Sigil, a reachable Sanctum and odds ≥ 0.5 with the best heroes at home, use the highest Sigil tier that passes.',
  'Treasure: read every map; dig it up on a day its spot is reachable.',
  'Expeditions: the unbeaten boss of the highest tier first when its odds are ≥ 0.45. Then, while heroes are idle, the open dungeon of the top two tiers with the best expected value per hour among those with odds ≥ the profile threshold. Parties are built greedily (add the hero who raises the odds most) and each hero takes a potion (a fire elixir for fire dungeons, a ration when out of potions).',
];
