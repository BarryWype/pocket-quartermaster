import { expeditionRules } from '@/content/dungeons';
import { mobById } from '@/content/enemies';
import { eventById } from '@/content/events';
import { heroClasses } from '@/content/heroes';
import { itemById } from '@/content/lookup';

import { createRng } from '../generation/rng';
import type { SaveData } from '../save';
import { heroStats } from '../team/team';
import type {
  BossDef,
  ConsumableDef,
  DungeonDef,
  EncounterDef,
  ExpeditionOutcome,
  HeroClassId,
  MobDef,
  MobGroup,
} from '../types';

export type ExpeditionRules = typeof expeditionRules;

/** A hero as they set out; stats stay fixed for the whole run. */
export type PartyMember = {
  heroId: string;
  name: string;
  classId: HeroClassId;
  weaponName: string | null;
  maxHp: number;
  /** Damage per round: attack + magic. */
  damage: number;
  defense: number;
  threat: number;
  /** Elements and trap kinds this hero shrugs off (class resists and traits, consumable). */
  protections: string[];
  consumable: ConsumableDef | null;
};

/** What happened in one encounter, for rewards and the log. Per-hero maps are keyed by hero id. */
export type EncounterResult = {
  kind: 'fight' | 'ambush' | 'boss' | 'trap' | 'spring' | 'cache' | 'mishap';
  /** Trap, event or boss name. */
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
  avoided: string[];
  gold: number;
};

export type RunResult = {
  encounters: EncounterResult[];
  encounterCount: number;
  encountersCleared: number;
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
      const item = hero.equipment.consumable ? itemById[hero.equipment.consumable] : null;
      const consumable = item?.slot === 'consumable' ? item : null;
      return {
        heroId: hero.id,
        name: hero.name,
        classId: hero.classId,
        weaponName: weapon ? itemById[weapon.itemId].name : null,
        maxHp: stats.hp,
        damage: stats.attack + stats.magic,
        defense: stats.defense,
        threat: heroClass.threat,
        protections: [
          ...(heroClass.resists ?? []),
          ...(heroClass.traits ?? []),
          ...(consumable?.protectsAgainst ? [consumable.protectsAgainst] : []),
        ],
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
    avoided: [],
    gold: 0,
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
    out: false,
    consumableLeft: member.consumable !== null,
  }));
  const alive = () => heroes.filter((h) => !h.out);
  const fights = dungeon.encounters.flatMap((e) => (e.type === 'fight' ? [e] : []));

  /** ±variance, sometimes a crit. */
  const roll = (value: number) => {
    const varied = value * (1 + (rng.next() * 2 - 1) * rules.damageVariance);
    return rng.chance(rules.critChance) ? varied * rules.critMultiplier : varied;
  };
  const elementFactor = (hero: HeroState, element?: string) =>
    element && !hero.member.protections.includes(element) ? rules.elementMultiplier : 1;

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
    if (hero.consumableLeft && potion?.when === 'lowHp' && hero.hp < rules.potionThreshold * hero.member.maxHp) {
      hero.consumableLeft = false;
      heal(hero, potion.heal ?? 0, result);
      result.consumed.push(hero.member.heroId);
    }
  };

  const fight = (enemyDefs: (MobDef | BossDef)[], result: EncounterResult, enemiesFirst: boolean) => {
    const enemies: EnemyState[] = enemyDefs.map((def) => ({ def, hp: def.hp }));
    const heroesAttack = () => {
      for (const hero of alive()) {
        const target = enemies.find((e) => e.hp > 0);
        if (!target) return;
        const damage = roll(hero.member.damage) * fortune;
        target.hp -= damage;
        add(result.dealt, hero.member.heroId, damage);
      }
    };
    const enemiesAttack = () => {
      for (const enemy of enemies.filter((e) => e.hp > 0)) {
        const boss = 'effect' in enemy.def ? enemy.def : null;
        const enraged = boss?.effect === 'enrage' && enemy.hp < enemy.def.hp / 2;
        const base = enemy.def.damage * (enraged ? rules.enrageMultiplier : 1);
        const targets =
          boss?.effect === 'sweep' ? alive() : alive().length ? [rng.weighted(alive(), (h) => h.member.threat)] : [];
        for (const hero of targets) {
          const incoming = roll(boss?.effect === 'sweep' ? base * rules.sweepShare : base) * elementFactor(hero, enemy.def.element);
          hurt(hero, (incoming * 100) / (100 + rules.defenseFactor * hero.member.defense) / fortune, result);
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
      fight(expand(encounter.mobs), result, false);
      return result;
    }
    if (encounter.type === 'trap') {
      const result = emptyResult('trap', encounter.name);
      result.trapTriggered = rng.chance(encounter.triggerChance);
      if (result.trapTriggered) {
        const caught = encounter.targets === 'all' ? alive() : [rng.weighted(alive(), () => 1)];
        for (const hero of caught) {
          if (encounter.avoidedBy && hero.member.protections.includes(encounter.avoidedBy)) {
            result.avoided.push(hero.member.heroId);
          } else {
            hurt(hero, encounter.damagePct * hero.member.maxHp * elementFactor(hero, encounter.element), result);
          }
        }
      }
      result.cleared = alive().length > 0;
      return result;
    }
    const event = eventById[encounter.eventId];
    if (event.kind === 'ambush') {
      const { mobs } = rng.weighted(fights, (f) => f.weight);
      const result = emptyResult('ambush', event.name, mobs);
      fight(expand(mobs), result, true);
      return result;
    }
    const result = emptyResult(event.kind, event.name);
    if (event.kind === 'spring') alive().forEach((hero) => heal(hero, event.healPct, result));
    if (event.kind === 'cache') result.gold = Math.round(event.goldShare * dungeon.gold[1]);
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
      continue;
    }
    const result = emptyResult('boss', dungeon.boss.name);
    for (const hero of alive()) {
      const ration = hero.member.consumable;
      if (hero.consumableLeft && ration?.when === 'beforeBoss') {
        hero.consumableLeft = false;
        heal(hero, ration.heal ?? 0, result);
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
    bossDefeated,
    outcome,
    bonusGold: encounters.reduce((sum, e) => sum + e.gold, 0),
    hp: heroes.map((h) => ({ heroId: h.member.heroId, hp: Math.round(h.hp), maxHp: h.member.maxHp })),
    consumed: encounters.flatMap((e) => e.consumed),
  };
}

