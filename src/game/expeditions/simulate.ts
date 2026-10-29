import { expeditionRules } from '@/content/dungeons';
import { mobById, mobTags, npcMobId } from '@/content/enemies';
import { eventById } from '@/content/events';
import { localsRules, npcById } from '@/content/npcs';
import { heroClasses } from '@/content/heroes';
import { concealedWeapons, restrictionRules } from '@/content/threats';
import { travellerRules } from '@/content/patrols';
import { gearName, itemById, opportunityById } from '@/content/lookup';

import { ELEMENTS, beats, incomingMultiplier, shardId, weaponMultiplier, type Element } from '../elements';
import { createRng } from '../generation/rng';
import type { SaveData } from '../save';
import { currentHp } from '../team/health';
import { heroAbilities, heroStats } from '../team/team';
import { heroAnswers, type AnswersMember, type HeroAnswers } from '../threats/answers';
import { threatPenalties, type AppliedPenalty } from '../threats/penalties';
import { scoreBriefing, scoreOpportunity, type ThreatScore } from '../threats/score';
import type {
  Ability,
  BossDef,
  Briefing,
  ConsumableDef,
  DungeonDef,
  EncounterDef,
  ExpeditionOutcome,
  GearDef,
  HeroClassId,
  Hunger,
  MaterialStack,
  MealEffect,
  MobDef,
  MobGroup,
  NpcHelp,
  OpportunityOutcome,
  Tag,
  WeaponType,
} from '../types';
import { hungerEffect } from './provisions';

export type ExpeditionRules = typeof expeditionRules;

/** A briefing with nothing in it: expeditions launched before briefings existed play this. */
export const EMPTY_BRIEFING: Briefing = { threats: [], restriction: null, opportunity: null };

/** A hero as they set out; stats stay fixed for the whole run. */
export type PartyMember = {
  heroId: string;
  name: string;
  classId: HeroClassId;
  /** Personal trait id; party-wide trait effects count once per trait. */
  traitId: string;
  weaponName: string | null;
  /** The weapon's type, or null unarmed; keywords and Sacred ground play on it. */
  weaponType: WeaponType | null;
  maxHp: number;
  /** HP at the start of the run. */
  hp: number;
  /** Damage per round: attack + magic. */
  damage: number;
  /** The magic part of `damage`. */
  magic: number;
  defense: number;
  threat: number;
  /** Elements this hero takes no extra damage from (class resist, protective consumable). */
  resists: Element[];
  /** Class abilities and trait effects. */
  abilities: Ability[];
  /** The infused weapon's element, or the class's innate one. */
  weaponElement?: Element;
  armourElement?: Element;
  /** Potion, kit, ward salve or charm. */
  consumable: ConsumableDef | null;
};

/** An ability that changed an encounter, for the log. `heroId` is null for a local's tip. */
export type AbilityEffect = {
  heroId: string | null;
  key:
    | 'tagBonus'
    | 'tip'
    | 'trapReduce'
    | 'pickpocket'
    | 'rage'
    | 'buff'
    | 'protect'
    | 'partyHeal'
    | 'crit'
    | 'cacheBonus'
    | 'advantage'
    /** The enemies struck first in this fight (an exposed fight). */
    | 'exposed'
    /** Poison wounds after the fight. */
    | 'poison'
    /** An enemy caster wounded this hero before the fight. */
    | 'casters'
    /** Hunter's stew before the boss (`heroId` null). */
    | 'stew';
  tag?: Tag;
  /** The ally a `protect` shielded. */
  allyId?: string;
};

export type LocalsReaction = 'help' | 'fight' | 'steal' | 'neutral';

/** What happened in one encounter, for rewards and the log. Per-hero maps are keyed by hero id. */
export type EncounterResult = {
  kind: 'fight' | 'boss' | 'trap' | 'locals' | 'quiet' | 'mishap';
  /** Trap, NPC, event or boss name. */
  name: string;
  /** The enemies of a fight. */
  mobs: MobGroup[];
  cleared: boolean;
  rounds: number;
  dealt: Record<string, number>;
  taken: Record<string, number>;
  healed: Record<string, number>;
  /** Heroes who drank a potion or ate a ration here. */
  consumed: string[];
  knockedOut: string[];
  /** A live trap went off (a met threat's trap never catches anyone). */
  trapTriggered: boolean;
  gold: number;
  effects: AbilityEffect[];
  reaction?: LocalsReaction;
  /** What the locals did to help. */
  help?: NpcHelp;
  /** Pickpocketed locals noticed and fought. */
  noticed?: boolean;
};

/** The briefing's opportunity at the run's midpoint, and what it gave. */
export type RunOpportunity = OpportunityOutcome & {
  /** The hero whose kit answered it, when one did (see salvage). */
  kitHeroId?: string | null;
};

export type RunResult = {
  encounters: EncounterResult[];
  encounterCount: number;
  encountersCleared: number;
  bossDefeated: boolean;
  outcome: ExpeditionOutcome;
  bonusGold: number;
  hp: { heroId: string; hp: number; maxHp: number }[];
  /** Heroes whose healing consumable (potion or kit heal) was used up during the run. */
  consumed: string[];
  /** Heroes who attacked at least once (a crit charm that never did is salvaged). */
  attacked: string[];
  /** Elements whose damage each ward salve holder took (salvage decides on them). */
  damageElements: Record<string, Element[]>;
  /** The briefing's threats scored against this party. */
  threats: ThreatScore[];
  /** The midpoint opportunity and what it gave, or null when there was none. */
  opportunity: RunOpportunity | null;
  /** Share of the dungeon's gold and materials lost to missed threats (0-1). */
  lostLoot: number;
  /** Share of expedition time the missed threats add (paid at launch). */
  delay: number;
};

/** What the party ate and signed up for: the same for the odds preview and the real run. */
export type RunProvisions = {
  hunger?: Hunger;
  meal?: MealEffect | null;
  /** The dungeon's briefing: what the run plays against. Empty when left out. */
  briefing?: Briefing | null;
  /** The party opted into the briefing's opportunity cost. */
  optIn?: boolean;
};

export type RunOptions = RunProvisions & {
  rules?: ExpeditionRules;
  /** The tutorial run: heroes can't drop below 1 HP, so the boss always falls eventually. */
  guaranteed?: boolean;
};

type HeroState = {
  member: PartyMember;
  hp: number;
  out: boolean;
  consumableLeft: boolean;
  /** Damage multiplier from the supply status. */
  fed: number;
};
type EnemyState = { def: MobDef | BossDef; hp: number };

/** A party member as `heroAnswers` sees them: weapon, kit and class resists. */
export function answersMemberOf(member: PartyMember): AnswersMember {
  return {
    heroId: member.heroId,
    classId: member.classId,
    traitId: member.traitId,
    weaponType: member.weaponType,
    kit: member.consumable?.kit ? { itemId: member.consumable.id, effect: member.consumable.kit } : null,
    salveElement: member.consumable?.protectsAgainst ?? null,
    classResists: heroClasses[member.classId].resists ?? [],
  };
}

/**
 * The heroes as they set out, with their HP at `now` (heroes away keep the HP
 * they left with; left out, HP as stored).
 */
export function prepareParty(save: SaveData, heroIds: string[], now = 0): PartyMember[] {
  return save.heroes
    .filter((hero) => heroIds.includes(hero.id))
    .map((hero) => {
      const heroClass = heroClasses[hero.classId];
      const stats = heroStats(save, hero);
      const weapon = save.gear.find((g) => g.uid === hero.equipment.weapon);
      const armour = save.gear.find((g) => g.uid === hero.equipment.armor);
      const item = hero.equipment.consumable ? itemById[hero.equipment.consumable] : null;
      const consumable = item?.slot === 'consumable' ? item : null;
      const charm = consumable?.charm;
      return {
        heroId: hero.id,
        name: hero.name,
        classId: hero.classId,
        traitId: hero.trait,
        weaponName: weapon ? gearName(weapon) : null,
        weaponType: weapon ? ((itemById[weapon.itemId] as GearDef).weaponType ?? null) : null,
        maxHp: stats.hp,
        hp: currentHp(save, hero, now),
        damage: stats.attack + stats.magic,
        magic: stats.magic,
        defense: stats.defense,
        threat: heroClass.threat,
        resists: [...(heroClass.resists ?? []), ...(consumable?.protectsAgainst ? [consumable.protectsAgainst] : [])],
        abilities: [
          ...heroAbilities(hero),
          ...(charm?.kind === 'crit' ? [{ kind: 'critBonus', chance: charm.chance } satisfies Ability] : []),
        ],
        weaponElement: weapon?.element ?? heroClass.element,
        armourElement: armour?.element,
        consumable,
      };
    });
}

function emptyResult(kind: EncounterResult['kind'], name: string, mobs: MobGroup[] = []): EncounterResult {
  return {
    kind,
    name,
    mobs,
    cleared: false,
    rounds: 0,
    dealt: {},
    taken: {},
    healed: {},
    consumed: [],
    knockedOut: [],
    trapTriggered: false,
    gold: 0,
    effects: [],
  };
}

const add = (map: Record<string, number>, key: string, amount: number) => {
  map[key] = (map[key] ?? 0) + amount;
};

/**
 * Runs a party through a dungeon: encounters drawn from the seed, fought round
 * by round, ending at the boss or when every hero is knocked out. The briefing
 * is scored against the party first: what it missed shapes the run.
 */
export function simulateRun(
  party: PartyMember[],
  dungeon: DungeonDef,
  seed: string,
  { rules = expeditionRules, guaranteed = false, hunger = 'fed', meal = null, briefing = null, optIn = false }: RunOptions = {},
): RunResult {
  const activeBriefing: Briefing = briefing ?? EMPTY_BRIEFING;
  const restriction = activeBriefing.restriction;
  const rng = createRng(seed);
  // How the day goes for the whole party: a good day hits harder and gets hurt less.
  // Unlike per-hit variance this doesn't average out, so weaker teams keep a real chance.
  const fortune = 1 + (rng.next() * 2 - 1) * rules.fortune;
  const heroes: HeroState[] = party.map((member) => {
    const { damage, hpLoss } = hungerEffect(hunger, member.abilities);
    // Starving costs HP before the first step, but never knocks anyone out.
    const hp = Math.min(member.maxHp, member.hp > 0 ? Math.max(Math.min(member.hp, 1), member.hp - hpLoss * member.maxHp) : 0);
    return {
      member,
      hp,
      // A hero with no HP to start with can't act at all.
      out: hp <= 0,
      consumableLeft: member.consumable !== null,
      fed: damage,
    };
  });
  const alive = () => heroes.filter((h) => !h.out);

  // The briefing against this party: what was met, and what it costs.
  const answers: HeroAnswers[] = party.map((member) => heroAnswers(answersMemberOf(member), restriction));
  const scores = scoreBriefing(activeBriefing, answers);
  const penalties: AppliedPenalty[] = scores.threats.flatMap((score) => threatPenalties(score));
  const ofKind = <K extends AppliedPenalty['kind']>(kind: K) =>
    penalties.filter((p): p is Extract<AppliedPenalty, { kind: K }> => p.kind === kind);
  const weakened = ofKind('weakened').reduce((m, p) => m * (1 - p.pct), 1);
  const weakenedAgainst = ofKind('weakenedAgainst').reduce((m, p) => m * (1 - p.pct), 1);
  const beastDamage = ofKind('enemyDamage').reduce((m, p) => m * (1 + p.pct), 1);
  const undeadHp = ofKind('enemyHp').reduce((m, p) => m * (1 + p.pct), 1);
  const bruteDamage = ofKind('bruteDamage').reduce((m, p) => m * (1 + p.pct), 1);
  const extraEnemies = ofKind('extraEnemies');
  const exposedPenalties = ofKind('exposed');
  const poisonWounds = ofKind('fightWounds').filter((p) => p.targets === 'all');
  const casterWounds = ofKind('fightWounds').filter((p) => p.targets === 'one');
  const trapWounds = ofKind('trapWounds')[0]?.pct ?? 0;
  const extraFight = ofKind('extraFight')[0]?.chance ?? 0;
  const elementThreat = activeBriefing.threats.find((t) => t.id === 'element' && t.element) ?? null;
  const elementalDamage = ofKind('elementalDamage')[0]?.multiplier ?? 1;
  const magicFactor = restriction === 'antiMagic' ? restrictionRules.antiMagic : 1;
  const partyHealFactor = restriction === 'antiMagic' ? restrictionRules.antiMagic : 1;
  const healing =
    ofKind('healingHalved').reduce((m, p) => m * p.multiplier, 1) * (restriction === 'noHealing' ? restrictionRules.noHealing : 1);
  const lostLoot = 1 - ofKind('lostLoot').reduce((m, p) => m * (1 - p.pct), 1);
  const delay = ofKind('delay').reduce((m, p) => m * (1 + p.pct), 1) - 1;

  /** The first conscious hero with an ability of this kind that passes `test`. */
  const withAbility = <K extends Ability['kind']>(kind: K, test: (ability: Extract<Ability, { kind: K }>) => boolean = () => true) => {
    for (const hero of alive()) {
      const ability = hero.member.abilities.find(
        (a): a is Extract<Ability, { kind: K }> => a.kind === kind && test(a as Extract<Ability, { kind: K }>),
      );
      if (ability) return { hero, ability };
    }
    return null;
  };
  /** A hero's own ability of this kind (not the party's). */
  const own = <K extends Ability['kind']>(hero: HeroState, kind: K) =>
    hero.member.abilities.find((a): a is Extract<Ability, { kind: K }> => a.kind === kind);
  const enemyElement = (def: MobDef | BossDef): Element | undefined => elementThreat?.element ?? def.element;
  const enemyTags = (def: MobDef | BossDef): Tag[] => {
    const element = enemyElement(def);
    return element ? [...def.tags, element] : mobTags(def);
  };

  /** ±variance, sometimes a crit; cursed luck means there are no crits. */
  const roll = (value: number, critBonus = 0, onCrit?: () => void) => {
    const varied = value * (1 + (rng.next() * 2 - 1) * rules.damageVariance);
    if (restriction === 'cursedLuck' || !rng.chance(rules.critChance + critBonus)) return varied;
    onCrit?.();
    return varied * rules.critMultiplier;
  };
  const elementFactor = (hero: HeroState, attack?: Element) =>
    incomingMultiplier(attack, { armour: hero.member.armourElement, resists: hero.member.resists });

  /** Elements whose damage a ward salve holder has taken, for salvage. */
  const damageElements: Record<string, Element[]> = {};
  const tookDamage = (hero: HeroState, element: Element | undefined) => {
    const salve = hero.member.consumable?.protectsAgainst;
    if (!element || salve !== element) return;
    damageElements[hero.member.heroId] = [...(damageElements[hero.member.heroId] ?? []), element];
  };

  const heal = (hero: HeroState, share: number, result: EncounterResult) => {
    const amount = Math.min(hero.member.maxHp - hero.hp, share * hero.member.maxHp * healing);
    hero.hp += amount;
    add(result.healed, hero.member.heroId, amount);
  };

  const hurt = (hero: HeroState, raw: number, result: EncounterResult) => {
    const amount = raw * (own(hero, 'damageTaken')?.multiplier ?? 1);
    hero.hp -= amount;
    add(result.taken, hero.member.heroId, amount);
    if (hero.hp <= 0) {
      if (guaranteed) {
        hero.hp = 1;
      } else {
        hero.hp = 0;
        hero.out = true;
        result.knockedOut.push(hero.member.heroId);
        return;
      }
    }
    const potion = hero.member.consumable;
    const threshold = rules.potionThreshold + (own(hero, 'potionThreshold')?.add ?? 0);
    const healShare = potion?.when === 'lowHp' ? potion.heal : potion?.kit?.heal;
    if (hero.consumableLeft && healShare !== undefined && hero.hp < threshold * hero.member.maxHp) {
      hero.consumableLeft = false;
      heal(hero, healShare, result);
      result.consumed.push(hero.member.heroId);
    }
  };

  /** The Forgotten shrine's multiplier, set at the midpoint. */
  let shrine = 1;
  /** Heroes who attacked at least once. */
  const attacked = new Set<string>();

  const fight = (enemyDefs: (MobDef | BossDef)[], result: EncounterResult, enemiesFirst: boolean, isBoss = false) => {
    // Swarm: every big fight gets copies of its weakest mob.
    const weakest = [...enemyDefs].sort((a, b) => a.hp - b.hp)[0];
    const copies =
      enemyDefs.length >= 3
        ? extraEnemies.flatMap((penalty) => {
            const whole = Math.floor(penalty.count);
            const extra = penalty.count > whole && rng.chance(penalty.count - whole) ? 1 : 0;
            return Array< MobDef | BossDef >(whole + extra).fill(weakest);
          })
        : [];
    const enemies: EnemyState[] = [...enemyDefs, ...copies].map((def) => ({
      def,
      // The dead walk here: undead are harder to put down.
      hp: def.hp * (enemyTags(def).includes('undead') ? undeadHp : 1),
    }));
    /** Logs an effect once per encounter and hero. */
    const note = (heroId: string | null, key: AbilityEffect['key'], extra: Partial<AbilityEffect> = {}) => {
      if (!result.effects.some((e) => e.key === key && e.heroId === heroId)) result.effects.push({ heroId, key, ...extra });
    };
    const heroesAttack = () => {
      // The best buff of a conscious hero lifts everyone; buffs don't stack.
      const buffer = alive()
        .map((h) => ({ h, buff: own(h, 'partyDamageBuff') }))
        .filter((b) => b.buff)
        .sort((a, b) => b.buff!.multiplier - a.buff!.multiplier)[0];
      if (buffer) note(buffer.h.member.heroId, 'buff');
      for (const hero of alive()) {
        const target = enemies.find((e) => e.hp > 0);
        if (!target) return;
        const id = hero.member.heroId;
        const tags = enemyTags(target.def);
        let bonus = (buffer?.buff?.multiplier ?? 1) * shrine * weakened * weakenedAgainst;
        for (const ability of hero.member.abilities) {
          if (ability.kind !== 'damageVsTag' || !tags.includes(ability.tag)) continue;
          bonus *= ability.multiplier;
          note(id, 'tagBonus', { tag: ability.tag });
        }
        // Sacred ground dulls every weapon it can see.
        if (restriction === 'sacredGround' && hero.member.weaponType && !concealedWeapons.includes(hero.member.weaponType)) {
          bonus *= restrictionRules.sacredGround;
        }
        const rage = own(hero, 'rage');
        if (rage && hero.hp < rage.belowPct * hero.member.maxHp) {
          bonus *= rage.multiplier;
          note(id, 'rage');
        }
        const targetElement = enemyElement(target.def);
        const advantage = own(hero, 'elementalAdvantage');
        let elemental = weaponMultiplier(hero.member.weaponElement, targetElement);
        if (advantage && hero.member.weaponElement && targetElement && beats(hero.member.weaponElement, targetElement)) {
          // Anti-magic cuts the bonus above 1 in half.
          elemental = restriction === 'antiMagic' ? 1 + (advantage.multiplier - 1) * restrictionRules.antiMagic : advantage.multiplier;
          note(id, 'advantage');
        }
        const critBonus = hero.member.abilities.reduce((sum, a) => sum + (a.kind === 'critBonus' ? a.chance : 0), 0);
        // Anti-magic halves the magic part of every hero's damage.
        const base = hero.member.damage - hero.member.magic + hero.member.magic * magicFactor;
        const hit = roll(base, critBonus, critBonus > 0 ? () => note(id, 'crit') : undefined);
        const damage = hit * fortune * bonus * elemental * hero.fed;
        target.hp -= damage;
        add(result.dealt, id, damage);
        attacked.add(id);
      }
    };
    /** A protector takes a share of the hits aimed at the most hurt ally. */
    const shielded = (target: HeroState, amount: number) => {
      // A sweep can knock out the whole party before it reaches this hero.
      const living = alive();
      if (!living.includes(target)) return amount;
      const lowest = living.reduce((low, h) => (h.hp / h.member.maxHp < low.hp / low.member.maxHp ? h : low));
      if (lowest !== target) return amount;
      const protector = alive().find((h) => h !== target && own(h, 'protect'));
      if (!protector) return amount;
      const moved = amount * own(protector, 'protect')!.share;
      note(protector.member.heroId, 'protect', { allyId: target.member.heroId });
      hurt(protector, moved, result);
      return amount - moved;
    };
    const enemiesAttack = () => {
      for (const enemy of enemies.filter((e) => e.hp > 0)) {
        // The boss encounter takes the brute's extra damage, effect or not.
        const boss: BossDef | null = isBoss || 'effect' in enemy.def ? (enemy.def as BossDef) : null;
        const enraged = boss?.effect === 'enrage' && enemy.hp < enemy.def.hp / 2;
        const beast = enemyTags(enemy.def).includes('beast');
        const base =
          enemy.def.damage *
          (enraged ? rules.enrageMultiplier : 1) *
          (boss ? bruteDamage : 1) *
          (beast ? beastDamage : 1);
        const targets =
          boss?.effect === 'sweep' ? alive() : alive().length ? [rng.weighted(alive(), (h) => h.member.threat)] : [];
        for (const hero of targets) {
          const element = enemyElement(enemy.def);
          let incoming = roll(boss?.effect === 'sweep' ? base * rules.sweepShare : base) * elementFactor(hero, element);
          // The Element threat bites heroes without Resist.
          if (element !== undefined && element === elementThreat?.element && !hero.member.resists.includes(element)) {
            incoming *= elementalDamage;
          }
          const taken = (incoming * 100) / (100 + rules.defenseFactor * hero.member.defense) / fortune;
          hurt(hero, shielded(hero, taken), result);
          tookDamage(hero, element);
        }
      }
    };

    const maxRounds = guaranteed ? rules.maxRounds * 10 : rules.maxRounds;
    for (let round = 1; round <= maxRounds; round++) {
      result.rounds = round;
      // An exposed fight gives the enemies the first strike; after that it plays like any fight.
      const ambushed = enemiesFirst && round === 1;
      if (ambushed) enemiesAttack();
      if (alive().length === 0) return;
      heroesAttack();
      if (enemies.every((e) => e.hp <= 0)) {
        result.cleared = true;
        return;
      }
      if (!ambushed) enemiesAttack();
      if (alive().length === 0) return;
    }
  };

  /** A fight with the wounds the briefing's missed threats inflict around it. */
  const runFight = (enemyDefs: (MobDef | BossDef)[], result: EncounterResult, enemiesFirst: boolean, isBoss = false) => {
    if (enemiesFirst) result.effects.push({ heroId: null, key: 'exposed' });
    // Enemy casters wound one hero before every fight.
    for (const penalty of casterWounds) {
      const victims = alive();
      if (victims.length === 0) break;
      const victim = rng.weighted(victims, () => 1);
      result.effects.push({ heroId: victim.member.heroId, key: 'casters' });
      hurt(victim, penalty.pct * victim.member.maxHp, result);
    }
    fight(enemyDefs, result, enemiesFirst, isBoss);
    // Poison wears at everyone after every fight.
    for (const penalty of poisonWounds) {
      for (const hero of alive()) hurt(hero, penalty.pct * hero.member.maxHp, result);
      result.effects.push({ heroId: null, key: 'poison' });
    }
  };

  /** Whether the fight at `index` (bosses included) is exposed by a missed threat. */
  let fightsSeen = 0;
  const exposedAt = (index: number) =>
    exposedPenalties.some((penalty) => {
      if (penalty.fights === 'all') return penalty.everyOther ? index % 2 === 0 : true;
      const whole = Math.floor(penalty.fights);
      return index < whole || (penalty.fights > whole && index === whole && rng.chance(penalty.fights - whole));
    });

  const expand = (groups: MobGroup[]) => groups.flatMap(({ mobId, count }) => Array(count).fill(mobById[mobId]));

  /** A quiet step: cleared, nothing happens, no log line. */
  const quietResult = (name: string): EncounterResult => {
    const result = emptyResult('quiet', name);
    result.cleared = true;
    return result;
  };

  /** A local's tip: the next trap is skipped. */
  let tipped = false;

  /** The midpoint opportunity: what the party took, and what it gave. */
  const resolveOpportunity = (at: EncounterResult): RunOpportunity | null => {
    const id = activeBriefing.opportunity;
    if (!id || alive().length === 0) return null;
    const def = opportunityById[id];
    const scored = scoreOpportunity(def, answers, optIn);
    const taken: RunOpportunity = { id, answered: scored.answered };
    if (scored.kitHeroId) taken.kitHeroId = scored.kitHeroId;
    if (!scored.answered) {
      return taken;
    }
    const { reward } = def;
    switch (reward.kind) {
      case 'heal':
        alive().forEach((hero) => heal(hero, reward.pct, at));
        break;
      case 'goldShare': {
        const finder = withAbility('cacheBonus');
        taken.gold = Math.round(reward.share * dungeon.gold[1] * (finder?.ability.multiplier ?? 1));
        break;
      }
      case 'ore':
        taken.materials = [
          { materialId: reward.materials[Math.min(reward.materials.length, dungeon.tier) - 1], amount: reward.base + dungeon.tier },
        ];
        break;
      case 'goldMultiplier':
        taken.goldMultiplier = reward.multiplier;
        break;
      case 'prisoners':
        taken.gold = Math.round(reward.share * dungeon.gold[1]);
        taken.recruit = rng.chance(reward.recruitChance);
        break;
      case 'pilgrimReward':
        taken.pilgrim = rng.weighted([...travellerRules.pilgrimRewards], (entry) => entry.weight).kind;
        break;
      case 'partyDamage':
        shrine = reward.multiplier;
        taken.damageMultiplier = reward.multiplier;
        break;
      case 'xp':
        taken.xpMultiplier = reward.multiplier;
        taken.recipe = rng.chance(reward.recipeChance);
        break;
      case 'trophy': {
        const materials: MaterialStack[] = [
          { materialId: 'hide', amount: rng.int(reward.hide[0], reward.hide[1]) },
          { materialId: 'bone', amount: reward.bone },
        ];
        if (rng.chance(reward.shardChance)) {
          const element = ELEMENTS[rng.int(0, ELEMENTS.length - 1)];
          materials.push({ materialId: shardId(element), amount: 1 });
        }
        taken.materials = materials;
        break;
      }
    }
    return taken;
  };

  const runEncounter = (encounter: EncounterDef): EncounterResult => {
    if (encounter.type === 'fight') {
      const result = emptyResult('fight', '', encounter.mobs);
      runFight(expand(encounter.mobs), result, exposedAt(fightsSeen));
      fightsSeen++;
      return result;
    }
    if (encounter.type === 'trap') {
      // A trap is live only when the briefing has the traps threat; otherwise it is a quiet step.
      if (!activeBriefing.threats.some((t) => t.id === 'traps')) return quietResult(encounter.name);
      const result = emptyResult('trap', encounter.name);
      result.cleared = true;
      // A local's tip: the next trap is skipped.
      if (tipped) {
        tipped = false;
        result.effects.push({ heroId: null, key: 'tip' });
        return result;
      }
      // A met threat's trap never catches anyone; the worse it was missed, the harder it bites.
      result.trapTriggered = trapWounds > 0;
      if (trapWounds > 0) {
        const reducer = withAbility('trapReduce');
        if (reducer) result.effects.push({ heroId: reducer.hero.member.heroId, key: 'trapReduce' });
        const reduce = reducer?.ability.multiplier ?? 1;
        const caught = encounter.targets === 'all' ? alive() : [rng.weighted(alive(), () => 1)];
        for (const hero of caught) {
          const raw = trapWounds * hero.member.maxHp * reduce * elementFactor(hero, encounter.element);
          hurt(hero, raw, result);
          tookDamage(hero, encounter.element);
        }
      }
      result.cleared = alive().length > 0;
      return result;
    }
    if (encounter.type === 'locals') {
      // Locals are live only when the briefing has the locals threat.
      const score = scores.threats.find((t) => t.threat.id === 'locals');
      if (!score) return quietResult(npcById[encounter.npcId].name);
      const npc = npcById[encounter.npcId];
      const result = emptyResult('locals', npc.name);
      const hostile = [{ mobId: npcMobId(npc.id, dungeon.tier), count: npc.hostile.count }];
      const thief = withAbility('pickpocket');
      result.cleared = true;
      if (thief && (score.intimidated || score.state !== 'met')) {
        result.effects.push({ heroId: thief.hero.member.heroId, key: 'pickpocket' });
      }
      const fightThem = () => {
        result.reaction = 'fight';
        result.mobs = hostile;
        result.cleared = false;
        runFight(expand(hostile), result, false);
      };
      if (score.state === 'met' && !score.intimidated) {
        result.reaction = 'help';
        result.help = npc.help;
        const { help } = npc;
        if (help.kind === 'heal') alive().forEach((hero) => heal(hero, help.pct, result));
        if (help.kind === 'gold') result.gold = Math.round(help.share * dungeon.gold[1]);
        if (help.kind === 'tip') tipped = true;
      } else if (thief && (score.intimidated || score.state !== 'met')) {
        // Intimidated locals keep their distance; unfriendly ones lose their purse first.
        result.reaction = 'steal';
        result.gold = Math.round(localsRules.pickpocketGoldShare * dungeon.gold[1]);
        if (rng.chance(localsRules.noticeChance)) {
          result.noticed = true;
          result.mobs = hostile;
          result.cleared = false;
          runFight(expand(hostile), result, false);
        }
      } else if (!score.intimidated && score.state !== 'met' && rng.chance(extraFight)) {
        fightThem();
      } else {
        result.reaction = 'neutral';
      }
      return result;
    }
    // Every other non-fight encounter is a quiet step.
    return quietResult(encounter.type === 'obstacle' ? encounter.name : eventById[encounter.eventId].name);
  };

  const encounterCount = rng.int(dungeon.encounterCount[0], dungeon.encounterCount[1]);
  // A small chance of bad luck no stats can prevent, so no run is ever certain (except the tutorial's).
  const mishapAt = !guaranteed && rng.chance(rules.mishapChance) ? rng.int(0, encounterCount - 1) : -1;
  // The steps before the boss, drawn up front so a drawn threat can be guaranteed its encounter.
  const steps: EncounterDef[] = Array.from({ length: encounterCount - 1 }, () => rng.weighted(dungeon.encounters, (e) => e.weight));
  const drawn = (type: EncounterDef['type']) => steps.some((e) => e.type === type);
  // A drawn threat that never came up takes the last free step before the boss.
  let lastFree = steps.length - 1;
  const guarantee = (threatId: 'traps' | 'locals', type: 'trap' | 'locals') => {
    if (!activeBriefing.threats.some((t) => t.id === threatId) || drawn(type)) return;
    const entry = dungeon.encounters.find((e) => e.type === type);
    if (entry && lastFree >= 0) steps[lastFree--] = entry;
  };
  guarantee('traps', 'trap');
  guarantee('locals', 'locals');
  const midpoint = Math.floor((encounterCount - 1) / 2);
  /** The midpoint opportunity's outcome, once the party reaches it. */
  let opportunity: RunOpportunity | null = null;

  const encounters: EncounterResult[] = [];
  for (let i = 0; i < encounterCount && alive().length > 0; i++) {
    if (i === mishapAt) {
      encounters.push(emptyResult('mishap', rules.mishaps[rng.int(0, rules.mishaps.length - 1)]));
      break;
    }
    if (i < encounterCount - 1) {
      const result = runEncounter(steps[i]);
      encounters.push(result);
      if (!result.cleared) break;
      if (i === midpoint && i < encounterCount - 1) opportunity = resolveOpportunity(result);
      // A healer tends the party between encounters.
      const healer = withAbility('partyHeal');
      if (healer && alive().some((h) => h.hp < h.member.maxHp)) {
        alive().forEach((hero) => heal(hero, healer.ability.pct * partyHealFactor, result));
        result.effects.push({ heroId: healer.hero.member.heroId, key: 'partyHeal' });
      }
      continue;
    }
    const result = emptyResult('boss', dungeon.boss.name);
    if (meal?.kind === 'bossHeal' && alive().length > 0) {
      for (const hero of alive()) heal(hero, meal.pct * (own(hero, 'stewBoost')?.multiplier ?? 1), result);
      result.effects.push({ heroId: null, key: 'stew' });
    }
    runFight([dungeon.boss], result, exposedAt(fightsSeen), true);
    fightsSeen++;
    encounters.push(result);
  }

  const encountersCleared = encounters.filter((e) => e.cleared).length;
  const bossDefeated = encounters.some((e) => e.kind === 'boss' && e.cleared);
  const anyKnockedOut = encounters.some((e) => e.knockedOut.length > 0);
  const outcome: ExpeditionOutcome = bossDefeated
    ? anyKnockedOut
      ? 'success'
      : 'flawless'
    : encountersCleared > 0
      ? 'retreat'
      : 'defeat';

  return {
    encounters,
    encounterCount,
    encountersCleared,
    bossDefeated,
    outcome,
    bonusGold: encounters.reduce((sum, e) => sum + e.gold, 0) + (opportunity?.gold ?? 0),
    hp: heroes.map((h) => ({ heroId: h.member.heroId, hp: Math.round(h.hp), maxHp: h.member.maxHp })),
    consumed: encounters.flatMap((e) => e.consumed),
    attacked: [...attacked],
    damageElements,
    threats: scores.threats,
    opportunity,
    lostLoot,
    delay,
  };
}
