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
  round: number;
  elite: boolean;
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
  // Defence: the hits swallowed whole come first, so nothing else fires on them.
  {
    family: 'bulwark',
    level: 3,
    hooks: {
      incoming: (i) => {
        if (!i.once('bulwark3')) return;
        i.absorbed = true;
        i.log('bulwark3', idOf(i.hero));
      },
    },
  },
  {
    family: 'warding',
    level: 2,
    hooks: {
      incoming: (i) => {
        if (i.element === undefined || !i.once('warding2')) return;
        i.absorbed = true;
        i.log('warding2', idOf(i.hero));
      },
    },
  },
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
  // Turn order and first strikes.
  {
    family: 'watch',
    level: 1,
    hooks: {
      turnOrder: (o) => {
        if (o.round !== 1) return;
        const behind = o.speed < o.fastest;
        o.speed += R.watch.firstRoundSpeed;
        if (behind && o.speed >= o.fastest && !o.first && !o.ambushed) o.log('watch1', idOf(o.hero));
      },
    },
  },
  {
    family: 'volley',
    level: 1,
    hooks: {
      turnOrder: (o) => {
        if (!o.hero.member.ranged || o.first) return;
        o.first = true;
        if (o.speed < o.fastest || o.ambushed) o.log('volley1', idOf(o.hero));
      },
    },
  },
  {
    family: 'watch',
    level: 3,
    hooks: {
      turnOrder: (o) => {
        if (o.first) return;
        o.first = true;
        if (o.speed < o.fastest || o.ambushed) o.log('watch3', idOf(o.hero));
      },
      beforeAttack: (a) => {
        if (a.elite) a.critAdd += R.watch.eliteCrit;
      },
      onHit: (h) => {
        if (h.crit && h.elite) h.log('watch3Crit', idOf(h.hero));
      },
    },
  },
  {
    family: 'shadow',
    level: 1,
    hooks: {
      beforeAttack: (a) => {
        if (a.round === 1) a.critAdd += R.shadow.firstRoundCrit;
      },
      onHit: (h) => {
        if (h.crit && h.round === 1) h.log('shadow1', idOf(h.hero));
      },
    },
  },
  {
    family: 'shadow',
    level: 3,
    hooks: {
      fightStart: (f) => {
        // Never the boss.
        const foes = f.enemies.filter((e) => e.hp > 0 && !f.isBoss && !('effect' in e.def));
        const hero = f.heroOf('shadow');
        if (foes.length === 0 || !hero || !f.once('shadow3')) return;
        const weakest = foes.reduce((low, e) => (e.hp < low.hp ? e : low));
        f.strikeDown(hero, weakest);
        f.log('shadow3', idOf(hero));
      },
    },
  },
  // Defence.
  {
    family: 'warding',
    level: 1,
    hooks: {
      incoming: (i) => {
        if (i.element === undefined) return;
        i.damage *= R.warding.elementalTaken;
        i.log('warding1', idOf(i.hero));
      },
    },
  },
  {
    family: 'warding',
    level: 3,
    hooks: {
      afterTaken: (t) => {
        if (t.element === undefined) return;
        t.reflect(t.taken * R.warding.reflect);
        t.log('warding3', idOf(t.hero));
      },
    },
  },
  {
    family: 'shadow',
    level: 2,
    hooks: {
      beforeDefend: (d) => {
        d.evasion += R.shadow.evasion;
      },
      onDodge: (d) => {
        d.counter(R.shadow.counterShare);
        d.log('shadow2', idOf(d.hero));
      },
    },
  },
  {
    family: 'bulwark',
    level: 1,
    hooks: {
      incoming: (i) => {
        if (i.hero !== i.front) return;
        i.damage *= R.bulwark.frontTaken;
        i.log('bulwark1', idOf(i.hero));
      },
    },
  },
  // The guard last: the front hero takes their share of the hit as it would land.
  {
    family: 'bulwark',
    level: 2,
    hooks: {
      incoming: (i) => {
        if (i.hero !== i.weakest || i.hero === i.front) return;
        const moved = i.damage * R.bulwark.guardShare;
        i.hurt(i.front, moved * R.bulwark.frontTaken);
        i.damage -= moved;
        i.log('bulwark2', idOf(i.front), idOf(i.hero));
      },
    },
  },
  // Armour.
  {
    family: 'breaker',
    level: 3,
    hooks: {
      beforeAttack: (a) => {
        if (!a.armoured || !a.once('breaker3')) return;
        a.target.armour *= 1 - R.breaker.shred;
        a.log('breaker3', idOf(a.hero));
      },
    },
  },
  {
    family: 'breaker',
    level: 1,
    hooks: {
      beforeAttack: (a) => {
        if (!a.armoured) return;
        a.armourKept *= 1 - R.breaker.armourIgnore;
        a.log('breaker1', idOf(a.hero));
      },
    },
  },
  {
    family: 'volley',
    level: 2,
    hooks: {
      beforeAttack: (a) => {
        if (!a.armoured || !a.hero.member.ranged) return;
        a.armourKept *= 1 - R.volley.armourIgnore;
        a.log('volley2', idOf(a.hero));
      },
    },
  },
  // Control.
  {
    family: 'watch',
    level: 2,
    hooks: {
      fightStart: (f) => {
        if (!f.ambush) return;
        f.ambush = false;
        for (const enemy of f.enemies) enemy.staggered = true;
        const watcher = f.heroOf('watch');
        f.log('watch2', watcher ? idOf(watcher) : null);
      },
    },
  },
  {
    family: 'breaker',
    level: 2,
    hooks: {
      onHit: (h) => {
        if (!h.crit || h.target.hp <= 0 || h.target.staggered) return;
        h.target.staggered = true;
        h.log('breaker2', idOf(h.hero));
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
