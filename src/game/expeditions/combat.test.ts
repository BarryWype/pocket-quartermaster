import { expeditionRules } from '@/content/dungeons';
import { dungeonById } from '@/content/lookup';

import { createRng } from '../generation/rng';
import type { BossDef, Briefing, DungeonDef, EncounterDef, ThreatId } from '../types';
import { patrolRewards } from '../patrols/fight';
import { findSpawn } from '../patrols/testHelpers';
import { simulateRun, type PartyMember } from './simulate';

/** No mishaps or run-wide luck, so each test sees the mechanic it targets. */
const calm = { ...expeditionRules, mishapChance: 0, fortune: 0 };
/** Also no variance or enemy crits, so numbers can be checked exactly. */
const steady = { ...calm, damageVariance: 0, enemyCritChance: 0 };

function member(heroId: string, overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    heroId,
    name: heroId,
    classId: 'warrior',
    traitId: 'none',
    weaponName: null,
    weaponType: null,
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
    abilities: [],
    consumable: null,
    ...overrides,
  };
}

function dungeon(encounters: EncounterDef[], boss: Partial<BossDef> = {}, count: [number, number] = [2, 2]): DungeonDef {
  return {
    ...dungeonById.ratCellar,
    encounterCount: count,
    encounters,
    boss: { id: 'testBoss', name: 'test boss', hp: 100, damage: 5, damageType: 'power', speed: 5, tags: [], ...boss },
  };
}

const bossOnly = (boss: Partial<BossDef> = {}) => dungeon([{ type: 'event', weight: 1, eventId: 'cache' }], boss);

const briefingOf = (id: ThreatId, level: 1 | 2 | 3 = 1, extra: Partial<Briefing> = {}): Briefing => ({
  threats: [{ id, level }],
  restriction: null,
  opportunity: null,
  ...extra,
});

/** The boss fight of a run against an unkillable boss, so every round plays out. */
const bossFight = (party: PartyMember[], boss: Partial<BossDef>, options: Parameters<typeof simulateRun>[3] = {}) => {
  const run = simulateRun(party, bossOnly({ hp: 1e6, ...boss }), 'seed', { rules: steady, ...options });
  const fight = run.encounters.find((e) => e.kind === 'boss');
  if (!fight) throw new Error('no boss fight');
  return { run, fight };
};

describe('combat stats', () => {
  it('blunts Power hits with Armour and Magic hits with Resistance', () => {
    const hero = (over: Partial<PartyMember>) => [member('a', { power: 1, maxHp: 1e6, ...over })];
    const perRound = (party: PartyMember[], boss: Partial<BossDef>, taken: boolean) => {
      const { fight } = bossFight(party, boss);
      const record = taken ? fight.taken : fight.dealt;
      return record.a / fight.rounds;
    };
    // Armour 50 halves a physical hit; a magic hit ignores it.
    const armoured = hero({ armour: 50, resistance: 0 });
    expect(perRound(armoured, { damage: 5, damageType: 'power' }, true)).toBeCloseTo(5 / 3, 5);
    expect(perRound(armoured, { damage: 5, damageType: 'magic' }, true)).toBeCloseTo(5, 5);
    // Resistance 50 halves a magic hit; a physical hit ignores it.
    const warded = hero({ armour: 0, resistance: 50 });
    expect(perRound(warded, { damage: 5, damageType: 'power' }, true)).toBeCloseTo(5, 5);
    expect(perRound(warded, { damage: 5, damageType: 'magic' }, true)).toBeCloseTo(5 / 3, 5);
  });

  it('caps Evasion at 40%', () => {
    const loss = (evasion: number) =>
      Array.from({ length: 60 }, (_, i) => {
        const { fight } = bossFight([member('a', { power: 1, maxHp: 1e6, evasion })], { damage: 5 }, undefined);
        return fight.taken.a;
      }).reduce((sum, taken) => sum + taken, 0) / 60;
    const none = loss(0);
    const cap = loss(40);
    const over = loss(100);
    expect(none).toBeCloseTo(200, -1);
    expect(cap).toBeLessThan(0.85 * none);
    expect(Math.abs(over - cap)).toBeLessThan(0.25 * cap);
  });

  it('lets a hero at least as fast as the enemies strike first', () => {
    const quick = simulateRun([member('a', { power: 60, speed: 9 })], bossOnly({ hp: 50, damage: 100, speed: 7 }), 'seed', {
      rules: steady,
    });
    expect(quick.bossDefeated).toBe(true);
    expect(quick.hp[0].hp).toBe(100);
    const slow = simulateRun([member('a', { power: 60, speed: 5 })], bossOnly({ hp: 50, damage: 100, speed: 7 }), 'seed', {
      rules: steady,
    });
    expect(slow.bossDefeated).toBe(false);
    expect(slow.hp[0].hp).toBe(0);
  });

  it('lets an exposed fight strike first whatever the Speed', () => {
    const run = simulateRun([member('a', { power: 60, speed: 9 })], bossOnly({ hp: 50, damage: 100, speed: 7 }), 'seed', {
      rules: steady,
      briefing: briefingOf('darkness', 2),
    });
    expect(run.bossDefeated).toBe(false);
    expect(run.hp[0].hp).toBe(0);
    const fight = run.encounters.find((e) => e.kind === 'boss');
    expect(fight?.effects).toContainEqual({ heroId: null, key: 'exposed' });
  });

  it('gives heroes their Crit stat as crit chance', () => {
    const perRound = (crit: number) => {
      const { fight } = bossFight([member('a', { crit })], {});
      return fight.dealt.a / fight.rounds;
    };
    expect(perRound(0)).toBeCloseTo(10, 5);
    expect(perRound(100)).toBeCloseTo(15, 5);
  });

  it('splits an infused physical hit and adds a share of Power', () => {
    const perRound = (boss: Partial<BossDef>) => {
      const { fight } = bossFight([member('a', { maxHp: 1e6, weaponElement: 'fire' })], boss);
      return fight.dealt.a / fight.rounds;
    };
    expect(perRound({})).toBeCloseTo(10 * 0.7 + 10 * 0.3 + 10 * 0.1, 5);
    // The elemental part rides the wheel: fire beats grass.
    expect(perRound({ element: 'grass' })).toBeCloseTo(10 * 0.7 + (10 * 0.3 + 10 * 0.1) * 1.5, 5);
  });

  it('halves Magic in an anti-magic zone', () => {
    const briefing: Briefing = { threats: [], restriction: 'antiMagic', opportunity: null };
    const caster = [member('a', { damageStat: 'magic', magic: 10 })];
    expect(bossFight(caster, {}).fight.dealt.a / bossFight(caster, {}).fight.rounds).toBeCloseTo(10, 5);
    expect(bossFight(caster, {}, { briefing }).fight.dealt.a / bossFight(caster, {}, { briefing }).fight.rounds).toBeCloseTo(5, 5);
  });

  it('pays Luck out in patrol gold', () => {
    const { spawn } = findSpawn((s) => s.kind === 'goblins');
    const context = { goldMultiplier: 1, pickaxeTier: 0 };
    const plain = patrolRewards({ ...context, luck: 0 }, spawn, 2, false, createRng('r'));
    const lucky = patrolRewards({ ...context, luck: 10 }, spawn, 2, false, createRng('r'));
    expect(plain.gold).toBeGreaterThan(0);
    expect(lucky.gold).toBe(Math.round(plain.gold * 1.5));
  });
});
