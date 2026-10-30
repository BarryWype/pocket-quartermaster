import { expeditionRules } from '@/content/dungeons';
import { dungeonById } from '@/content/lookup';

import type { BossDef, Briefing, DungeonDef, EncounterDef, GearInstance, Keyword, ThreatId } from '../types';
import { createInitialSave, type SaveData } from '../save';
import { gearKeywordsOf } from '../team/team';
import { simulateRun, type PartyMember } from './simulate';

/** No mishaps or run-wide luck, so each test sees the mechanic it targets. */
const calm = { ...expeditionRules, mishapChance: 0, fortune: 0 };
/** Also no variance or enemy crits, so numbers can be checked exactly. */
const steady = { ...calm, damageVariance: 0, enemyCritChance: 0 };

function member(heroId: string, keywords: Keyword[] = [], overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    heroId,
    name: heroId,
    classId: 'warrior',
    traitId: 'none',
    weaponName: null,
    gearKeywords: keywords.map((keyword) => ({ keyword, magic: false })),
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

/** The boss fight of a seeded run, for tests that average over many seeds. */
const seededFight = (party: PartyMember[], boss: Partial<BossDef>, seed: string, rules = steady) => {
  const run = simulateRun(party, bossOnly({ hp: 1e6, ...boss }), seed, { rules });
  const fight = run.encounters.find((e) => e.kind === 'boss');
  if (!fight) throw new Error('no boss fight');
  return fight;
};

describe('gear keywords', () => {
  it('Pierce ignores the Armoured penalty', () => {
    // Level 3 needs three pierce heroes, so one still takes the full penalty.
    const options = { rules: steady, briefing: briefingOf('armoured', 3) };
    const plain = bossFight([member('a', [], { maxHp: 1e6 })], {}, options).fight.dealt.a;
    const pierce = bossFight([member('a', ['pierce'], { maxHp: 1e6 })], {}, options).fight.dealt.a;
    expect(plain).toBeCloseTo(10 * 0.5 * 40, 5);
    expect(pierce).toBeCloseTo(plain / 0.5, 5);
  });

  it('Cleave splashes onto a second enemy', () => {
    const rules = { ...steady, maxRounds: 3 };
    const def = dungeon([{ type: 'fight', weight: 1, mobs: [{ mobId: 'giantRat', count: 2 }] }]);
    const fight = (keywords: Keyword[]) =>
      simulateRun([member('a', keywords, { power: 1 })], def, 'seed', { rules }).encounters[0];
    const plain = fight([]).dealt.a;
    const cleave = fight(['cleave']).dealt.a;
    expect(plain).toBeCloseTo(3, 5);
    expect(cleave).toBeCloseTo(3 * 1.3, 5);
  });

  it('Guard draws enemy hits towards the hero', () => {
    const taken = (keywords: Keyword[]) =>
      Array.from({ length: 120 }, (_, i) => seededFight([member('guard', keywords), member('plain')], { damage: 1 }, `s${i}`, {
        ...steady,
        maxRounds: 5,
      }).taken.guard ?? 0).reduce((sum, t) => sum + t, 0);
    expect(taken(['guard'])).toBeGreaterThan(taken([]) * 1.2);
  });

  it('Parry blocks physical hits only', () => {
    const taken = (keywords: Keyword[], damageType: 'power' | 'magic') =>
      Array.from({ length: 60 }, (_, i) =>
        seededFight([member('a', keywords, { maxHp: 1e6 })], { damage: 5, damageType }, `s${i}`, {
          ...steady,
          maxRounds: 5,
        }).taken.a ?? 0,
      ).reduce((sum, t) => sum + t, 0);
    expect(taken(['parry'], 'power')).toBeLessThan(taken([], 'power') * 0.95);
    expect(taken(['parry'], 'magic')).toBe(taken([], 'magic'));
  });

  it('Reach strikes first in an exposed fight', () => {
    const hero = (keywords: Keyword[]) => [member('a', keywords, { power: 60, speed: 5 })];
    const options = { rules: steady, briefing: briefingOf('darkness', 2) };
    const reach = simulateRun(hero(['reach']), bossOnly({ hp: 50, damage: 100, speed: 7 }), 'seed', options);
    expect(reach.bossDefeated).toBe(true);
    expect(reach.hp[0].hp).toBe(100);
    const plain = simulateRun(hero([]), bossOnly({ hp: 50, damage: 100, speed: 7 }), 'seed', options);
    expect(plain.bossDefeated).toBe(false);
    expect(plain.hp[0].hp).toBe(0);
  });

  it('Stagger makes enemies lose attacks', () => {
    const taken = (keywords: Keyword[]) =>
      Array.from({ length: 60 }, (_, i) =>
        seededFight([member('a', keywords, { maxHp: 1e6 })], { damage: 5 }, `s${i}`, { ...steady, maxRounds: 10 }).taken
          .a ?? 0,
      ).reduce((sum, t) => sum + t, 0);
    expect(taken(['stagger'])).toBeLessThan(taken([]) * 0.9);
  });

  it('Brace halves the first big hit of a fight', () => {
    const rules = { ...steady, maxRounds: 1 };
    const fight = (keywords: Keyword[]) => {
      const boss = simulateRun([member('a', keywords)], bossOnly({ damage: 50 }), 'seed', { rules }).encounters.find(
        (e) => e.kind === 'boss',
      );
      if (!boss) throw new Error('no boss fight');
      return boss;
    };
    const plain = fight([]).taken.a;
    const brace = fight(['brace']).taken.a;
    expect(plain).toBeCloseTo(50, 5);
    expect(brace).toBeCloseTo(25, 5);
  });

  it('Channel deepens the elemental advantage', () => {
    const perRound = (keywords: Keyword[]) =>
      bossFight([member('a', keywords, { maxHp: 1e6, weaponElement: 'fire' })], { element: 'grass' }).fight.dealt.a /
      40;
    expect(perRound([])).toBeCloseTo(10 * 0.7 + 10 * 0.4 * 1.5, 5);
    expect(perRound(['channel'])).toBeCloseTo(10 * 0.7 + 10 * 0.4 * 1.7, 5);
  });

  it('Inspire lifts party damage, on top of a buff', () => {
    const perRound = (party: PartyMember[]) =>
      bossFight(party.map((h) => ({ ...h, maxHp: 1e6, hp: 1e6 })), {}).fight.dealt.a / 40;
    expect(perRound([member('a', ['inspire'])])).toBeCloseTo(10 * 1.05, 5);
    const buff = [
      member('a', ['inspire']),
      member('b', [], { abilities: [{ kind: 'partyDamageBuff', multiplier: 1.2 }] }),
    ];
    expect(perRound(buff)).toBeCloseTo(10 * 1.2 * 1.05, 5);
  });

  it('Mend heals the most wounded hero after a fight', () => {
    const rules = { ...steady, maxRounds: 1 };
    const party = [member('a', [], { hp: 40 }), member('b', ['mend'])];
    const run = (briefing: Briefing) => {
      const boss = simulateRun(party, bossOnly({ damage: 1 }), 'seed', { rules, briefing }).encounters.find(
        (e) => e.kind === 'boss',
      );
      if (!boss) throw new Error('no boss fight');
      return boss;
    };
    expect(run({ threats: [], restriction: null, opportunity: null }).healed.a).toBeCloseTo(5, 5);
    expect(run({ threats: [], restriction: 'noHealing', opportunity: null }).healed.a).toBeCloseTo(2.5, 5);
  });

  it('drops keywords from magic sources in an anti-magic zone', () => {
    const briefing: Briefing = { threats: [], restriction: 'antiMagic', opportunity: null };
    const wand = [
      member('a', [], { maxHp: 1e6, weaponElement: 'fire', gearKeywords: [{ keyword: 'channel', magic: true }] }),
    ];
    const dealt = bossFight(wand, { element: 'grass' }, { briefing }).fight.dealt.a;
    const plain = bossFight([member('a', [], { maxHp: 1e6, weaponElement: 'fire' })], { element: 'grass' }, { briefing })
      .fight.dealt.a;
    expect(dealt).toBeCloseTo(plain, 5);
    expect(bossFight(wand, { element: 'grass' }).fight.dealt.a).toBeGreaterThan(dealt);
  });
});

describe('strong keywords', () => {
  /** A hero wearing one piece of gear, optionally forged with a component. */
  const heroWith = (itemId: string, component?: string) => {
    const gear: GearInstance = { uid: 'g1', itemId, quality: 'normal', ...(component ? { component } : {}) };
    const save: SaveData = { ...createInitialSave(), gear: [gear] };
    const hero = { ...save.heroes[0], equipment: { ...save.heroes[0].equipment, weapon: 'g1' } };
    return gearKeywordsOf({ ...save, heroes: [hero] }, hero);
  };

  it("adds the component's keyword, or strengthens the piece's own", () => {
    // A mace is Blessed and Stagger: an ogre knucklebone doubles Stagger.
    expect(heroWith('mace3', 'ogreKnucklebone')).toEqual([
      { keyword: 'blessed', magic: false },
      { keyword: 'stagger', magic: false, strong: true },
    ]);
    expect(heroWith('mace3')).toEqual([
      { keyword: 'blessed', magic: false },
      { keyword: 'stagger', magic: false },
    ]);
    // A parrying dagger has no keywords: an escapement adds Parry.
    expect(heroWith('offhandBlade1', 'clockworkEscapement')).toEqual([{ keyword: 'parry', magic: false }]);
  });

  it('uses the strong Stagger and Parry chances', () => {
    const taken = (keyword: 'stagger' | 'parry', strong: boolean) =>
      Array.from({ length: 60 }, (_, i) =>
        seededFight(
          [
            member('a', [keyword], {
              ...(strong ? { gearKeywords: [{ keyword, magic: false, strong: true as const }] } : {}),
            }),
          ],
          { damage: 5 },
          `s${i}`,
          { ...steady, maxRounds: 10 },
        ).taken.a ?? 0,
      ).reduce((sum, t) => sum + t, 0);
    expect(taken('stagger', true)).toBeLessThan(taken('stagger', false) * 0.95);
    expect(taken('parry', true)).toBeLessThan(taken('parry', false) * 0.95);
  });

  it('strong Brace softens the first two big hits', () => {
    const rules = { ...steady, maxRounds: 2 };
    const taken = (strong: boolean) => {
      const boss = simulateRun(
        [
          member('a', ['brace'], {
            ...(strong ? { gearKeywords: [{ keyword: 'brace', magic: false, strong: true as const }] } : {}),
          }),
        ],
        bossOnly({ damage: 50 }),
        'seed',
        { rules },
      ).encounters.find((e) => e.kind === 'boss');
      if (!boss) throw new Error('no boss fight');
      return boss.taken.a;
    };
    expect(taken(false)).toBeCloseTo(25 + 50, 5);
    expect(taken(true)).toBeCloseTo(25 + 25, 5);
  });
});
