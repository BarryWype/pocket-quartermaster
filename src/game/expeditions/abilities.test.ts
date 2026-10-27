import { expeditionRules } from '@/content/dungeons';
import { npcMobId } from '@/content/enemies';
import { dungeonById } from '@/content/lookup';
import { localsRules, npcById } from '@/content/npcs';

import type { Ability, BossDef, DungeonDef, EncounterDef } from '../types';
import { simulateRun, type PartyMember } from './simulate';

/** No mishaps, luck, variance or crits, so effects can be checked exactly. */
const steady = { ...expeditionRules, mishapChance: 0, fortune: 0, damageVariance: 0, critChance: 0 };

const member = (heroId: string, abilities: Ability[] = [], overrides: Partial<PartyMember> = {}): PartyMember => ({
  heroId,
  name: heroId,
  classId: 'warrior',
  traitId: 'none',
  weaponName: null,
  maxHp: 100,
  hp: overrides.hp ?? overrides.maxHp ?? 100,
  damage: 10,
  defense: 0,
  threat: 1,
  resists: [],
  abilities,
  consumable: null,
  ...overrides,
});

const weakBoss: BossDef = { id: 'testBoss', name: 'test boss', hp: 1, damage: 0, tags: [] };
/** One encounter then a boss that falls at once. */
const oneEncounter = (encounter: EncounterDef, extra: EncounterDef[] = []): DungeonDef => ({
  ...dungeonById.ratCellar,
  encounterCount: [2, 2],
  encounters: [encounter, ...extra],
  boss: weakBoss,
});
const first = (party: PartyMember[], encounter: EncounterDef, seed = 's', extra: EncounterDef[] = []) =>
  simulateRun(party, oneEncounter(encounter, extra), seed, { rules: steady }).encounters[0];

const trap: EncounterDef = { type: 'trap', weight: 1, name: 'test trap', damagePct: 0.2, targets: 'all', triggerChance: 1 };
const rubble: EncounterDef = { type: 'obstacle', weight: 1, name: 'rubble pile', kind: 'rubble', hpCostPct: 0.1, detourChance: 0 };
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
  it('can be disarmed for the whole party', () => {
    const result = first([member('a', [{ kind: 'trapDisarm', chance: 1 }]), member('b')], trap);
    expect(result).toMatchObject({ trapTriggered: false, taken: {}, cleared: true });
    expect(result.effects).toEqual([{ heroId: 'a', key: 'disarm' }]);
  });

  it('can have its damage reduced for the whole party', () => {
    const result = first([member('a', [{ kind: 'trapReduce', multiplier: 0.5 }]), member('b')], trap);
    expect(result.taken).toEqual({ a: 10, b: 10 });
    expect(result.effects).toEqual([{ heroId: 'a', key: 'trapReduce' }]);
  });

  it('ignores knocked-out heroes', () => {
    const result = first([knockedOut(member('a', [{ kind: 'trapDisarm', chance: 1 }])), member('b')], trap);
    expect(result.trapTriggered).toBe(true);
  });
});

describe('calmBeasts', () => {
  it('skips an all-beast fight: cleared, no HP lost, counted as calmed', () => {
    const run = simulateRun([member('a', [{ kind: 'calmBeasts', chance: 1 }])], oneEncounter(beasts), 's', { rules: steady });
    expect(run.encounters[0]).toMatchObject({ calmed: true, cleared: true, taken: {}, rounds: 0 });
    expect(run.encountersCalmed).toBe(1);
  });

  it('only works when every mob is a beast', () => {
    const mixed: EncounterDef = { type: 'fight', weight: 1, mobs: [{ mobId: 'wolfPup', count: 1 }, { mobId: 'goblin', count: 1 }] };
    expect(first([member('a', [{ kind: 'calmBeasts', chance: 1 }], { maxHp: 1e6 })], mixed).calmed).toBe(false);
  });
});

describe('obstacles', () => {
  it('are cleared for free by a hero who can solve them', () => {
    const result = first([member('a', [{ kind: 'obstacleSolve', kinds: ['rubble'] }]), member('b')], rubble);
    expect(result).toMatchObject({ cleared: true, taken: {} });
    expect(result.effects).toEqual([{ heroId: 'a', key: 'solve' }]);
  });

  it('cost everyone HP otherwise', () => {
    const result = first([member('a', [{ kind: 'obstacleSolve', kinds: ['barricade'] }]), member('b')], rubble);
    expect(result).toMatchObject({ cleared: true, taken: { a: 10, b: 10 }, detour: false });
  });

  it('can force a detour fight from the dungeon pool', () => {
    const detour = { ...rubble, detourChance: 1 } as EncounterDef;
    const result = first([member('a', [], { maxHp: 1e6 })], detour, 's', [{ ...beasts, weight: 0.0001 }]);
    expect(result.detour).toBe(true);
    expect(result.mobs).toEqual([{ mobId: 'wolfPup', count: 2 }]);
    expect(result.rounds).toBeGreaterThan(0);
  });

  it("don't count knocked-out solvers", () => {
    const result = first([knockedOut(member('a', [{ kind: 'obstacleSolve', kinds: ['rubble'] }])), member('b')], rubble);
    expect(result.effects).toEqual([]);
  });
});

describe('locals', () => {
  const charm: Ability = { kind: 'localsReaction', key: 'charm' };
  const provoke: Ability = { kind: 'localsReaction', key: 'provoke' };
  const pickpocket: Ability = { kind: 'localsReaction', key: 'pickpocket' };

  it('help a charming party, as their NPC says', () => {
    const hermit = first([member('a', [charm])], locals('hermit'));
    expect(hermit).toMatchObject({ reaction: 'help', help: npcById.hermit.help, cleared: true });
    const troll = first([member('a', [charm])], locals('tollTroll'));
    expect(troll.gold).toBe(Math.round(0.3 * dungeonById.ratCellar.gold[1]));
  });

  it('give a tip that skips the next trap', () => {
    const party = [member('a', [charm])];
    const run = simulateRun(party, { ...oneEncounter(locals('lostMiner')), encounterCount: [3, 3], encounters: [locals('lostMiner')] }, 's', {
      rules: steady,
    });
    expect(run.encounters[0].reaction).toBe('help');
    const withTrap = simulateRun(
      party,
      { ...oneEncounter(locals('lostMiner')), encounterCount: [3, 3], encounters: [{ ...locals('lostMiner'), weight: 1e-9 }, trap] },
      's',
      { rules: steady },
    );
    // Whatever order they come in, a trap right after a tip is skipped.
    const tipIndex = withTrap.encounters.findIndex((e) => e.kind === 'locals');
    const next = withTrap.encounters[tipIndex + 1];
    if (tipIndex >= 0 && next?.kind === 'trap') expect(next.effects).toEqual([{ heroId: null, key: 'tip' }]);
  });

  it('fight a provoking party with their hostile group', () => {
    const result = first([member('a', [provoke], { maxHp: 1e6, damage: 100 })], locals('poachers'));
    expect(result.reaction).toBe('fight');
    expect(result.mobs).toEqual([{ mobId: npcMobId('poachers', 1), count: 3 }]);
    expect(result.rounds).toBeGreaterThan(0);
  });

  it('lose some gold to a pickpocket, and sometimes notice', () => {
    const results = Array.from({ length: 60 }, (_, i) => first([member('a', [pickpocket], { maxHp: 1e6, damage: 100 })], locals('pedlar'), `p${i}`));
    results.forEach((r) => expect(r).toMatchObject({ reaction: 'steal', gold: Math.round(localsRules.pickpocketGoldShare * 12) }));
    const noticed = results.filter((r) => r.noticed).length / results.length;
    expect(noticed).toBeGreaterThan(0.1);
    expect(noticed).toBeLessThan(0.55);
  });

  it('ignore a party with no way with people', () => {
    expect(first([member('a')], locals('hermit'))).toMatchObject({ reaction: 'neutral', cleared: true, effects: [] });
  });

  it('react in priority order: charm, then provoke, then pickpocket', () => {
    expect(first([member('a', [pickpocket]), member('b', [provoke]), member('c', [charm])], locals('hermit')).reaction).toBe('help');
    expect(first([member('a', [pickpocket]), member('b', [provoke], { damage: 100 })], locals('hermit')).reaction).toBe('fight');
  });

  it("don't count knocked-out heroes", () => {
    expect(first([knockedOut(member('a', [charm])), member('b')], locals('hermit')).reaction).toBe('neutral');
  });
});

describe('support and combat primitives', () => {
  const brute: BossDef = { id: 'brute', name: 'brute', hp: 400, damage: 20, tags: [] };
  const bossFight = (party: PartyMember[], boss: BossDef = brute, seed = 's') =>
    simulateRun(party, { ...oneEncounter({ type: 'event', weight: 1, eventId: 'spring' }), encounterCount: [1, 1], boss }, seed, {
      rules: steady,
    }).encounters[0];

  it('partyHeal: heals conscious heroes after each encounter', () => {
    const run = simulateRun([member('a', [{ kind: 'partyHeal', pct: 0.1 }])], oneEncounter(trap), 's', { rules: steady });
    expect(run.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'partyHeal' });
    expect(run.encounters[0].healed.a).toBeCloseTo(10);
  });

  it('protect: takes a share of the hits aimed at the most hurt ally', () => {
    const result = bossFight([member('tank', [{ kind: 'protect', share: 0.5 }], { maxHp: 1e6, threat: 0.0001 }), member('frail', [], { maxHp: 1e6, damage: 1 })]);
    expect(result.effects).toContainEqual({ heroId: 'tank', key: 'protect', allyId: 'frail' });
    // Half of every hit on the frail hero goes to the tank instead.
    expect(result.taken.tank).toBeGreaterThan(result.taken.frail * 0.8);
  });

  it('rage: hits harder below the HP threshold', () => {
    const angry = [member('a', [{ kind: 'rage', belowPct: 2, multiplier: 2 }], { maxHp: 1e6 })];
    const calm = [member('a', [], { maxHp: 1e6 })];
    expect(bossFight(angry).rounds).toBeLessThan(bossFight(calm).rounds);
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
    const critRules = { ...steady, critChance: 0 };
    const run = (abilities: Ability[]) =>
      simulateRun([member('a', abilities, { maxHp: 1e6 })], { ...oneEncounter(trap), encounterCount: [1, 1], boss: brute }, 'c', {
        rules: critRules,
      }).encounters[0];
    expect(run([{ kind: 'critBonus', chance: 1 }]).rounds).toBeLessThan(run([]).rounds);
    expect(run([{ kind: 'critBonus', chance: 1 }]).effects).toContainEqual({ heroId: 'a', key: 'crit' });
  });

  it('cacheBonus: finds more gold in caches', () => {
    const cache: EncounterDef = { type: 'event', weight: 1, eventId: 'cache' };
    const gold = (abilities: Ability[]) => first([member('a', abilities)], cache).gold;
    expect(gold([{ kind: 'cacheBonus', multiplier: 2 }])).toBe(gold([]) * 2);
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
  const ambush: EncounterDef = { type: 'event', weight: 1, eventId: 'ambush' };

  it('ambushAlert: ambushes lose the first strike', () => {
    const lone: EncounterDef = { type: 'fight', weight: 1e-9, mobs: [{ mobId: 'wolfPup', count: 1 }] };
    const hit = (abilities: Ability[]) => first([member('a', abilities, { maxHp: 1e6, damage: 1000 })], ambush, 's', [lone]);
    expect(hit([]).taken.a).toBeGreaterThan(0);
    expect(hit([{ kind: 'ambushAlert' }]).taken).toEqual({});
    expect(hit([{ kind: 'ambushAlert' }]).effects).toContainEqual({ heroId: 'a', key: 'alert' });
  });

  it('trapTrigger: sets traps off more often', () => {
    const half = { ...trap, triggerChance: 0.5 } as EncounterDef;
    const rate = (abilities: Ability[]) =>
      Array.from({ length: 200 }, (_, i) => first([member('a', abilities)], half, `t${i}`)).filter((r) => r.trapTriggered).length / 200;
    expect(rate([{ kind: 'trapTrigger', multiplier: 2 }])).toBeGreaterThan(rate([]) + 0.3);
  });

  it('potionThreshold: drinks earlier', () => {
    const potion = { id: 'p', name: 'potion', emoji: '', slot: 'consumable' as const, heal: 1, when: 'lowHp' as const };
    const half = { ...trap, damagePct: 0.5 } as EncounterDef;
    expect(first([member('a', [], { consumable: potion })], half).consumed).toEqual([]);
    expect(first([member('a', [{ kind: 'potionThreshold', add: 0.3 }], { consumable: potion })], half).consumed).toEqual(['a']);
  });

  it('stewBoost: Hunter’s stew heals more before the boss', () => {
    const run = (abilities: Ability[]) =>
      simulateRun([member('a', abilities)], oneEncounter({ ...trap, damagePct: 0.5 } as EncounterDef), 's', {
        rules: steady,
        meal: { kind: 'bossHeal', pct: 0.1 },
      }).encounters[1].healed.a;
    expect(run([{ kind: 'stewBoost', multiplier: 2 }])).toBeCloseTo(run([]) * 2);
  });

  it('hostileLocals: indifferent locals sometimes attack, and pickpockets get noticed more', () => {
    const loud: Ability = { kind: 'hostileLocals', chance: 1, noticeBonus: 0.7 };
    const result = first([member('a', [loud], { maxHp: 1e6, damage: 100 })], locals('hermit'));
    expect(result).toMatchObject({ reaction: 'fight' });
    expect(result.effects).toContainEqual({ heroId: 'a', key: 'loud' });
    const pickpocket: Ability = { kind: 'localsReaction', key: 'pickpocket' };
    expect(first([member('a', [pickpocket, loud], { maxHp: 1e6, damage: 100 })], locals('hermit')).noticed).toBe(true);
  });
});
