// Family effects in fights (doc/design/families/families.csv): each effect is
// a family level and the hooks it answers. The engine (simulate.ts) calls the
// hooks of the party's levels at fixed points of a fight; levels are
// cumulative, so a level 3 party runs the level 1 and 2 effects too.

import { familyEffectRules as R, type FamilyEffectId, type FamilyId } from '@/content/families';

import type { Element } from '../elements';
import type { FamilyLevels } from '../families/families';
import type { Tag } from '../types';
import type { EnemyState, HeroState } from './simulate';

/** What every hook gets: once-only flags, the log and the party's family heroes. */
export type FamilyBase = {
  /** True the first time `key` is asked in this fight, or in this run with `scope` 'run'. */
  once: (key: string, scope?: 'fight' | 'run') => boolean;
  /** Logs the effect, once per encounter. */
  log: (effect: FamilyEffectId, heroId: string | null, allyId?: string) => void;
  /** The first conscious hero carrying a tag of the family, else the first conscious hero. */
  heroOf: (family: FamilyId) => HeroState | undefined;
};

/** Before round 1, once the enemies stand. */
export type FightStart = FamilyBase & {
  enemies: EnemyState[];
  isBoss: boolean;
  /** The enemies strike first in round 1 (an exposed fight). */
  ambush: boolean;
  /** Fells an enemy outright, its HP credited to the hero. */
  strikeDown: (hero: HeroState, enemy: EnemyState) => void;
};

/** Each conscious hero at the start of every round: their speed, and whether they act before everyone. */
export type TurnOrder = FamilyBase & {
  round: number;
  hero: HeroState;
  speed: number;
  first: boolean;
  /** The fastest living enemy's speed. */
  fastest: number;
  /** The enemies strike first this round. */
  ambushed: boolean;
};

/** Every hit a hero makes, before its damage is rolled. */
export type Attack = FamilyBase & {
  hero: HeroState;
  target: EnemyState;
  tags: Tag[];
  /** A boss or an elite mob. */
  elite: boolean;
  round: number;
  multiplier: number;
  /** Crit chance added (0.1 is 10%). */
  critAdd: number;
  /** The share of the target's armour this hit keeps (1: all of it). */
  armourKept: number;
  /** The target has armour this hit would meet. */
  armoured: boolean;
};

/** A hero's attack landed. */
export type Hit = FamilyBase & {
  hero: HeroState;
  target: EnemyState;
  crit: boolean;
  damage: number;
};

/** An enemy attack aimed at a hero, before the dodge roll. */
export type Defend = FamilyBase & {
  hero: HeroState;
  attacker: EnemyState;
  /** Evasion points, before the cap. */
  evasion: number;
};

/** A hero dodged an enemy attack. */
export type Dodge = FamilyBase & {
  hero: HeroState;
  attacker: EnemyState;
  /** The hero strikes the attacker back for this share of a normal hit. */
  counter: (share: number) => void;
};

/** An enemy hit about to land, after the hero's defence. */
export type Incoming = FamilyBase & {
  hero: HeroState;
  attacker: EnemyState;
  tags: Tag[];
  element: Element | undefined;
  damage: number;
  /** The hit is swallowed whole. */
  absorbed: boolean;
  /** The conscious hero with the most threat (first in the party on a tie). */
  front: HeroState;
  /** The conscious hero with the lowest share of HP. */
  weakest: HeroState;
  /** Wounds another hero (a guard taking part of the hit). */
  hurt: (hero: HeroState, amount: number) => void;
};

/** An enemy hit landed on a hero. */
export type Taken = FamilyBase & {
  hero: HeroState;
  attacker: EnemyState;
  element: Element | undefined;
  taken: number;
  /** Deals damage back to the attacker, credited to the hero. */
  reflect: (amount: number) => void;
};

/** After every won fight, before the healers. */
export type BetweenFights = FamilyBase & {
  heroes: HeroState[];
};

export type FamilyHooks = {
  fightStart?: (ctx: FightStart) => void;
  turnOrder?: (ctx: TurnOrder) => void;
  beforeAttack?: (ctx: Attack) => void;
  onHit?: (ctx: Hit) => void;
  onKill?: (ctx: Hit) => void;
  beforeDefend?: (ctx: Defend) => void;
  onDodge?: (ctx: Dodge) => void;
  incoming?: (ctx: Incoming) => void;
  afterTaken?: (ctx: Taken) => void;
  betweenFights?: (ctx: BetweenFights) => void;
};

export type FamilyEffect = { family: FamilyId; level: 1 | 2 | 3; hooks: FamilyHooks };

const idOf = (hero: HeroState) => hero.member.heroId;

/** Every family effect in fights, in the order their hooks run. */
export const familyEffects: FamilyEffect[] = [
  // Damage.
  {
    family: 'faith',
    level: 1,
    hooks: {
      beforeAttack: (a) => {
        if (!a.tags.some((tag) => R.faith.vsTags.includes(tag))) return;
        a.multiplier *= R.faith.damage;
        a.log('faith1', idOf(a.hero));
      },
    },
  },
  {
    family: 'wild',
    level: 1,
    hooks: {
      incoming: (i) => {
        if (!i.tags.some((tag) => R.wild.fromTags.includes(tag))) return;
        i.damage *= R.wild.damageTaken;
        i.log('wild1', idOf(i.hero));
      },
    },
  },
  {
    family: 'bloodrage',
    level: 1,
    hooks: {
      beforeAttack: (a) => {
        if (a.hero.hp >= R.bloodrage.belowHp * a.hero.member.maxHp) return;
        a.multiplier *= R.bloodrage.damage;
        a.log('bloodrage1', idOf(a.hero));
      },
    },
  },
  {
    family: 'spellweave',
    level: 1,
    hooks: {
      beforeAttack: (a) => {
        const bonus = Math.min(R.spellweave.perRound * a.round, R.spellweave.max);
        if (a.hero.member.damageStat !== 'magic' || bonus <= 0) return;
        a.multiplier *= 1 + bonus;
        a.log('spellweave1', idOf(a.hero));
      },
    },
  },
  {
    family: 'rally',
    level: 1,
    hooks: {
      beforeAttack: (a) => {
        a.multiplier *= R.rally.damage;
        const rallier = a.heroOf('rally');
        a.log('rally1', rallier ? idOf(rallier) : null);
      },
    },
  },
];

/** The hooks a party's levels run, by hook, in effect order. */
export type ActiveHooks = { [K in keyof FamilyHooks]-?: NonNullable<FamilyHooks[K]>[] };

export function activeHooks(levels: FamilyLevels, effects: FamilyEffect[] = familyEffects): ActiveHooks {
  const hooks: ActiveHooks = {
    fightStart: [],
    turnOrder: [],
    beforeAttack: [],
    onHit: [],
    onKill: [],
    beforeDefend: [],
    onDodge: [],
    incoming: [],
    afterTaken: [],
    betweenFights: [],
  };
  for (const effect of effects) {
    if ((levels[effect.family] ?? 0) < effect.level) continue;
    for (const [name, hook] of Object.entries(effect.hooks)) (hooks[name as keyof ActiveHooks] as unknown[]).push(hook);
  }
  return hooks;
}
