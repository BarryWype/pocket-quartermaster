import { expeditionRules } from '@/content/dungeons';
import { npcMobId } from '@/content/enemies';
import { dungeonById } from '@/content/lookup';
import { localsRules, npcById } from '@/content/npcs';

import type { Ability, BossDef, Briefing, DungeonDef, EncounterDef, ThreatId } from '../types';
import { simulateRun, type PartyMember } from './simulate';

/** No mishaps, luck, variance or crits, so effects can be checked exactly. */
const steady = { ...expeditionRules, mishapChance: 0, fortune: 0, damageVariance: 0, critChance: 0 };

const member = (heroId: string, abilities: Ability[] = [], overrides: Partial<PartyMember> = {}): PartyMember => ({
  heroId,
  name: heroId,
  classId: 'warrior',
  traitId: 'none',
  weaponName: null,
  weaponType: null,
  maxHp: 100,
  hp: overrides.hp ?? overrides.maxHp ?? 100,
  damage: 10,
  magic: 0,
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
    expect(result.taken).toEqual({ a: 6, b: 6 });
    expect(result.effects).toEqual([{ heroId: 'a', key: 'trapReduce' }]);
  });

  it('ignore knocked-out heroes', () => {
    const briefing = briefingOf('traps', 2);
    const result = first([knockedOut(member('a')), member('b')], trap, 's', briefing);
    expect(result.taken).toEqual({ b: 12 });
  });
});

describe('locals', () => {
  /** Locals are live only with the locals threat in the briefing. */
  const withLocals = (party: PartyMember[], npcId: string, level: 1 | 2 | 3 = 1, seed = 's') =>
    first(party, locals(npcId), seed, briefingOf('locals', level));

  it('help a party that meets them with Presence, as their NPC says', () => {
    // Presence 3 from a troubadour meets level 1 (needs 2).
    const charming = member('a', [], { classId: 'troubadour' });
    const hermit = withLocals([charming], 'hermit');
    expect(hermit).toMatchObject({ reaction: 'help', help: npcById.hermit.help, cleared: true });
    const troll = withLocals([charming], 'tollTroll');
    expect(troll.gold).toBe(Math.round(0.3 * dungeonById.ratCellar.gold[1]));
  });

  it('give a tip that skips the next trap', () => {
    const charming = member('a', [], { classId: 'troubadour' });
    const run = simulateRun(
      [charming],
      {
        ...oneEncounter(locals('lostMiner')),
        encounterCount: [3, 3],
        // The trap never comes up in the draw: the guarantee gives it the step after the locals.
        encounters: [locals('lostMiner'), { ...trap, weight: 1e-9 }],
      },
      's',
      {
        rules: steady,
        briefing: { threats: [{ id: 'locals', level: 1 }, { id: 'traps', level: 1 }], restriction: null, opportunity: null },
      },
    );
    expect(run.encounters[0]).toMatchObject({ kind: 'locals', reaction: 'help' });
    expect(run.encounters[1].kind).toBe('trap');
    expect(run.encounters[1].effects).toEqual([{ heroId: null, key: 'tip' }]);
    expect(run.encounters[1].taken).toEqual({});
  });

  it('lose some gold to a pickpocket when the party only half meets them, and sometimes notice', () => {
    // A fire mage (Presence 1, Might 1) half-misses level 1: the thief works.
    const thief = member('a', [{ kind: 'pickpocket' }], { classId: 'fireMage', maxHp: 1e6, damage: 100 });
    const results = Array.from({ length: 60 }, (_, i) => withLocals([thief], 'pedlar', 1, `p${i}`));
    results.forEach((r) => expect(r).toMatchObject({ reaction: 'steal', gold: Math.round(localsRules.pickpocketGoldShare * 12) }));
    const noticed = results.filter((r) => r.noticed).length / results.length;
    expect(noticed).toBeGreaterThan(0.1);
    expect(noticed).toBeLessThan(0.55);
  });

  it('turn neutral when the party merely intimidates them: no help, no fight', () => {
    // Might 3 from a barbarian meets level 1 (needs 2), but that only scares them.
    const barbarian = member('a', [], { classId: 'barbarian' });
    expect(withLocals([barbarian], 'hermit')).toMatchObject({ reaction: 'neutral', cleared: true, gold: 0 });
    expect(withLocals([barbarian], 'hermit', 2)).toMatchObject({ reaction: 'neutral', cleared: true });
  });

  it('still lose a purse to a thief when the party intimidates them', () => {
    const barbarian = member('a', [], { classId: 'barbarian' });
    const thief = member('t', [{ kind: 'pickpocket' }]);
    const picks = Array.from({ length: 20 }, (_, i) => withLocals([barbarian, thief], 'hermit', 1, `i${i}`));
    expect(picks.every((p) => p.reaction === 'steal' && p.gold > 0)).toBe(true);
    // Not every lift gets noticed: some end without a fight.
    expect(picks.some((p) => !p.noticed && p.cleared)).toBe(true);
  });

  it('sometimes turn hostile when the party misses them, and fight with their hostile group', () => {
    // A fire mage alone: level 1 is one short (half), so the extra fight is a coin flip.
    const loner = member('a', [], { classId: 'fireMage', maxHp: 1e6, damage: 100 });
    const met = Array.from({ length: 40 }, (_, i) => withLocals([loner], 'poachers', 1, `h${i}`));
    const hostile = met.filter((r) => r.reaction === 'fight');
    expect(hostile.length).toBeGreaterThan(0);
    expect(hostile.length).toBeLessThan(40);
    hostile.forEach((result) => {
      expect(result.mobs).toEqual([{ mobId: npcMobId('poachers', 1), count: 3 }]);
      expect(result.rounds).toBeGreaterThan(0);
    });
  });

  it('are a quiet step without the locals threat in the briefing', () => {
    expect(first([member('a')], locals('hermit'))).toMatchObject({ kind: 'quiet', cleared: true, effects: [] });
  });

  it("don't count knocked-out pickpockets", () => {
    const thief = knockedOut(member('a', [{ kind: 'pickpocket' }], { classId: 'fireMage' }));
    const result = withLocals([thief, member('b')], 'pedlar');
    expect(result.reaction).not.toBe('steal');
  });
});

describe('support and combat primitives', () => {
  const brute: BossDef = { id: 'brute', name: 'brute', hp: 400, damage: 20, tags: [] };
  const bossFight = (party: PartyMember[], boss: BossDef = brute, seed = 's') =>
    simulateRun(party, { ...oneEncounter({ type: 'event', weight: 1, eventId: 'spring' }), encounterCount: [1, 1], boss }, seed, {
      rules: steady,
    }).encounters[0];

  it('partyHeal: heals conscious heroes after each encounter', () => {
    const briefing = briefingOf('traps', 2);
    const run = simulateRun([member('a', [{ kind: 'partyHeal', pct: 0.1 }])], oneEncounter(trap), 's', { rules: steady, briefing });
    expect(run.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'partyHeal' });
    // The trap took 12%; the healer gives back 10% of max HP.
    expect(run.encounters[0].healed.a).toBeCloseTo(10);
  });

  it('protect: takes a share of the hits aimed at the most hurt ally', () => {
    const result = bossFight([
      member('tank', [{ kind: 'protect', share: 0.5 }], { maxHp: 1e6, threat: 0.0001 }),
      member('frail', [], { maxHp: 1e6, damage: 1 }),
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
    const critRules = { ...steady, critChance: 0 };
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
  /** Three live traps at level 3: 54% of max HP in wounds, before the boss. */
  const wounded = (): DungeonDef => ({ ...oneEncounter(trap, [trap, trap]), encounterCount: [4, 4] });

  it('potionThreshold: drinks earlier', () => {
    const potion = { id: 'p', name: 'potion', emoji: '', slot: 'consumable' as const, heal: 1, when: 'lowHp' as const };
    const briefing = briefingOf('traps', 3);
    const run = (abilities: Ability[]) =>
      simulateRun([member('a', abilities, { consumable: potion })], wounded(), 's', { rules: steady, briefing });
    // Down to 46% of max HP: below the raised threshold (65%), above the normal one (35%).
    expect(run([{ kind: 'potionThreshold', add: 0.3 }]).consumed).toEqual(['a']);
    expect(run([]).consumed).toEqual([]);
  });

  it('stewBoost: Hunter’s stew heals more before the boss', () => {
    const briefing = briefingOf('traps', 3);
    const run = (abilities: Ability[]) =>
      simulateRun([member('a', abilities)], wounded(), 's', {
        rules: steady,
        briefing,
        meal: { kind: 'bossHeal', pct: 0.1 },
      }).encounters.at(-1)!.healed.a;
    expect(run([{ kind: 'stewBoost', multiplier: 2 }])).toBeCloseTo(run([]) * 2);
  });
});
