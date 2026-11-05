import { expeditionRules } from '@/content/dungeons';
import { mobById } from '@/content/enemies';
import { dungeonById } from '@/content/lookup';

import type { BossDef, DungeonDef, EncounterDef, SpecialId } from '../types';
import { createRng } from '../generation/rng';
import { buildLog } from './log';
import { simulateRun, type PartyMember, type RunResult } from './simulate';

/** No mishaps, luck, variance or crits, so effects can be checked exactly. */
const steady = { ...expeditionRules, mishapChance: 0, fortune: 0, damageVariance: 0, enemyCritChance: 0 };

function member(heroId: string, overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    heroId,
    name: heroId,
    classId: 'warrior',
    traitId: 'none',
    weaponName: null,
    gearKeywords: [],
    heavy: false,
    concealed: false,
    maxHp: 1_000_000,
    hp: overrides.hp ?? overrides.maxHp ?? 1_000_000,
    power: 10,
    magic: 0,
    damageStat: 'power',
    armour: 0,
    resistance: 0,
    evasion: 0,
    speed: 7,
    crit: 0,
    luck: 0,
    threat: 1,
    resists: [],
    abilities: [],
    consumable: null,
    ...overrides,
  };
}

/** A hero whose special is the one under test; no other ability or gear. */
const hero = (special: SpecialId, overrides: Partial<PartyMember> = {}) => member('a', { special, ...overrides });

function dungeon(encounters: EncounterDef[], boss: Partial<BossDef> = {}, count: [number, number] = [2, 2]): DungeonDef {
  return {
    ...dungeonById.ratCellar,
    encounterCount: count,
    encounters,
    boss: { id: 'testBoss', name: 'test boss', hp: 100, damage: 5, damageType: 'power', speed: 7, tags: [], ...boss },
  };
}

/**
 * Fixed copies of three tier 1 mobs, so a refit of the dungeon strengths
 * can't change the fights these tests count (mobById is this file's own copy).
 */
const RAT = { ...mobById.giantRat, id: 'testRat', hp: 29, damage: 11 };
const BONES = { ...mobById.restlessBones, id: 'testBones', hp: 29, damage: 11 };
const BOGLING = { ...mobById.bogling, id: 'testBogling', hp: 125, damage: 36 };
Object.assign(mobById, { [RAT.id]: RAT, [BONES.id]: BONES, [BOGLING.id]: BOGLING });

const quiet: EncounterDef = { type: 'event', weight: 1, eventId: 'cache' };
/** One fight of `count` giant rats (29 HP, 11 damage, Speed 7 like the hero). */
const rats = (count: number): EncounterDef => ({ type: 'fight', weight: 1, mobs: [{ mobId: RAT.id, count }] });
/** One fight of `count` restless bones (29 HP, 11 damage, Speed 5, undead). */
const bones = (count: number): EncounterDef => ({ type: 'fight', weight: 1, mobs: [{ mobId: BONES.id, count }] });
/** One fight of `count` boglings (125 HP, 36 damage, Speed 7, grass). */
const boglings = (count: number): EncounterDef => ({ type: 'fight', weight: 1, mobs: [{ mobId: BOGLING.id, count }] });
/** Just the boss: `bossOnly({ hp: 60 })` is a run that only fights it. */
const bossOnly = (boss: Partial<BossDef> = {}) => dungeon([quiet], boss, [1, 1]);

const run = (party: PartyMember[], def: DungeonDef, seed = 's') => simulateRun(party, def, seed, { rules: steady });
const logOf = (party: PartyMember[], result: RunResult, def: DungeonDef) =>
  buildLog({ dungeon: def, party, run: result, gold: 0, recipeItemNames: [], salvaged: [] }, createRng('log')).join(' ');
const fired = (result: RunResult, special: SpecialId, at = 0) =>
  result.encounters[at].effects.some((f) => f.key === 'special' && f.specialId === special);

/** A seed where the hero's turn special fires and changes the fight, found here so chance tuning can't hide it. */
function firingSeed(party: PartyMember[], def: DungeonDef, check: (result: RunResult, seed: string) => boolean): string {
  for (let i = 0; i < 500; i++) {
    const seed = `s${i}`;
    if (check(run(party, def, seed), seed)) return seed;
  }
  throw new Error('no seed where the special fires');
}

describe('specials', () => {
  it('gives the same run for the same party and seed, and draws nothing for a party without specials', () => {
    const def = dungeonById.goblinWarren;
    const party = [member('a'), member('b', { classId: 'ranger' })];
    const first = run(party, def, 'seed');
    expect(run(party, def, 'seed')).toEqual(first);
    expect(first.extraLootRolls).toBe(0);
    expect(first.encounters.some((e) => e.effects.some((f) => f.key === 'special'))).toBe(false);
  });

  it('plays a plain fight exactly as before, and a special that never applies changes nothing', () => {
    const def = dungeon([rats(1)]);
    const plain = run([member('a')], def, 's');
    // Three hits of 10 fell the rat, which strikes back twice for its full damage.
    expect(plain.encounters[0]).toMatchObject({ rounds: 3, dealt: { a: 30 }, taken: { a: 2 * RAT.damage } });
    // Smite never meets an undead here, so it draws nothing and the run is identical.
    expect(run([hero('smite')], def, 's')).toEqual(plain);
  });

  it('Cleave hits every enemy of a big fight, once per fight', () => {
    const def = dungeon([rats(3)], {}, [3, 3]);
    const result = run([hero('cleave', { power: 12 })], def, 's');
    const plain = run([member('a', { power: 12 })], def, 's');
    // 45% of a hit of 12 on every rat up front: each takes one blow fewer to fell.
    expect(result.encounters[0].rounds).toBe(6);
    expect(plain.encounters[0].rounds).toBe(9);
    for (const i of [0, 1]) {
      expect(result.encounters[i].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'cleave', count: 3 });
    }
    expect(logOf([hero('cleave', { power: 12 })], result, def)).toContain('Cleave cut through 3 foes');
  });

  it('Elemental blast runs the whole hit through the elemental wheel', () => {
    const def = dungeon([boglings(3)], {}, [3, 3]);
    const caster = hero('elementalBlast', { damageStat: 'magic', magic: 13, weaponElement: 'fire' });
    const result = run([caster], def, 's');
    const plain = run([member('a', { damageStat: 'magic', magic: 13, weaponElement: 'fire' })], def, 's');
    // Fire beats the boglings' grass: a hit is 13 at the wheel's 1.5, and the blast lands 45% of one on each.
    const hit = 13 * 1.5;
    expect(result.encounters[0].rounds).toBe(3 * Math.ceil((BOGLING.hp - 0.45 * hit) / hit));
    expect(plain.encounters[0].rounds).toBe(3 * Math.ceil(BOGLING.hp / hit));
    expect(result.encounters[0].rounds).toBeLessThan(plain.encounters[0].rounds);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'elementalBlast', count: 3 });
  });

  it('Aimed strike makes the first hit of every fight a sure crit', () => {
    const def = dungeon([rats(1)], {}, [3, 3]);
    const result = run([hero('aimedStrike')], def, 's');
    const plain = run([member('a')], def, 's');
    // The first hit crits for ×1.5; without it, three hits of 10 fell the 29 HP rat.
    expect(result.encounters[0].dealt.a).toBe(35);
    expect(plain.encounters[0].dealt.a).toBe(30);
    for (const i of [0, 1]) {
      expect(result.encounters[i].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'aimedStrike' });
    }
  });

  it('Flurry replaces the turn with three quick hits', () => {
    const def = dungeon([rats(1)]);
    const seed = firingSeed(
      [hero('flurry')],
      def,
      (result, s) => fired(result, 'flurry') && result.encounters[0].rounds < run([member('a')], def, s).encounters[0].rounds,
    );
    const result = run([hero('flurry')], def, seed);
    const plain = run([member('a')], def, seed);
    // Three full hits in the turn they replace fell the rat early.
    expect(result.encounters[0].rounds).toBeLessThan(3);
    expect(plain.encounters[0].rounds).toBe(3);
    expect(result.encounters[0].dealt.a).toBe(30);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'flurry', count: 3 });
    expect(logOf([hero('flurry')], result, def)).toContain('flurry of 3 blows');
  });

  it('Poison wears at the target for three rounds', () => {
    const def = bossOnly({ hp: 69, damage: 0 });
    const seed = firingSeed([hero('poison')], def, (result) => fired(result, 'poison') && result.encounters[0].rounds === 6);
    const result = run([hero('poison')], def, seed);
    const plain = run([member('a')], def, seed);
    // 30% of a hit at the start of each of the next three rounds saves a round.
    expect(result.encounters[0].rounds).toBe(6);
    expect(plain.encounters[0].rounds).toBe(7);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'poison' });
  });

  it('Smite replaces the first turn against an undead with a quadrupled hit', () => {
    const def = dungeon([bones(1)], {}, [3, 3]);
    const speed = BONES.speed;
    const result = run([hero('smite', { speed })], def, 's');
    const plain = run([member('a', { speed })], def, 's');
    const hp = BONES.hp;
    expect(result.encounters[0].rounds).toBe(1 + Math.max(0, Math.ceil((hp - 40) / 10)));
    expect(plain.encounters[0].rounds).toBe(Math.ceil(hp / 10));
    for (const i of [0, 1]) {
      expect(result.encounters[i].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'smite' });
    }
  });

  it('Execute lands a tripled hit on the faltering boss', () => {
    const def = bossOnly({ hp: 100, damage: 0 });
    const result = run([hero('execute')], def, 's');
    const plain = run([member('a')], def, 's');
    // The boss under 25% of 100 HP eats a ×3 hit instead of a ×1, saving a round.
    expect(result.encounters[0].rounds).toBe(9);
    expect(plain.encounters[0].rounds).toBe(10);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'execute' });
  });

  it('Focus doubles the hero’s next attack in the boss fight, once per expedition', () => {
    const def = bossOnly({ hp: 60, damage: 0 });
    const result = run([hero('focus')], def, 's');
    const plain = run([member('a')], def, 's');
    expect(result.encounters[0].rounds).toBe(5);
    expect(plain.encounters[0].rounds).toBe(6);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'focus' });
  });

  it('Double or nothing replaces the turn with a ×8 hit or a miss', () => {
    const def = dungeon([rats(1)]);
    const party = [hero('doubleOrNothing')];
    const hitSeed = firingSeed(party, def, (result) => fired(result, 'doubleOrNothing') && result.encounters[0].rounds === 1);
    const missSeed = firingSeed(party, def, (result) =>
      result.encounters[0].effects.some((f) => f.key === 'special' && f.specialId === 'doubleOrNothing' && f.missed),
    );
    const hit = run(party, def, hitSeed);
    const miss = run(party, def, missSeed);
    const plain = run([member('a')], def, missSeed);
    // The hit fells the rat at once; the miss costs the turn and the fight plays out as ever.
    expect(hit.encounters[0].dealt.a).toBe(80);
    expect(miss.encounters[0].dealt.a).toBe(plain.encounters[0].dealt.a);
    expect(logOf(party, hit, def)).toContain('went double or nothing and doubled');
    expect(logOf(party, miss, def)).toContain('went double or nothing and missed');
  });

  it('Stagger takes the strongest enemy’s next turn', () => {
    const def = dungeon([rats(1)], {}, [3, 3]);
    const result = run([hero('stagger')], def, 's');
    const plain = run([member('a')], def, 's');
    // The rat loses its round 1 attack; the fight itself plays out the same.
    expect(result.encounters[0].taken.a).toBe(RAT.damage);
    expect(plain.encounters[0].taken.a).toBe(2 * RAT.damage);
    for (const i of [0, 1]) {
      expect(result.encounters[i].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'stagger' });
    }
  });

  it('Entangle takes the hero’s target’s next turn', () => {
    const def = dungeon([rats(1)]);
    const seed = firingSeed(
      [hero('entangle')],
      def,
      (result, s) => fired(result, 'entangle') && result.encounters[0].taken.a !== run([member('a')], def, s).encounters[0].taken.a,
    );
    const result = run([hero('entangle')], def, seed);
    const plain = run([member('a')], def, seed);
    expect(result.encounters[0].taken.a).toBe(RAT.damage);
    expect(plain.encounters[0].taken.a).toBe(2 * RAT.damage);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'entangle' });
  });

  it('Stagger can be shaken off, and its use is spent anyway', () => {
    const def = dungeon([rats(1)], {}, [3, 3]);
    const seed = firingSeed([hero('stagger')], def, (result) => result.encounters[0].taken.a === 2 * RAT.damage);
    const result = run([hero('stagger')], def, seed);
    expect(fired(result, 'stagger')).toBe(false);
    expect(result.encounters[0].rounds).toBe(run([member('a')], def, seed).encounters[0].rounds);
  });

  it('Deep freeze takes every enemy’s turn, once per expedition', () => {
    const def = dungeon([rats(3)], {}, [3, 3]);
    const result = run([hero('deepFreeze')], def, 's');
    const plain = run([member('a')], def, 's');
    // All three rats skip their first attack.
    expect(result.encounters[0].taken.a).toBe(plain.encounters[0].taken.a - 3 * RAT.damage);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'deepFreeze', count: 3 });
    // Once per expedition: the second big fight sees none of it.
    expect(result.encounters[1].effects.some((f) => f.key === 'special' && f.specialId === 'deepFreeze')).toBe(false);
  });

  it('Dirty trick takes the boss’s first attack', () => {
    const def = bossOnly({ hp: 100, damage: 10 });
    const result = run([hero('dirtyTrick')], def, 's');
    const plain = run([member('a')], def, 's');
    expect(result.encounters[0].taken.a).toBe(80);
    expect(plain.encounters[0].taken.a).toBe(90);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'dirtyTrick' });
  });

  it('Taunt pulls the attacks onto its hero for the next two attack phases', () => {
    const def = bossOnly({ hp: 100, damage: 10 });
    const party: PartyMember[] = [
      member('a', { special: 'taunt', threat: 0 }),
      member('b', { power: 0, maxHp: 100, threat: 1 }),
    ];
    const result = run(party, def, 's');
    const plain = run([member('a', { threat: 0 }), member('b', { power: 0, maxHp: 100, threat: 1 })], def, 's');
    // The boss only ever means to hit b; once b drops below 40%, a takes the next phase's blow at half damage.
    expect(result.encounters[0].taken).toEqual({ a: 5, b: 80 });
    expect(plain.encounters[0].taken).toEqual({ b: 90 });
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'taunt' });
  });

  it('Distraction keeps the enemies off the weakest ally for the next phases', () => {
    const def = dungeon([rats(2)]);
    const party: PartyMember[] = [
      member('a', { special: 'distraction', threat: 0 }),
      member('b', { maxHp: 1000, hp: 250, threat: 1 }),
    ];
    const result = run(party, def, 's');
    const plain = run([member('a', { threat: 0 }), member('b', { maxHp: 1000, hp: 250, threat: 1 })], def, 's');
    // The first rat's blow lands on b, already low; every blow after it goes to a instead.
    expect(result.encounters[0].taken).toEqual({ a: 2 * RAT.damage, b: RAT.damage });
    expect(plain.encounters[0].taken).toEqual({ b: 3 * RAT.damage });
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'distraction' });
  });

  it('Mana shield absorbs the next hit once it stands', () => {
    const def = bossOnly({ hp: 5000, damage: 300 });
    const result = run([hero('manaShield', { power: 1000, maxHp: 1000, hp: 1000 })], def, 's');
    const plain = run([member('a', { power: 1000, maxHp: 1000, hp: 1000 })], def, 's');
    // Below half HP after two blows, the third is swallowed whole.
    expect(result.encounters[0].taken.a).toBe(900);
    expect(plain.encounters[0].taken.a).toBe(1200);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'manaShield' });
  });

  it('Ward absorbs the next hit on the weakest ally at the boss’s first turn', () => {
    const def = bossOnly({ hp: 100, damage: 10 });
    const party: PartyMember[] = [
      member('a', { special: 'ward', threat: 0 }),
      member('b', { power: 0, maxHp: 100, threat: 1 }),
    ];
    const result = run(party, def, 's');
    const plain = run([member('a', { threat: 0 }), member('b', { power: 0, maxHp: 100, threat: 1 })], def, 's');
    expect(result.encounters[0].taken.b).toBe(80);
    expect(plain.encounters[0].taken.b).toBe(90);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'ward', allyId: 'b' });
  });

  it('Vanish slips out of the way for the rest of the attack phase', () => {
    const def = dungeon([rats(2)]);
    const result = run([hero('vanish', { maxHp: 100, hp: 40 })], def, 's');
    const plain = run([member('a', { maxHp: 100, hp: 40 })], def, 's');
    // The first rat's blow brings the hero under 40%; three phases of misses buy rounds before the hero falls.
    expect(result.encounters[0].rounds).toBe(6);
    expect(plain.encounters[0].rounds).toBe(2);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'vanish' });
  });

  it('Riposte counters the next two hits taken', () => {
    const def = bossOnly({ hp: 120, damage: 5 });
    const result = run([hero('riposte')], def, 's');
    const plain = run([member('a')], def, 's');
    // Two counters of a full hit shorten the fight by two rounds, for the same total damage.
    expect(result.encounters[0].rounds).toBe(10);
    expect(plain.encounters[0].rounds).toBe(12);
    expect(result.encounters[0].dealt.a).toBe(plain.encounters[0].dealt.a);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'riposte' });
  });

  it('Second wind heals its hero once below 30%, once per expedition', () => {
    const def = bossOnly({ hp: 90, damage: 10 });
    const result = run([hero('secondWind', { maxHp: 100, hp: 100 })], def, 's');
    const plain = run([member('a', { maxHp: 100, hp: 100 })], def, 's');
    expect(result.encounters[0].healed.a).toBe(50);
    expect(result.hp.find((h) => h.heroId === 'a')!.hp).toBe(70);
    expect(plain.hp.find((h) => h.heroId === 'a')!.hp).toBe(20);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'secondWind' });
  });

  it('Mend heals the weakest ally once one is below 40%', () => {
    const def = bossOnly({ hp: 100, damage: 10 });
    const party: PartyMember[] = [
      member('a', { special: 'mend', threat: 0 }),
      member('b', { power: 0, maxHp: 100, threat: 1 }),
    ];
    const result = run(party, def, 's');
    const plain = run([member('a', { threat: 0 }), member('b', { power: 0, maxHp: 100, threat: 1 })], def, 's');
    expect(result.encounters[0].healed.b).toBeCloseTo(14);
    expect(result.hp.find((h) => h.heroId === 'b')!.hp).toBe(24);
    expect(plain.hp.find((h) => h.heroId === 'b')!.hp).toBe(10);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'mend', allyId: 'b' });
  });

  it('Regrowth heals the party a little every round for three rounds', () => {
    const def = bossOnly({ hp: 100, damage: 20 });
    const result = run([hero('regrowth', { maxHp: 100, hp: 100 })], def, 's');
    const plain = run([member('a', { maxHp: 100, hp: 100 })], def, 's');
    expect(result.encounters[0].healed.a).toBe(15);
    expect(result.encounters[0].rounds).toBe(6);
    expect(plain.encounters[0].rounds).toBe(5);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'regrowth' });
  });

  it('Rally lifts the party’s damage for two rounds of the boss fight', () => {
    const def = bossOnly({ hp: 103, damage: 0 });
    const result = run([hero('rally')], def, 's');
    const plain = run([member('a')], def, 's');
    // +15% on rounds 2 and 3 is the 3 damage that saves a round.
    expect(result.encounters[0].rounds).toBe(10);
    expect(plain.encounters[0].rounds).toBe(11);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'rally' });
  });

  it('Patch up heals the party after every cleared fight', () => {
    const def = dungeon([rats(1)], { damage: 0 }, [3, 3]);
    const party = [hero('patchUp', { maxHp: 100, hp: 100 })];
    const result = run(party, def, 's');
    const plain = run([member('a', { maxHp: 100, hp: 100 })], def, 's');
    // 5.5% of max HP after each of the two fights, each of which cost two rat blows.
    for (const i of [0, 1]) {
      expect(result.encounters[i].healed.a).toBe(5.5);
      expect(result.encounters[i].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'patchUp' });
    }
    expect(result.hp.find((h) => h.heroId === 'a')!.hp).toBe(100 - 4 * RAT.damage + 11);
    expect(plain.hp.find((h) => h.heroId === 'a')!.hp).toBe(100 - 4 * RAT.damage);
    expect(logOf(party, result, def)).toContain('patched everyone up');
  });

  it('Feast heals the party before the boss', () => {
    const def = dungeon([rats(1)], { damage: 0 }, [3, 3]);
    const result = run([hero('feast', { maxHp: 100, hp: 100 })], def, 's');
    const plain = run([member('a', { maxHp: 100, hp: 100 })], def, 's');
    // The rats cost four blows; the feast heals 18% before the boss, and the boss deals nothing.
    expect(result.encounters[2].healed.a).toBe(18);
    expect(result.hp.find((h) => h.heroId === 'a')!.hp).toBe(100 - 4 * RAT.damage + 18);
    expect(plain.hp.find((h) => h.heroId === 'a')!.hp).toBe(100 - 4 * RAT.damage);
    expect(result.encounters[2].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'feast' });
  });

  it('Resurrection raises a fallen ally, who keeps their knock-out', () => {
    const def = bossOnly({ hp: 70, damage: 20 });
    const party: PartyMember[] = [
      member('a', { special: 'resurrection', threat: 0 }),
      member('b', { power: 0, maxHp: 100, threat: 1 }),
    ];
    const result = run(party, def, 's');
    const plain = run([member('a', { threat: 0 }), member('b', { power: 0, maxHp: 100, threat: 1 })], def, 's');
    // b falls on the boss’s fifth blow and comes back at 30%.
    expect(result.encounters[0].knockedOut).toEqual(['b']);
    expect(result.hp.find((h) => h.heroId === 'b')!.hp).toBe(10);
    expect(plain.hp.find((h) => h.heroId === 'b')!.hp).toBe(0);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'resurrection', allyId: 'b' });
    expect(logOf(party, result, def)).toContain('raised b from the dead');
  });

  it('Banish outright defeats one undead, once per fight', () => {
    const def = dungeon([bones(2)], {}, [3, 3]);
    const speed = BONES.speed;
    const result = run([hero('banish', { speed })], def, 's');
    const plain = run([member('a', { speed })], def, 's');
    expect(result.encounters[0].rounds).toBe(plain.encounters[0].rounds / 2);
    for (const i of [0, 1]) {
      expect(result.encounters[i].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'banish' });
    }
  });

  it('Parley talks the strongest enemy of a big fight into leaving, once per expedition', () => {
    const def = dungeon([rats(3)], {}, [3, 3]);
    const result = run([hero('parley')], def, 's');
    const plain = run([member('a')], def, 's');
    // One rat of three leaves before a blow lands.
    expect(result.encounters[0].rounds).toBe(6);
    expect(plain.encounters[0].rounds).toBe(9);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'parley' });
    expect(result.encounters[1].effects.some((f) => f.key === 'special' && f.specialId === 'parley')).toBe(false);
    expect(logOf([hero('parley')], result, def)).toContain('talked a foe into leaving');
  });

  it('Summon calls an ally that strikes every round of the fight', () => {
    const def = dungeon([rats(3)], {}, [3, 3]);
    const result = run([hero('summon')], def, 's');
    const plain = run([member('a')], def, 's');
    // 80% of a hit every round takes three rounds off the fight.
    expect(result.encounters[0].rounds).toBe(6);
    expect(plain.encounters[0].rounds).toBe(9);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'summon' });
    // Once per expedition: the second big fight fights without the ally.
    expect(result.encounters[1].effects.some((f) => f.key === 'special' && f.specialId === 'summon')).toBe(false);
  });

  it('Turret fires beside its hero for three rounds of the boss fight', () => {
    const def = bossOnly({ hp: 60, damage: 0 });
    const result = run([hero('turret')], def, 's');
    const plain = run([member('a')], def, 's');
    // 40% of a hit for three rounds saves a round of the fight.
    expect(result.encounters[0].rounds).toBe(5);
    expect(plain.encounters[0].rounds).toBe(6);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'turret' });
  });

  it('Meteor falls on the boss once it is below half, once per expedition', () => {
    const def = bossOnly({ hp: 60, damage: 5 });
    const result = run([hero('meteor')], def, 's');
    const plain = run([member('a')], def, 's');
    expect(result.encounters[0].rounds).toBe(5);
    expect(plain.encounters[0].rounds).toBe(6);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'meteor' });
  });

  it('Steal adds an extra roll of the won run’s loot row', () => {
    const def = bossOnly({ hp: 20, damage: 0 });
    const result = run([hero('steal')], def, 's');
    const plain = run([member('a')], def, 's');
    expect(result.extraLootRolls).toBe(1);
    expect(plain.extraLootRolls).toBe(0);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'special', specialId: 'steal' });
  });
});
