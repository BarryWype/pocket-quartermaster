import { expeditionRules } from '@/content/dungeons';
import { dungeonById } from '@/content/lookup';

import type { Ability, BossDef, Briefing, DungeonDef, EncounterDef, ThreatId } from '../types';
import { simulateRun, type PartyMember } from './simulate';

/** No mishaps, luck, variance or crits, so effects can be checked exactly. */
const steady = { ...expeditionRules, mishapChance: 0, fortune: 0, damageVariance: 0, enemyCritChance: 0 };

const member = (heroId: string, abilities: Ability[] = [], overrides: Partial<PartyMember> = {}): PartyMember => ({
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
  abilities,
  consumable: null,
  ...overrides,
});

const weakBoss: BossDef = { id: 'testBoss', name: 'test boss', hp: 1, damage: 0, damageType: 'power', speed: 5, tags: [] };
/** One encounter then a boss that falls at once. */
const oneEncounter = (encounter: EncounterDef, extra: EncounterDef[] = []): DungeonDef => ({
  ...dungeonById.ratCellar,
  encounterCount: [2, 2],
  encounters: [encounter, ...extra],
  boss: weakBoss,
});
/** A briefing with one threat; a plain warrior (might 3, presence 1) meets level 1-2 with Might. */
const briefingOf = (id: ThreatId, level: 1 | 2 | 3 = 1): Briefing => ({ threats: [{ id, level }], restriction: null, opportunity: null });
const first = (party: PartyMember[], encounter: EncounterDef, seed = 's', briefing?: Briefing, extra: EncounterDef[] = []) =>
  simulateRun(party, oneEncounter(encounter, extra), seed, { rules: steady, ...(briefing ? { briefing } : {}) }).encounters[0];

const trap: EncounterDef = { type: 'trap', weight: 1, name: 'test trap', targets: 'all' };
const beasts: EncounterDef = { type: 'fight', weight: 1, mobs: [{ mobId: 'wolfPup', count: 2 }] };
const locals = (npcId: string): EncounterDef => ({ type: 'locals', weight: 1, npcId });

/** Knocks a hero out before the encounter that matters: 0 HP heroes are out from the start. */
const knockedOut = (hero: PartyMember): PartyMember => ({ ...hero, maxHp: 0 });

describe('damageVsTag', () => {
  it('hits mobs with the tag harder, and says who', () => {
    const dealt = (abilities: Ability[]) => first([member('a', abilities, { maxHp: 1e6 })], beasts);
    const plain = dealt([]);
    const bonus = dealt([{ kind: 'damageVsTag', tag: 'beast', multiplier: 1.5 }]);
    expect(bonus.rounds).toBeLessThan(plain.rounds);
    expect(bonus.effects).toContainEqual({ heroId: 'a', key: 'tagBonus', tag: 'beast' });
    const undead = dealt([{ kind: 'damageVsTag', tag: 'undead', multiplier: 1.5 }]);
    expect(undead.rounds).toBe(plain.rounds);
  });
});

describe('traps', () => {
  it('can have their damage reduced for the whole party', () => {
    const briefing = briefingOf('traps', 2);
    const result = first([member('a', [{ kind: 'trapReduce', multiplier: 0.5 }]), member('b')], trap, 's', briefing);
    expect(result.taken).toEqual({ a: 30, b: 30 });
    expect(result.effects).toEqual([{ heroId: 'a', key: 'trapReduce' }]);
  });

  it('ignore knocked-out heroes', () => {
    const briefing = briefingOf('traps', 2);
    const result = first([knockedOut(member('a')), member('b')], trap, 's', briefing);
    expect(result.taken).toEqual({ b: 60 });
  });
});

describe('locals', () => {
  it('are always a quiet step: no locals threat exists any more', () => {
    expect(first([member('a')], locals('hermit'))).toMatchObject({ kind: 'quiet', cleared: true, effects: [] });
    expect(first([member('a')], locals('poachers'), 's', briefingOf('traps', 1))).toMatchObject({ kind: 'quiet', cleared: true, effects: [] });
  });
});

describe('support and combat primitives', () => {
  const brute: BossDef = { id: 'brute', name: 'brute', hp: 400, damage: 20, damageType: 'power', speed: 5, tags: [] };
  const bossFight = (party: PartyMember[], boss: BossDef = brute, seed = 's') =>
    simulateRun(party, { ...oneEncounter({ type: 'event', weight: 1, eventId: 'spring' }), encounterCount: [1, 1], boss }, seed, {
      rules: steady,
    }).encounters[0];

  it('partyHeal: heals conscious heroes after each encounter', () => {
    const briefing = briefingOf('traps', 2);
    const run = simulateRun([member('a', [{ kind: 'partyHeal', pct: 0.1 }])], oneEncounter(trap), 's', { rules: steady, briefing });
    expect(run.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'partyHeal' });
    // The trap took 35%; the healer gives back 10% of max HP.
    expect(run.encounters[0].healed.a).toBeCloseTo(10);
  });

  it('protect: takes a share of the hits aimed at the most hurt ally', () => {
    const result = bossFight([
      member('tank', [{ kind: 'protect', share: 0.5 }], { maxHp: 1e6, threat: 0.0001 }),
      member('frail', [], { maxHp: 1e6, power: 1 }),
    ]);
    expect(result.effects).toContainEqual({ heroId: 'tank', key: 'protect', allyId: 'frail' });
    // Half of every hit on the frail hero goes to the tank instead.
    expect(result.taken.tank).toBeGreaterThan(result.taken.frail * 0.8);
  });

  it('rage: hits harder below the HP threshold', () => {
    const angry = [member('a', [{ kind: 'rage', belowPct: 2, multiplier: 2 }], { maxHp: 1e6 })];
    const calmHero = [member('a', [], { maxHp: 1e6 })];
    expect(bossFight(angry).rounds).toBeLessThan(bossFight(calmHero).rounds);
    expect(bossFight(angry).effects).toContainEqual({ heroId: 'a', key: 'rage' });
  });

  it("partyDamageBuff: lifts the whole party, but two buffers don't stack", () => {
    const buff = { kind: 'partyDamageBuff', multiplier: 2 } as const;
    const plain = bossFight([member('a', [], { maxHp: 1e6 }), member('b', [], { maxHp: 1e6 })]).rounds;
    const one = bossFight([member('a', [buff], { maxHp: 1e6 }), member('b', [], { maxHp: 1e6 })]).rounds;
    const two = bossFight([member('a', [buff], { maxHp: 1e6 }), member('b', [buff], { maxHp: 1e6 })]).rounds;
    expect(one).toBeLessThan(plain);
    expect(two).toBe(one);
  });

  it('critBonus: lands more critical hits, and says so', () => {
    const critRules = { ...steady, enemyCritChance: 0 };
    const run = (abilities: Ability[]) =>
      simulateRun([member('a', abilities, { maxHp: 1e6 })], { ...oneEncounter(trap), encounterCount: [1, 1], boss: brute }, 'c', {
        rules: critRules,
      }).encounters[0];
    expect(run([{ kind: 'critBonus', chance: 1 }]).rounds).toBeLessThan(run([]).rounds);
    expect(run([{ kind: 'critBonus', chance: 1 }]).effects).toContainEqual({ heroId: 'a', key: 'crit' });
  });

  it('elementalAdvantage: replaces the advantage multiplier, only when the element wins', () => {
    const grassBoss: BossDef = { ...brute, element: 'grass' };
    const fire = (abilities: Ability[]) => bossFight([member('a', abilities, { maxHp: 1e6, weaponElement: 'fire' })], grassBoss);
    expect(fire([{ kind: 'elementalAdvantage', multiplier: 3 }]).rounds).toBeLessThan(fire([]).rounds);
    expect(fire([{ kind: 'elementalAdvantage', multiplier: 3 }]).effects).toContainEqual({ heroId: 'a', key: 'advantage' });
    const water: BossDef = { ...brute, element: 'water' };
    const weak = (abilities: Ability[]) => bossFight([member('a', abilities, { maxHp: 1e6, weaponElement: 'fire' })], water).rounds;
    expect(weak([{ kind: 'elementalAdvantage', multiplier: 3 }])).toBe(weak([]));
  });
});

describe('trait effects', () => {
  /** Three live traps at level 1, half-missed: 37.5% of max HP in wounds, before the boss. */
  const wounded = (): DungeonDef => ({ ...oneEncounter(trap, [trap, trap]), encounterCount: [4, 4] });

  it('potionThreshold: drinks earlier', () => {
    const potion = { id: 'p', name: 'potion', emoji: '', slot: 'consumable' as const, heal: 1, when: 'lowHp' as const };
    const briefing = briefingOf('traps', 1);
    const run = (abilities: Ability[]) =>
      simulateRun([member('a', abilities, { consumable: potion })], wounded(), 's', { rules: steady, briefing });
    // Down to 62.5% of max HP: below the raised threshold (65%), above the normal one (35%).
    expect(run([{ kind: 'potionThreshold', add: 0.3 }]).consumed).toEqual(['a']);
    expect(run([]).consumed).toEqual([]);
  });

  it('stewBoost: Hunter’s stew heals more before the boss', () => {
    const briefing = briefingOf('traps', 1);
    const run = (abilities: Ability[]) =>
      simulateRun([member('a', abilities)], wounded(), 's', {
        rules: steady,
        briefing,
        meal: { kind: 'bossHeal', pct: 0.1 },
      }).encounters.at(-1)!.healed.a;
    expect(run([{ kind: 'stewBoost', multiplier: 2 }])).toBeCloseTo(run([]) * 2);
  });
});
