import type { OpportunityId, ThreatId } from '@/game/types';

/** The kinds of places home heroes can fight at. */
export type FightPlaceKind =
  | 'banditCamp'
  | 'goblinRaid'
  | 'beastDen'
  | 'hauntedCrypt'
  | 'elementalRift'
  | 'abandonedCaravan'
  | 'wantedOutlaw'
  | 'monsterLair';

/** How a fight at one kind of place plays: its threat, party size and mobs. */
export type PlaceFightKindRules = {
  /** The threat its briefing carries; a caravan's varies per spawn. */
  threat: ThreatId | ThreatId[];
  /** Max heroes on the fight. */
  party: number;
  /** Minutes the fight takes. */
  minutes: number;
  /** Elite mobs, like an elite patrol. */
  elite: boolean;
  /** Fight groups before the boss, as place mob roles (see enemies.ts). */
  groups: { role: 'weak' | 'normal'; count: number; weight: number }[];
};

/** How fight events and the monster lair play, and what a lair does to patrols. */
export const placeFightRules = {
  kinds: {
    banditCamp: {
      threat: 'thieves',
      party: 3,
      minutes: 15,
      elite: false,
      groups: [
        { role: 'weak', count: 2, weight: 2 },
        { role: 'normal', count: 2, weight: 2 },
      ],
    },
    goblinRaid: {
      threat: 'ambush',
      party: 3,
      minutes: 8,
      elite: false,
      groups: [
        { role: 'weak', count: 3, weight: 2 },
        { role: 'normal', count: 2, weight: 1 },
      ],
    },
    beastDen: {
      threat: 'beasts',
      party: 3,
      minutes: 10,
      elite: false,
      groups: [
        { role: 'weak', count: 2, weight: 2 },
        { role: 'normal', count: 2, weight: 1 },
      ],
    },
    hauntedCrypt: {
      threat: 'undead',
      party: 3,
      minutes: 12,
      elite: false,
      groups: [
        { role: 'weak', count: 2, weight: 2 },
        { role: 'normal', count: 2, weight: 2 },
      ],
    },
    elementalRift: {
      threat: 'element',
      party: 3,
      minutes: 10,
      elite: false,
      groups: [
        { role: 'weak', count: 2, weight: 2 },
        { role: 'normal', count: 2, weight: 2 },
      ],
    },
    abandonedCaravan: {
      threat: ['thieves', 'ambush', 'beasts', 'undead'],
      party: 3,
      minutes: 8,
      elite: false,
      groups: [
        { role: 'weak', count: 2, weight: 2 },
        { role: 'normal', count: 2, weight: 2 },
      ],
    },
    wantedOutlaw: {
      threat: 'brute',
      party: 3,
      minutes: 20,
      elite: true,
      groups: [
        { role: 'weak', count: 2, weight: 2 },
        { role: 'normal', count: 2, weight: 1 },
      ],
    },
    monsterLair: {
      threat: 'brute',
      party: 3,
      minutes: 30,
      elite: true,
      groups: [
        { role: 'weak', count: 3, weight: 2 },
        { role: 'normal', count: 3, weight: 2 },
      ],
    },
  } satisfies Record<FightPlaceKind, PlaceFightKindRules>,
  /** Chance a place's briefing carries one opportunity. */
  opportunityChance: 0.2,
  opportunities: ['hiddenCache', 'bounty', 'forgottenShrine', 'healingSpring'] as OpportunityId[],
  /** XP per hero, a share of the tier's short dungeon. */
  xpShareOfShortDungeon: 0.3,
  /** Briefing threats rise to level 2 once the player's highest tier reaches this. */
  levelTwoFromTier: 3,
  lair: {
    /** Tiles this close to a live lair spawn more patrols. */
    radiusMeters: 800,
    /** Patrol spawn weights for 0, 1 and 2 in a boosted tile. */
    patrolCountWeights: [0.1, 0.4, 0.5],
    minParty: 2,
  },
};

export type PlaceFightRules = typeof placeFightRules;
