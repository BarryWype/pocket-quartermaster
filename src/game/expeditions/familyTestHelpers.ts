import { expeditionRules } from '@/content/dungeons';
import { familyRules, type FamilyEffectId, type FamilyId } from '@/content/families';
import { dungeonById } from '@/content/lookup';
import { setLocale } from '@/i18n';

import { createRng } from '../generation/rng';
import type { BossDef, DungeonDef, MobGroup } from '../types';
import { buildLog } from './log';
import { simulateRun, type EncounterResult, type PartyMember, type RunOptions, type RunResult } from './simulate';

/** No mishaps, fortune, variance or enemy crits, so a family effect is the only thing that changes. */
export const steady = { ...expeditionRules, mishapChance: 0, fortune: 0, damageVariance: 0, enemyCritChance: 0 };

export function member(heroId: string, overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    heroId,
    name: heroId,
    classId: 'warrior',
    traitId: 'none',
    weaponName: null,
    gearKeywords: [],
    heavy: false,
    concealed: false,
    maxHp: 100,
    hp: overrides.hp ?? overrides.maxHp ?? 100,
    power: 10,
    magic: 0,
    damageStat: 'power',
    armour: 0,
    resistance: 0,
    evasion: 0,
    speed: 5,
    crit: 0,
    luck: 0,
    threat: 1,
    resists: [],
    familyTags: [],
    abilities: [],
    consumable: null,
    ...overrides,
  };
}

export type FightSetup = {
  /** The heroes, by id; the first carries the family's tags. Default: one hero 'a'. */
  party?: Record<string, Partial<PartyMember>>;
  /** The boss, unkillable unless given HP. */
  boss?: Partial<BossDef>;
  /** A fight before the boss with these mobs: the fight looked at. */
  mobs?: MobGroup[];
  /** How many fights of `mobs` come before the boss (default 1). */
  fights?: number;
  /** Without `mobs`: how many hidden cache steps come before the boss (default 0). */
  caches?: number;
  /** Without `mobs`: how many traps catching everyone come before the boss, instead of caches. */
  traps?: number;
  options?: RunOptions;
  seed?: string;
};

export type FamilyFight = { run: RunResult; fight: EncounterResult; party: PartyMember[]; log: string; logFr: string };

/**
 * One fight of a party at a family level (0: no tags), with the boss alone or
 * a fight of `mobs` first; the fight looked at is the first one.
 */
export function familyFight(family: FamilyId | null, level: number, setup: FightSetup = {}): FamilyFight {
  const count = level > 0 ? familyRules.levels[level - 1] : 0;
  const entries = Object.entries(setup.party ?? { a: {} });
  const party = entries.map(([id, over], i) =>
    member(id, {
      ...over,
      familyTags: [
        ...(over.familyTags ?? []),
        ...(i === 0 && family && count > 0 ? [{ family, count, magic: false, fromClass: false, source: 'gear' as const }] : []),
      ],
    }),
  );
  const boss: BossDef = { id: 'testBoss', name: 'test boss', hp: 1e6, damage: 5, damageType: 'power', speed: 5, tags: [], ...setup.boss };
  const steps = setup.mobs ? (setup.fights ?? 1) : (setup.traps ?? setup.caches ?? 0);
  const dungeon: DungeonDef = {
    ...dungeonById.ratCellar,
    encounterCount: [steps + 1, steps + 1],
    encounters: setup.mobs
      ? [{ type: 'fight', weight: 1, mobs: setup.mobs }]
      : setup.traps
        ? [{ type: 'trap', weight: 1, name: 'test trap', targets: 'all' }]
        : [{ type: 'event', weight: 1, eventId: 'cache' }],
    boss,
  };
  const run = simulateRun(party, dungeon, setup.seed ?? 'seed', { rules: steady, ...setup.options });
  const fight = run.encounters[0];
  const logOf = (locale: 'en' | 'fr') => {
    setLocale(locale);
    const lines = buildLog({ dungeon, party, run, gold: 0, recipeItemNames: [], salvaged: [] }, createRng('log'));
    setLocale('en');
    return lines.join(' ');
  };
  return { run, fight, party, log: logOf('en'), logFr: logOf('fr') };
}

/** How many times the fight logged the effect (at most once per encounter). */
export const logged = (fight: EncounterResult, effect: FamilyEffectId) =>
  fight.effects.filter((e) => e.key === 'family' && e.familyEffect === effect).length;
