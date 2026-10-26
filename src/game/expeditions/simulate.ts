import { expeditionRules } from '@/content/dungeons';
import { mobById, mobTags, npcMobId } from '@/content/enemies';
import { eventById } from '@/content/events';
import { localsRules, npcById } from '@/content/npcs';
import { heroClasses } from '@/content/heroes';
import { gearName, itemById } from '@/content/lookup';

import { beats, incomingMultiplier, weaponMultiplier, type Element } from '../elements';
import { createRng } from '../generation/rng';
import type { SaveData } from '../save';
import { heroAbilities, heroStats } from '../team/team';
import type {
  Ability,
  BossDef,
  ConsumableDef,
  DungeonDef,
  EncounterDef,
  ExpeditionOutcome,
  HeroClassId,
  MobDef,
  MobGroup,
  NpcHelp,
  Tag,
} from '../types';

export type ExpeditionRules = typeof expeditionRules;

/** A hero as they set out; stats stay fixed for the whole run. */
export type PartyMember = {
  heroId: string;
  name: string;
  classId: HeroClassId;
  /** Personal trait id; party-wide trait effects count once per trait. */
  traitId: string;
  weaponName: string | null;
  maxHp: number;
  /** Damage per round: attack + magic. */
  damage: number;
  defense: number;
  threat: number;
  /** Elements this hero takes no extra damage from (class resist, protective consumable). */
  resists: Element[];
  /** Class abilities and trait effects, plus any the gear gives (a fire weapon burns barricades). */
  abilities: Ability[];
  /** The infused weapon's element, or the class's innate one. */
  weaponElement?: Element;
  armourElement?: Element;
  consumable: ConsumableDef | null;
};

/** An ability that changed an encounter, for the log. `heroId` is null for a local's tip. */
export type AbilityEffect = {
  heroId: string | null;
  key:
    | 'tagBonus'
    | 'disarm'
    | 'tip'
    | 'trapReduce'
    | 'solve'
    | 'calm'
    | 'charm'
    | 'provoke'
    | 'pickpocket'
    | 'rage'
    | 'buff'
    | 'protect'
    | 'partyHeal'
    | 'crit'
    | 'cacheBonus'
    | 'advantage'
    | 'alert'
    | 'loud';
  tag?: Tag;
  /** The ally a `protect` shielded. */
  allyId?: string;
};

export type LocalsReaction = 'help' | 'fight' | 'steal' | 'neutral';

/** What happened in one encounter, for rewards and the log. Per-hero maps are keyed by hero id. */
export type EncounterResult = {
  kind: 'fight' | 'ambush' | 'boss' | 'trap' | 'spring' | 'cache' | 'mishap' | 'obstacle' | 'locals';
  /** Trap, event, obstacle, NPC or boss name. */
  name: string;
  /** The enemies of a fight or ambush. */
  mobs: MobGroup[];
  cleared: boolean;
  rounds: number;
  dealt: Record<string, number>;
  taken: Record<string, number>;
  healed: Record<string, number>;
  /** Heroes who drank a potion or ate a ration here. */
  consumed: string[];
  knockedOut: string[];
  trapTriggered: boolean;
  gold: number;
  effects: AbilityEffect[];
  /** A beast fight skipped by calming them: cleared, but it brings no loot. */
  calmed: boolean;
  /** An unsolved obstacle sent the party round a fight. */
  detour: boolean;
  reaction?: LocalsReaction;
  /** What the locals did to help. */
  help?: NpcHelp;
  /** Pickpocketed locals noticed and fought. */
  noticed?: boolean;
};

export type RunResult = {
  encounters: EncounterResult[];
  encounterCount: number;
  encountersCleared: number;
  /** Cleared by calming beasts, so left out of the loot share. */
  encountersCalmed: number;
  bossDefeated: boolean;
  outcome: ExpeditionOutcome;
  bonusGold: number;
  hp: { heroId: string; hp: number; maxHp: number }[];
  /** Heroes whose healing consumable was used up during the run. */
  consumed: string[];
};

type RunOptions = {
  rules?: ExpeditionRules;
  /** The tutorial run: heroes can't drop below 1 HP, so the boss always falls eventually. */
  guaranteed?: boolean;
};

type HeroState = { member: PartyMember; hp: number; out: boolean; consumableLeft: boolean };
type EnemyState = { def: MobDef | BossDef; hp: number };

export function prepareParty(save: SaveData, heroIds: string[]): PartyMember[] {
  return save.heroes
    .filter((hero) => heroIds.includes(hero.id))
    .map((hero) => {
      const heroClass = heroClasses[hero.classId];
      const stats = heroStats(save, hero);
      const weapon = save.gear.find((g) => g.uid === hero.equipment.weapon);
      const armour = save.gear.find((g) => g.uid === hero.equipment.armor);
      const item = hero.equipment.consumable ? itemById[hero.equipment.consumable] : null;
      const consumable = item?.slot === 'consumable' ? item : null;
      return {
        heroId: hero.id,
        name: hero.name,
        classId: hero.classId,
        traitId: hero.trait,
        weaponName: weapon ? gearName(weapon) : null,
        maxHp: stats.hp,
        damage: stats.attack + stats.magic,
        defense: stats.defense,
        threat: heroClass.threat,
        resists: [...(heroClass.resists ?? []), ...(consumable?.protectsAgainst ? [consumable.protectsAgainst] : [])],
        abilities: [
          ...heroAbilities(hero),
          ...(weapon?.element === 'fire' ? [{ kind: 'obstacleSolve', kinds: ['barricade'] } satisfies Ability] : []),
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
    calmed: false,
    detour: false,
  };
}

const add = (map: Record<string, number>, key: string, amount: number) => {
  map[key] = (map[key] ?? 0) + amount;
};

/**
 * Runs a party through a dungeon: encounters drawn from the seed, fought round
 * by round, ending at the boss or when every hero is knocked out.
 */
export function simulateRun(
  party: PartyMember[],
  dungeon: DungeonDef,
  seed: string,
  { rules = expeditionRules, guaranteed = false }: RunOptions = {},
): RunResult {
  const rng = createRng(seed);
  // How the day goes for the whole party: a good day hits harder and gets hurt less.
  // Unlike per-hit variance this doesn't average out, so weaker teams keep a real chance.
  const fortune = 1 + (rng.next() * 2 - 1) * rules.fortune;
  const heroes: HeroState[] = party.map((member) => ({
    member,
    hp: member.maxHp,
    // A hero with no HP to start with can't act at all.
    out: member.maxHp <= 0,
    consumableLeft: member.consumable !== null,
  }));
  const alive = () => heroes.filter((h) => !h.out);
  const fights = dungeon.encounters.flatMap((e) => (e.type === 'fight' ? [e] : []));
  /** A local's tip: the next trap is skipped. */
  let tipped = false;

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
  const enemyElement = (def: MobDef | BossDef) => dungeon.enemyElement ?? def.element;
  const enemyTags = (def: MobDef | BossDef): Tag[] => {
    const element = enemyElement(def);
    return element ? [...def.tags, element] : mobTags(def);
  };

  /** ±variance, sometimes a crit. */
  const roll = (value: number, critBonus = 0, onCrit?: () => void) => {
    const varied = value * (1 + (rng.next() * 2 - 1) * rules.damageVariance);
    if (!rng.chance(rules.critChance + critBonus)) return varied;
    onCrit?.();
    return varied * rules.critMultiplier;
  };
  const elementFactor = (hero: HeroState, attack?: Element) =>
    incomingMultiplier(attack, { armour: hero.member.armourElement, resists: hero.member.resists });

  const heal = (hero: HeroState, share: number, result: EncounterResult) => {
    const amount = Math.min(hero.member.maxHp - hero.hp, share * hero.member.maxHp);
    hero.hp += amount;
    add(result.healed, hero.member.heroId, amount);
  };

  const hurt = (hero: HeroState, amount: number, result: EncounterResult) => {
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
    if (hero.consumableLeft && potion?.when === 'lowHp' && hero.hp < threshold * hero.member.maxHp) {
      hero.consumableLeft = false;
      heal(hero, potion.heal ?? 0, result);
      result.consumed.push(hero.member.heroId);
    }
  };

  const fight = (enemyDefs: (MobDef | BossDef)[], result: EncounterResult, enemiesFirst: boolean) => {
    const enemies: EnemyState[] = enemyDefs.map((def) => ({ def, hp: def.hp }));
    /** Logs an effect once per encounter and hero. */
    const note = (heroId: string, key: AbilityEffect['key'], extra: Partial<AbilityEffect> = {}) => {
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
        let bonus = buffer?.buff?.multiplier ?? 1;
        for (const ability of hero.member.abilities) {
          if (ability.kind !== 'damageVsTag' || !tags.includes(ability.tag)) continue;
          bonus *= ability.multiplier;
          note(id, 'tagBonus', { tag: ability.tag });
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
          elemental = advantage.multiplier;
          note(id, 'advantage');
        }
        const critBonus = hero.member.abilities.reduce((sum, a) => sum + (a.kind === 'critBonus' ? a.chance : 0), 0);
        const hit = roll(hero.member.damage, critBonus, critBonus > 0 ? () => note(id, 'crit') : undefined);
        const damage = hit * fortune * bonus * elemental;
        target.hp -= damage;
        add(result.dealt, id, damage);
      }
    };
    /** A protector takes a share of the hits aimed at the most hurt ally. */
    const shielded = (target: HeroState, amount: number) => {
      const lowest = alive().reduce((low, h) => (h.hp / h.member.maxHp < low.hp / low.member.maxHp ? h : low));
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
        const boss = 'effect' in enemy.def ? enemy.def : null;
        const enraged = boss?.effect === 'enrage' && enemy.hp < enemy.def.hp / 2;
        const base = enemy.def.damage * (enraged ? rules.enrageMultiplier : 1);
        const targets =
          boss?.effect === 'sweep' ? alive() : alive().length ? [rng.weighted(alive(), (h) => h.member.threat)] : [];
        for (const hero of targets) {
          const incoming =
            roll(boss?.effect === 'sweep' ? base * rules.sweepShare : base) * elementFactor(hero, enemyElement(enemy.def));
          const taken = (incoming * 100) / (100 + rules.defenseFactor * hero.member.defense) / fortune;
          hurt(hero, shielded(hero, taken), result);
        }
      }
    };

    const maxRounds = guaranteed ? rules.maxRounds * 10 : rules.maxRounds;
    for (let round = 1; round <= maxRounds; round++) {
      result.rounds = round;
      // An ambush gives the enemies the first strike; after that it plays like any fight.
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

  const expand = (groups: MobGroup[]) => groups.flatMap(({ mobId, count }) => Array(count).fill(mobById[mobId]));

  const runEncounter = (encounter: EncounterDef): EncounterResult => {
    if (encounter.type === 'fight') {
      const result = emptyResult('fight', '', encounter.mobs);
      const calmer = expand(encounter.mobs).every((mob) => enemyTags(mob).includes('beast')) ? withAbility('calmBeasts') : null;
      if (calmer && rng.chance(calmer.ability.chance)) {
        result.effects.push({ heroId: calmer.hero.member.heroId, key: 'calm' });
        result.calmed = true;
        result.cleared = true;
        return result;
      }
      fight(expand(encounter.mobs), result, false);
      return result;
    }
    if (encounter.type === 'trap') {
      const result = emptyResult('trap', encounter.name);
      result.cleared = true;
      if (tipped) {
        tipped = false;
        result.effects.push({ heroId: null, key: 'tip' });
        return result;
      }
      const disarmer = withAbility('trapDisarm');
      if (disarmer && rng.chance(disarmer.ability.chance)) {
        result.effects.push({ heroId: disarmer.hero.member.heroId, key: 'disarm' });
        return result;
      }
      // Clumsy heroes set traps off more often (once per party, whoever it is).
      const clumsy = withAbility('trapTrigger');
      result.trapTriggered = rng.chance(Math.min(1, encounter.triggerChance * (clumsy?.ability.multiplier ?? 1)));
      if (result.trapTriggered) {
        const reducer = withAbility('trapReduce');
        if (reducer) result.effects.push({ heroId: reducer.hero.member.heroId, key: 'trapReduce' });
        const reduce = reducer?.ability.multiplier ?? 1;
        const caught = encounter.targets === 'all' ? alive() : [rng.weighted(alive(), () => 1)];
        for (const hero of caught) {
          hurt(hero, encounter.damagePct * hero.member.maxHp * reduce * elementFactor(hero, encounter.element), result);
        }
      }
      result.cleared = alive().length > 0;
      return result;
    }
    if (encounter.type === 'obstacle') {
      const result = emptyResult('obstacle', encounter.name);
      const solver = withAbility('obstacleSolve', (a) => a.kinds.includes(encounter.kind));
      if (solver) {
        result.effects.push({ heroId: solver.hero.member.heroId, key: 'solve' });
        result.cleared = true;
        return result;
      }
      for (const hero of alive()) hurt(hero, encounter.hpCostPct * hero.member.maxHp, result);
      if (alive().length > 0 && fights.length > 0 && rng.chance(encounter.detourChance)) {
        const { mobs } = rng.weighted(fights, (f) => f.weight);
        result.detour = true;
        result.mobs = mobs;
        fight(expand(mobs), result, false);
        return result;
      }
      result.cleared = alive().length > 0;
      return result;
    }
    if (encounter.type === 'locals') {
      const npc = npcById[encounter.npcId];
      const result = emptyResult('locals', npc.name);
      const hostile = [{ mobId: npcMobId(npc.id, dungeon.tier), count: npc.hostile.count }];
      const reacts = (key: 'charm' | 'provoke' | 'pickpocket') => withAbility('localsReaction', (a) => a.key === key);
      const charmer = reacts('charm');
      const provoker = charmer ? null : reacts('provoke');
      const thief = charmer || provoker ? null : reacts('pickpocket');
      const loud = withAbility('hostileLocals');
      const by = charmer ?? provoker ?? thief;
      if (by) result.effects.push({ heroId: by.hero.member.heroId, key: by.ability.key });
      result.cleared = true;
      if (charmer) {
        result.reaction = 'help';
        result.help = npc.help;
        const { help } = npc;
        if (help.kind === 'heal') alive().forEach((hero) => heal(hero, help.pct, result));
        if (help.kind === 'gold') result.gold = Math.round(help.share * dungeon.gold[1]);
        if (help.kind === 'tip') tipped = true;
      } else if (provoker) {
        result.reaction = 'fight';
        result.mobs = hostile;
        fight(expand(hostile), result, false);
      } else if (thief) {
        result.reaction = 'steal';
        result.gold = Math.round(localsRules.pickpocketGoldShare * dungeon.gold[1]);
        if (rng.chance(localsRules.noticeChance + (loud?.ability.noticeBonus ?? 0))) {
          result.noticed = true;
          result.mobs = hostile;
          result.cleared = false;
          fight(expand(hostile), result, false);
        }
      } else if (loud && rng.chance(loud.ability.chance)) {
        // A loud hero turns indifferent locals hostile.
        result.reaction = 'fight';
        result.effects.push({ heroId: loud.hero.member.heroId, key: 'loud' });
        result.mobs = hostile;
        fight(expand(hostile), result, false);
      } else {
        result.reaction = 'neutral';
      }
      return result;
    }
    const event = eventById[encounter.eventId];
    if (event.kind === 'ambush') {
      const { mobs } = rng.weighted(fights, (f) => f.weight);
      const result = emptyResult('ambush', event.name, mobs);
      const alert = withAbility('ambushAlert');
      if (alert) result.effects.push({ heroId: alert.hero.member.heroId, key: 'alert' });
      fight(expand(mobs), result, !alert);
      return result;
    }
    const result = emptyResult(event.kind, event.name);
    if (event.kind === 'spring') alive().forEach((hero) => heal(hero, event.healPct, result));
    if (event.kind === 'cache') {
      const finder = withAbility('cacheBonus');
      if (finder) result.effects.push({ heroId: finder.hero.member.heroId, key: 'cacheBonus' });
      result.gold = Math.round(event.goldShare * dungeon.gold[1] * (finder?.ability.multiplier ?? 1));
    }
    result.cleared = true;
    return result;
  };

  const encounterCount = rng.int(dungeon.encounterCount[0], dungeon.encounterCount[1]);
  // A small chance of bad luck no stats can prevent, so no run is ever certain (except the tutorial's).
  const mishapAt = !guaranteed && rng.chance(rules.mishapChance) ? rng.int(0, encounterCount - 1) : -1;
  const encounters: EncounterResult[] = [];
  for (let i = 0; i < encounterCount && alive().length > 0; i++) {
    if (i === mishapAt) {
      encounters.push(emptyResult('mishap', rules.mishaps[rng.int(0, rules.mishaps.length - 1)]));
      break;
    }
    if (i < encounterCount - 1) {
      const result = runEncounter(rng.weighted(dungeon.encounters, (e) => e.weight));
      encounters.push(result);
      if (!result.cleared) break;
      // A healer tends the party between encounters.
      const healer = withAbility('partyHeal');
      if (healer && alive().some((h) => h.hp < h.member.maxHp)) {
        alive().forEach((hero) => heal(hero, healer.ability.pct, result));
        result.effects.push({ heroId: healer.hero.member.heroId, key: 'partyHeal' });
      }
      continue;
    }
    const result = emptyResult('boss', dungeon.boss.name);
    for (const hero of alive()) {
      const ration = hero.member.consumable;
      if (hero.consumableLeft && ration?.when === 'beforeBoss') {
        hero.consumableLeft = false;
        heal(hero, (ration.heal ?? 0) * (own(hero, 'rationBoost')?.multiplier ?? 1), result);
        result.consumed.push(hero.member.heroId);
      }
    }
    fight([dungeon.boss], result, false);
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
    encountersCalmed: encounters.filter((e) => e.calmed).length,
    bossDefeated,
    outcome,
    bonusGold: encounters.reduce((sum, e) => sum + e.gold, 0),
    hp: heroes.map((h) => ({ heroId: h.member.heroId, hp: Math.round(h.hp), maxHp: h.member.maxHp })),
    consumed: encounters.flatMap((e) => e.consumed),
  };
}

