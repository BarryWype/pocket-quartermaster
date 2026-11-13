// Family effects in fights (doc/design/families/families.csv): each effect is
// a family level and the hooks it answers. The engine (simulate.ts) calls the
// hooks of the party's levels at fixed points of a fight; levels are
// cumulative, so a level 3 party runs the level 1 and 2 effects too.

import { familyEffectRules as R, type FamilyEffectId, type FamilyId } from '@/content/families';
import { monsterParts } from '@/content/loot/monsterParts';

import type { Element } from '../elements';
import type { FamilyLevels } from '../families/families';
import type { Tag } from '../types';
import type { EnemyState, HeroState } from './simulate';

/** Enemies Breaker 2 has staggered (enemies are new objects every fight). */
const staggeredOnce = new WeakSet<EnemyState>();

/** The hero with the most Pack tags (the first in party order on a tie), whose hit the spirit hound copies. */
function packCarrier(f: FamilyBase): HeroState | undefined {
  const count = (h: HeroState) => h.member.familyTags.filter((t) => t.family === 'pack').reduce((n, t) => n + t.count, 0);
  return f.alive().reduce<HeroState | undefined>((best, h) => (!best || count(h) > count(best) ? h : best), undefined);
}

/** What every hook gets: once-only flags, the log and the party's family heroes. */
export type FamilyBase = {
  /** True the first time `key` is asked in this fight, or in this run with `scope` 'run'. */
  once: (key: string, scope?: 'fight' | 'run') => boolean;
  /** Logs the effect, once per encounter. */
  log: (effect: FamilyEffectId, heroId: string | null, allyId?: string) => void;
  /** The first conscious hero carrying a tag of the family, else the first conscious hero. */
  heroOf: (family: FamilyId) => HeroState | undefined;
  /** The conscious heroes. */
  alive: () => HeroState[];
  /** Heals the hero this share of max HP (times the run's healing); the HP healed. */
  heal: (hero: HeroState, share: number) => number;
  /** True with this chance, from the run's rng; a chance of 1 or more draws nothing. */
  chance: (p: number) => boolean;
  /** One of the items, at random from the run's rng. */
  pick: <T>(items: readonly T[]) => T;
};

/** Once, as the run starts. */
export type RunStart = {
  /** Extra uses each hero's special gets in the run once its own are spent. */
  specialUses: number;
};

/** Once the run's steps before the boss are drawn. */
export type RunPlan = {
  /** The regular fights: their step, and their enemies' HP times damage, summed. */
  fights: { index: number; strength: number }[];
  /** The first hero carrying a tag of the family, else the first hero. */
  heroOf: (family: FamilyId) => HeroState | undefined;
  /** The step passes quietly, with this effect in its log line. */
  skip: (index: number, effect: FamilyEffectId, heroId: string | null) => void;
  /** The fight at this step is ambushed: its enemies lose their first turn. */
  ambush: (index: number, effect: FamilyEffectId, heroId: string | null) => void;
};

/** Before round 1, once the enemies stand. */
export type FightStart = FamilyBase & {
  enemies: EnemyState[];
  isBoss: boolean;
  /** The enemies strike first in round 1 (an exposed fight). */
  ambush: boolean;
  /** Fells an enemy outright, its HP credited to the hero. */
  strikeDown: (hero: HeroState, enemy: EnemyState) => void;
  /** Wounds an enemy for this much HP, at most what it has, credited to the hero. */
  strike: (hero: HeroState, enemy: EnemyState, amount: number) => void;
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
  /** The target carries a poison (any dot of this fight). */
  poisoned: boolean;
  /** The hero's element beats the target's on the wheel. */
  beats: boolean;
  /** Scales the wheel's bonus above 1 when the hero's element beats the target's. */
  advantageScale: number;
  /** The hero's own attack (not a special, a counter or a jump). */
  main: boolean;
  /** The hit strikes every living enemy, not just the target (own attacks only). */
  allEnemies: boolean;
};

/** A hero's attack landed. */
export type Hit = FamilyBase & {
  hero: HeroState;
  target: EnemyState;
  /** The target's tags. */
  tags: Tag[];
  crit: boolean;
  damage: number;
  round: number;
  elite: boolean;
  /** An elemental hero's hit jumps to the next living enemy for this share, in the same element; the enemy hit, or null. */
  jump: (share: number) => EnemyState | null;
};

/** A summon joins the party's side: a special's ally, a raised enemy, Pack 3's beast or a calmed one. */
export type Summon = FamilyBase & {
  /** The hero it fights for. */
  hero: HeroState;
  /** Its damage each round (a raised enemy's: the multiplier on its own damage). */
  damage: number;
  /** Rounds it stays; null for the whole fight. */
  rounds: number | null;
};

/** Once the fight-start specials have fired, before round 1. */
export type FightReady = FamilyBase & {
  enemies: EnemyState[];
  isBoss: boolean;
  /** The hero summons an ally dealing this share of their hit on the first living enemy, for these rounds; false with no enemy left. */
  summon: (hero: HeroState, share: number, rounds: number) => boolean;
  /** The enemy leaves the fight and strikes for the hero's side for the rest of it, at its own damage. */
  tame: (hero: HeroState, enemy: EnemyState) => void;
};

/** A hero's turn is over (their attack and any second blow). */
export type AfterAttack = FamilyBase & {
  hero: HeroState;
  round: number;
  /** The hero strikes once more, as a second blow. */
  extra: boolean;
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

/** A hero is about to be knocked out (not in a guaranteed run). */
export type Knockout = FamilyBase & {
  hero: HeroState;
  /** Set to a share of max HP to get the hero back up at it; the run still counts the knockout. */
  revive: number | null;
};

/** After every won fight, boss included, while someone stands. */
export type AfterFight = FamilyBase & {
  heroes: HeroState[];
  /** Every enemy tag of the fight. */
  tags: Tag[];
  /** Each enemy's tags. */
  foes: Tag[][];
  isBoss: boolean;
  /** Adds a material to what the run brings home. */
  addMaterial: (materialId: string, amount: number) => void;
};

/** A hidden cache step, or a taken Hidden cache or Sealed vault opportunity. */
export type Cache = FamilyBase & {
  /** A hidden cache step (not an opportunity). */
  step: boolean;
  /** The step's gold share of the dungeon's top gold, as a hidden cache's finder lifts it. */
  worth: number;
  /** Gold the step pays. */
  gold: number;
  /** Extra rolls of the main loot row on a won run. */
  rolls: number;
};

/** Once the run is over, on its last encounter. */
export type RunEnd = FamilyBase & {
  won: boolean;
  /** Encounters cleared. */
  cleared: number;
};

/** Every landed hit, before its Venomous poison: whether the hit poisons its target. */
export type PoisonChance = FamilyBase & {
  hero: HeroState;
  target: EnemyState;
  /** The hit's draw in [0, 1): it poisons below the chance. */
  roll: number;
  /** The Venomous affix's chance. */
  affixChance: number;
  /** The hit poisons; effects may set it. */
  poisons: boolean;
};

/** A Venomous proc on an enemy, before its poison is added or refreshed. */
export type PoisonCap = FamilyBase & {
  hero: HeroState;
  target: EnemyState;
  /** The Venomous poisons the enemy already carries. */
  stacks: number;
  /** How many it may carry; effects may raise it. */
  cap: number;
  /** The poison's share of the hit; effects may raise it. */
  share: number;
};

export type FamilyHooks = {
  runStart?: (ctx: RunStart) => void;
  runPlan?: (ctx: RunPlan) => void;
  fightStart?: (ctx: FightStart) => void;
  turnOrder?: (ctx: TurnOrder) => void;
  beforeAttack?: (ctx: Attack) => void;
  onHit?: (ctx: Hit) => void;
  onKill?: (ctx: Hit) => void;
  afterAttack?: (ctx: AfterAttack) => void;
  summon?: (ctx: Summon) => void;
  fightReady?: (ctx: FightReady) => void;
  cache?: (ctx: Cache) => void;
  runEnd?: (ctx: RunEnd) => void;
  beforeDefend?: (ctx: Defend) => void;
  onDodge?: (ctx: Dodge) => void;
  incoming?: (ctx: Incoming) => void;
  afterTaken?: (ctx: Taken) => void;
  betweenFights?: (ctx: BetweenFights) => void;
  knockout?: (ctx: Knockout) => void;
  afterFight?: (ctx: AfterFight) => void;
  poisonChance?: (ctx: PoisonChance) => void;
  poisonCap?: (ctx: PoisonCap) => void;
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
        i.damage *= R.bulwark.firstHitTaken;
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
        i.damage *= R.warding.firstHitTaken;
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
    family: 'spellweave',
    level: 2,
    hooks: {
      onHit: (h) => {
        if (h.jump(R.spellweave.chainShare)) h.log('spellweave2', idOf(h.hero));
      },
    },
  },
  {
    family: 'spellweave',
    level: 3,
    hooks: {
      beforeAttack: (a) => {
        if (a.hero.member.damageStat === 'magic' && a.round >= 2) {
          a.multiplier *= R.spellweave.lateDamage;
          a.log('spellweave3Late', idOf(a.hero));
        }
        if (!a.beats) return;
        a.advantageScale *= R.spellweave.advantageScale;
        a.log('spellweave3', idOf(a.hero));
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
      beforeAttack: (a) => {
        if (!a.hero.member.ranged) return;
        a.multiplier *= R.volley.damage;
        a.log('volley1', idOf(a.hero));
      },
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
        if (o.first || o.round !== 1) return;
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
        if (foes.length === 0 || !hero || !f.once('shadow3') || !f.chance(R.shadow.strikeChance)) return;
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
        if (!a.main || !a.once('breaker3')) return;
        a.multiplier *= R.breaker.firstHit;
        if (a.armoured) a.target.armour *= 1 - R.breaker.shred;
        a.log('breaker3', idOf(a.hero));
      },
    },
  },
  {
    family: 'breaker',
    level: 1,
    hooks: {
      beforeAttack: (a) => {
        a.multiplier *= R.breaker.damage;
        if (a.armoured) a.armourKept *= 1 - R.breaker.armourIgnore;
        a.log('breaker1', idOf(a.hero));
      },
    },
  },
  // Control.
  {
    family: 'watch',
    level: 2,
    hooks: {
      runPlan: (p) => {
        const watcher = p.heroOf('watch');
        const weakest = [...p.fights].sort((a, b) => a.strength - b.strength || a.index - b.index).slice(0, R.watch.ambushedFights);
        for (const fight of weakest) p.ambush(fight.index, 'watch2', watcher ? idOf(watcher) : null);
      },
    },
  },
  {
    family: 'breaker',
    level: 2,
    hooks: {
      onHit: (h) => {
        if (!h.crit || h.target.hp <= 0 || h.target.staggered || staggeredOnce.has(h.target) || !h.chance(R.breaker.staggerChance)) return;
        // Enemies are new objects every fight, so this holds once per enemy and fight.
        staggeredOnce.add(h.target);
        h.target.staggered = true;
        h.log('breaker2', idOf(h.hero));
      },
    },
  },
  // Extra actions.
  {
    family: 'bloodrage',
    level: 3,
    hooks: {
      afterAttack: (a) => {
        // Once per fight: the first time the hero acts below the threshold.
        if (a.hero.hp >= R.bloodrage.extraBelowHp * a.hero.member.maxHp || !a.once(`bloodrage3:${idOf(a.hero)}`)) return;
        a.extra = true;
        a.log('bloodrage3', idOf(a.hero));
      },
    },
  },
  {
    family: 'volley',
    level: 2,
    hooks: {
      beforeAttack: (a) => {
        if (!a.main) return;
        // The opening volley: a ranged hero looses it; without one, the volley's own hero.
        const volleyer = a.alive().find((h) => h.member.ranged) ?? a.heroOf('volley');
        if (a.hero !== volleyer || !a.once(`volley:${idOf(a.hero)}`)) return;
        a.allEnemies = true;
        a.log('volley2', idOf(a.hero));
      },
    },
  },
  {
    family: 'volley',
    level: 3,
    hooks: {
      beforeAttack: (a) => {
        // The opening volley strikes a second time: the volleyer's next blow hits every enemy too.
        if (!a.main || a.allEnemies) return;
        const volleyer = a.alive().find((h) => h.member.ranged) ?? a.heroOf('volley');
        if (a.hero !== volleyer || a.once(`volley:${idOf(a.hero)}`) || !a.once(`volley3:${idOf(a.hero)}`)) return;
        a.allEnemies = true;
        a.log('volley3', idOf(a.hero));
      },
    },
  },
  // Specials.
  {
    family: 'rally',
    level: 3,
    hooks: {
      runStart: (r) => {
        r.specialUses += R.rally.extraSpecialUses;
      },
      beforeAttack: (a) => {
        a.multiplier *= R.rally.lateDamage;
        const rallier = a.heroOf('rally');
        a.log('rally3Damage', rallier ? idOf(rallier) : null);
      },
    },
  },
  // Summons.
  {
    family: 'pack',
    level: 2,
    hooks: {
      summon: (s) => {
        if (s.rounds !== null) s.rounds += R.pack.extraRounds;
        s.damage *= R.pack.damage;
        s.log('pack2', idOf(s.hero));
      },
    },
  },
  // Calmed first, so Pack 3's summon never aims at the calmed beast.
  {
    family: 'wild',
    level: 3,
    hooks: {
      fightReady: (f) => {
        if (f.isBoss) return;
        const beast = f.enemies.find(
          (e) => e.hp > 0 && !('effect' in e.def) && !e.def.id.includes(':elite') && e.def.tags.some((tag) => R.wild.fromTags.includes(tag)),
        );
        const hero = f.heroOf('wild');
        if (!beast || !hero || !f.once('wild3', 'run')) return;
        f.tame(hero, beast);
        f.log('wild3', idOf(hero));
      },
    },
  },
  {
    family: 'pack',
    level: 1,
    hooks: {
      fightReady: (f) => {
        const hero = packCarrier(f);
        if (hero && f.summon(hero, R.pack.houndShare, R.pack.houndRounds)) f.log('pack1', idOf(hero));
      },
    },
  },
  {
    family: 'pack',
    level: 3,
    hooks: {
      fightReady: (f) => {
        const hero = packCarrier(f);
        if (hero && f.summon(hero, R.pack.houndShare, R.pack.houndRounds)) f.log('pack3', idOf(hero));
      },
    },
  },
  // Healing and revival.
  {
    family: 'faith',
    level: 2,
    hooks: {
      onHit: (h) => {
        if (h.heal(h.hero, (R.faith.healShare * h.damage) / h.hero.member.maxHp) > 0) h.log('faith2', idOf(h.hero));
      },
    },
  },
  {
    family: 'faith',
    level: 3,
    hooks: {
      knockout: (k) => {
        if (!k.once('faith3', 'run')) return;
        k.revive = R.faith.revivePct;
        k.log('faith3', idOf(k.hero));
      },
    },
  },
  {
    family: 'wild',
    level: 2,
    hooks: {
      afterFight: (f) => {
        if (!f.tags.some((tag) => R.wild.fromTags.includes(tag))) return;
        for (const hero of f.heroes) f.heal(hero, R.wild.healShare);
        f.addMaterial(R.wild.part, R.wild.parts);
        const hero = f.heroOf('wild');
        f.log('wild2', hero ? idOf(hero) : null);
      },
    },
  },
  {
    family: 'bloodrage',
    level: 2,
    hooks: {
      onKill: (h) => {
        if (h.heal(h.hero, R.bloodrage.healOnKill) > 0) h.log('bloodrage2', idOf(h.hero));
      },
    },
  },
  {
    family: 'rally',
    level: 2,
    hooks: {
      betweenFights: (b) => {
        const healed = b.heroes.reduce((sum, hero) => sum + b.heal(hero, R.rally.healShare), 0);
        const hero = b.heroOf('rally');
        if (healed > 0) b.log('rally2', hero ? idOf(hero) : null);
      },
    },
  },
  // Traps.
  {
    family: 'cunning',
    level: 1,
    hooks: {
      fightStart: (f) => {
        const standing = f.enemies.filter((e) => e.hp > 0);
        const hero = f.heroOf('cunning');
        if (standing.length === 0 || !hero) return;
        const enemy = f.pick(standing);
        f.strike(hero, enemy, enemy.maxHp * R.cunning.trapHit);
        f.log('cunning1', idOf(hero));
      },
    },
  },
  // Loot and economy.
  {
    family: 'plunder',
    level: 1,
    hooks: {
      runEnd: (r) => {
        if (r.cleared > 0) r.log('plunder1', null);
      },
    },
  },
  {
    family: 'plunder',
    level: 2,
    hooks: {
      afterFight: (f) => {
        // The part most of the fight's enemies carry the tag of; the first in the catalogue on a tie.
        const counts = monsterParts.map((part) => f.foes.filter((tags) => tags.includes(part.tag)).length);
        const most = Math.max(...counts);
        if (most === 0) return;
        f.addMaterial(monsterParts[counts.indexOf(most)].id, R.plunder.partsPerFight);
        f.log('plunder2', null);
      },
    },
  },
  {
    family: 'plunder',
    level: 3,
    hooks: {
      runEnd: (r) => {
        if (r.won) r.log('plunder3', null);
      },
    },
  },
  {
    family: 'cunning',
    level: 2,
    hooks: {
      cache: (c) => {
        if (!c.step) return;
        c.gold = c.worth;
        const hero = c.heroOf('cunning');
        c.log('cunning2', hero ? idOf(hero) : null);
      },
    },
  },
  {
    family: 'cunning',
    level: 3,
    hooks: {
      cache: (c) => {
        c.rolls += R.cunning.cacheRolls;
        const hero = c.heroOf('cunning');
        c.log('cunning3', hero ? idOf(hero) : null);
      },
    },
  },
  // Poison.
  {
    family: 'venom',
    level: 1,
    hooks: {
      poisonChance: (p) => {
        // Only a hit the affix alone would not have poisoned is the family's doing.
        if (p.poisons || p.roll >= p.affixChance + R.venom.poisonChance) return;
        p.poisons = true;
        p.log('venom1', idOf(p.hero));
      },
    },
  },
  {
    family: 'venom',
    level: 2,
    hooks: {
      poisonCap: (c) => {
        c.cap = R.venom.maxStacks;
        c.share = R.venom.stackShare;
        // Only a stack past the base cap is the family's doing.
        if (c.stacks >= R.venom.baseStacks && c.stacks < R.venom.maxStacks) c.log('venom2', idOf(c.hero));
      },
    },
  },
  {
    family: 'venom',
    level: 3,
    hooks: {
      beforeAttack: (a) => {
        if (!a.poisoned) return;
        a.multiplier *= R.venom.poisonedTaken;
        a.log('venom3', idOf(a.hero));
      },
    },
  },
];

/** The hooks a party's levels run, by hook, in effect order. */
export type ActiveHooks = { [K in keyof FamilyHooks]-?: NonNullable<FamilyHooks[K]>[] };

export function activeHooks(levels: FamilyLevels, effects: FamilyEffect[] = familyEffects): ActiveHooks {
  const hooks: ActiveHooks = {
    runStart: [],
    runPlan: [],
    fightStart: [],
    turnOrder: [],
    beforeAttack: [],
    onHit: [],
    onKill: [],
    afterAttack: [],
    summon: [],
    fightReady: [],
    cache: [],
    runEnd: [],
    beforeDefend: [],
    onDodge: [],
    incoming: [],
    afterTaken: [],
    betweenFights: [],
    knockout: [],
    afterFight: [],
    poisonChance: [],
    poisonCap: [],
  };
  for (const effect of effects) {
    if ((levels[effect.family] ?? 0) < effect.level) continue;
    for (const [name, hook] of Object.entries(effect.hooks)) (hooks[name as keyof ActiveHooks] as unknown[]).push(hook);
  }
  return hooks;
}

/** The family effect behind each active hook, in the same order as `activeHooks` (`wild1`): the run's tally credits it. */
export function activeHookOwners(levels: FamilyLevels, effects: FamilyEffect[] = familyEffects): Record<keyof ActiveHooks, FamilyEffectId[]> {
  const owners = Object.fromEntries(Object.keys(activeHooks({}, [])).map((name) => [name, []])) as unknown as Record<keyof ActiveHooks, FamilyEffectId[]>;
  for (const effect of effects) {
    if ((levels[effect.family] ?? 0) < effect.level) continue;
    for (const name of Object.keys(effect.hooks)) owners[name as keyof ActiveHooks].push(`${effect.family}${effect.level}` as FamilyEffectId);
  }
  return owners;
}
