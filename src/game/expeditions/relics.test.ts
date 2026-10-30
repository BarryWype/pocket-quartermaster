import { GEAR_SLOTS, gearId } from '@/content/equipment';
import { expeditionRules } from '@/content/dungeons';
import { elementRules } from '@/content/elements';
import { dungeonById, relicById } from '@/content/lookup';

import type { ActiveThreat, BossDef, Briefing, DungeonDef, EncounterDef, GearInstance, Tag, ThreatId } from '../types';
import { createInitialSave, type SaveData } from '../save';
import { answersMemberOf, prepareParty, simulateRun, type PartyMember } from './simulate';
import { launchPlan } from './expeditions';
import { heroAnswers } from '../threats/answers';
import { scoreThreat } from '../threats/score';
import { estimateOdds } from './odds';

/** No mishaps or run-wide luck, so each test sees the mechanic it targets. */
const calm = { ...expeditionRules, mishapChance: 0, fortune: 0 };
/** Also no variance or enemy crits, so numbers can be checked exactly. */
const steady = { ...calm, damageVariance: 0, enemyCritChance: 0 };

/** A hero wearing one piece of gear, restored from a relic or plain, with flat combat numbers. */
function wornMember(itemId: string, relicId: string | null, overrides: Partial<PartyMember> = {}, heroId = 'bram'): PartyMember {
  const gear: GearInstance = { uid: 'g1', itemId, quality: 'normal', ...(relicId ? { relicId } : {}) };
  const save: SaveData = { ...createInitialSave(), gear: [gear] };
  const base = save.heroes.find((h) => h.id === heroId)!;
  const slot = GEAR_SLOTS[itemId.replace(/\d+$/, '') as keyof typeof GEAR_SLOTS];
  const hero = { ...base, equipment: { ...base.equipment, [slot]: 'g1' } };
  const member = prepareParty({ ...save, heroes: [hero] }, [hero.id])[0];
  return {
    ...member,
    maxHp: 100,
    hp: 100,
    power: 10,
    magic: 10,
    armour: 0,
    resistance: 0,
    evasion: 0,
    speed: 5,
    crit: 0,
    luck: 0,
    threat: 1,
    ...overrides,
  };
}

/** A hero wearing the piece their relic restores into. */
function relicMember(relicId: string, overrides: Partial<PartyMember> = {}, heroId = 'bram'): PartyMember {
  const relic = relicById[relicId];
  return wornMember(gearId(relic.gearType, relic.tier), relic.id, overrides, heroId);
}

/** A hero with no gear at all, for parties that need a second body. */
function plainMember(heroId: string, overrides: Partial<PartyMember> = {}): PartyMember {
  const save = createInitialSave();
  const member = prepareParty(save, [heroId])[0];
  return {
    ...member,
    maxHp: 100,
    hp: 100,
    power: 10,
    magic: 10,
    armour: 0,
    resistance: 0,
    evasion: 0,
    speed: 5,
    crit: 0,
    luck: 0,
    threat: 1,
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

describe('relic keyword effects', () => {
  it("the Dwarf-lord's axe pierces constructs but not beasts", () => {
    const options = { rules: steady, briefing: briefingOf('armoured', 3) };
    const dealt = (tags: Tag[]) => bossFight([relicMember('dwarfLordsAxe', { maxHp: 1e6, hp: 1e6 })], { tags }, options).fight.dealt.bram;
    expect(dealt(['construct'])).toBeCloseTo(10 * 40, 5);
    expect(dealt(['beast'])).toBeCloseTo(10 * (1 - 0.52) * 40, 5);
  });

  it("the Sexton's mace staggers undead strongly, beasts not at all beyond the mace itself", () => {
    const rules = { ...steady, maxRounds: 10 };
    const taken = (relic: boolean, tags: Tag[]) =>
      Array.from({ length: 80 }, (_, i) =>
        seededFight([relic ? relicMember('sextonsMace') : wornMember('mace1', null)], { damage: 5, tags }, `s${i}`, rules).taken
          .bram ?? 0,
      ).reduce((sum, t) => sum + t, 0);
    expect(taken(true, ['undead'])).toBeLessThan(taken(false, ['undead']) * 0.95);
    // Against beasts the relic never fires: the run plays out identically.
    expect(taken(true, ['beast'])).toBe(taken(false, ['beast']));
  });

  it("the Deserter's mail braces strongly in the first fight only", () => {
    const rules = { ...steady, maxRounds: 2 };
    const taken = (encounters: EncounterDef[]) => {
      const run = simulateRun([relicMember('desertersMail')], dungeon(encounters, { damage: 50 }), 'seed', { rules });
      const boss = run.encounters.find((e) => e.kind === 'boss');
      if (!boss) throw new Error('no boss fight');
      return boss.taken.bram;
    };
    // The boss is the first fight: both big hits are softened.
    expect(taken([{ type: 'event', weight: 1, eventId: 'cache' }])).toBeCloseTo(25 + 25, 5);
    // A rat fight first: the boss is the second fight, so only the mace's own brace holds.
    expect(taken([{ type: 'fight', weight: 1, mobs: [{ mobId: 'giantRat', count: 1 }] }])).toBeCloseTo(25 + 50, 5);
  });

  it("the Thief-taker's quiver reaches through Ambush briefings only", () => {
    const hero = (relic: boolean) => [relic ? relicMember('thiefTakersQuiver', { power: 80, speed: 5 }) : wornMember('quiver3', null, { power: 80, speed: 5 })];
    const boss = { hp: 120, damage: 60, speed: 7 };
    // Ambushed: the relic's strong reach strikes first in rounds 1 and 2, felling the boss before its second blow.
    const ambushed = simulateRun(hero(true), bossOnly(boss), 'seed', { rules: steady, briefing: briefingOf('ambush', 3) });
    expect(ambushed.bossDefeated).toBe(true);
    expect(ambushed.hp[0].hp).toBeCloseTo(40, 5);
    // The quiver's own reach covers round 1 only: with or without the briefing, the boss lands its second blow first.
    const ambushedPlain = simulateRun(hero(false), bossOnly(boss), 'seed', { rules: steady, briefing: briefingOf('ambush', 3) });
    expect(ambushedPlain.bossDefeated).toBe(false);
    const plain = simulateRun(hero(true), bossOnly(boss), 'seed', { rules: steady });
    expect(plain.bossDefeated).toBe(false);
    expect(plain.hp[0].hp).toBe(0);
  });

  it("the Barrow king's blade heals only on undead kills", () => {
    const run = (tags: Tag[]) =>
      simulateRun([relicMember('barrowKingsBlade', { power: 60 })], bossOnly({ hp: 10, damage: 30, damageType: 'magic', speed: 7, tags }), 'seed', {
        rules: steady,
      });
    expect(run(['undead']).hp[0].hp).toBeCloseTo(100 - 30 + 10, 5);
    expect(run(['beast']).hp[0].hp).toBeCloseTo(70, 5);
  });
});

describe('relic combat effects', () => {
  it("the Poacher's longbow doubles crits against beasts only", () => {
    const dealt = (tags: Tag[]) =>
      bossFight([relicMember('poachersLongbow', { crit: 100, maxHp: 1e6, hp: 1e6 })], { tags }).fight.dealt.bram / 40;
    expect(dealt(['beast'])).toBeCloseTo(10 * 2, 5);
    expect(dealt(['undead'])).toBeCloseTo(10 * calm.critMultiplier, 5);
  });

  it("the Hedge-witch's robes halve their wearer's poison wounds", () => {
    const party = [relicMember('hedgeWitchsRobes'), plainMember('lyra')];
    const run = simulateRun(party, bossOnly({ damage: 0 }), 'seed', {
      rules: { ...steady, maxRounds: 1 },
      briefing: briefingOf('poison', 3),
    });
    const boss = run.encounters.find((e) => e.kind === 'boss')!;
    expect(boss.taken.bram).toBeCloseTo(0.25 * 100 * 0.5, 5);
    expect(boss.taken.lyra).toBeCloseTo(25, 5);
  });

  it("the Smuggler's coat removes the Thieves' lost loot", () => {
    const options = { rules: calm, briefing: briefingOf('thieves', 3) };
    const coat = simulateRun([relicMember('smugglersCoat')], bossOnly(), 'seed', options);
    const plain = simulateRun([plainMember('bram')], bossOnly(), 'seed', options);
    expect(plain.lostLoot).toBeCloseTo(0.3, 5);
    expect(coat.lostLoot).toBe(0);
  });

  it("the Drowned bell ignores the Underwater penalty in the first fight only", () => {
    const options = { rules: steady, briefing: briefingOf('underwater', 3) };
    const bell = () => [relicMember('drownedBell', { maxHp: 1e6, hp: 1e6 })];
    // The boss is the first fight: no weakening.
    expect(bossFight(bell(), {}, options).fight.dealt.bram).toBeCloseTo(10 * 40, 5);
    // A rat fight first: the boss is the second fight, fought out of depth.
    const run = simulateRun(
      bell(),
      dungeon([{ type: 'fight', weight: 1, mobs: [{ mobId: 'giantRat', count: 1 }] }], { hp: 1e6 }),
      'seed',
      options,
    );
    const boss = run.encounters.find((e) => e.kind === 'boss')!;
    expect(boss.dealt.bram).toBeCloseTo(10 * (1 - 0.32) * 40, 5);
  });

  it("the Dragonbone plate resists fire and halves its hits", () => {
    const plate = relicMember('dragonbonePlate');
    expect(plate.resists).toContain('fire');
    const boss = { damage: 40, damageType: 'magic' as const, element: 'fire' as const };
    const rules = { ...steady, maxRounds: 1 };
    const taken = (party: PartyMember[]) =>
      simulateRun(party, bossOnly(boss), 'seed', { rules }).encounters.find((e) => e.kind === 'boss')!.taken.bram;
    expect(taken([plate])).toBeCloseTo(20, 5);
    expect(taken([plainMember('bram')])).toBeCloseTo(40 * elementRules.unprotectedMultiplier, 5);
  });

  it("the Archmage's tome strikes every enemy with the first spell of the first fight only", () => {
    const rules = steady;
    const rats = dungeon([{ type: 'fight', weight: 1, mobs: [{ mobId: 'giantRat', count: 3 }] }], {}, [3, 3]);
    // A Magic hero (Bram's stat overridden) so the tome's spell is what they cast.
    const run = simulateRun([relicMember('archmagesTome', { magic: 100, speed: 0, damageStat: 'magic' })], rats, 'seed', { rules });
    const [first, second] = run.encounters.filter((e) => e.kind === 'fight');
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    // The first spell fells all three rats at once; later fights kill one per round.
    expect(first!.rounds).toBe(1);
    expect(second!.rounds).toBe(3);
  });
});

describe('relic answers', () => {
  const scored = (member: PartyMember, threat: ActiveThreat) => scoreThreat(threat, [heroAnswers(answersMemberOf(member))]);

  it("the Miner's lamp-staff meets Darkness", () => {
    const score = scored(relicMember('minersLampStaff', {}, 'mira'), { id: 'darkness', level: 1 });
    expect(score.state).toBe('met');
  });

  it("the Cartographer's focus meets Maze at level 3", () => {
    const score = scored(relicMember('cartographersFocus', {}, 'mira'), { id: 'maze', level: 3 });
    expect(score.state).toBe('met');
    expect(score.have).toBe(5);
  });

  it("the Dwarf-lord's situational pierce never meets Armoured", () => {
    const score = scored(relicMember('dwarfLordsAxe'), { id: 'armoured', level: 2 });
    expect(score.state).toBe('full');
    expect(score.have).toBe(0);
  });
});

describe('relic odds', () => {
  /** A save whose hero wears the relic piece, or nothing. */
  const saveWith = (relicId: string | null, heroId = 'mira') => {
    const save = createInitialSave();
    if (!relicId) return save;
    const relic = relicById[relicId];
    const gear: GearInstance = { uid: 'g1', itemId: gearId(relic.gearType, relic.tier), quality: 'normal', relicId: relic.id };
    return {
      ...save,
      gear: [...save.gear, gear],
      heroes: save.heroes.map((h) => (h.id === heroId ? { ...h, equipment: { ...h.equipment, [GEAR_SLOTS[relic.gearType]]: 'g1' } } : h)),
    };
  };
  const briefingOf3 = (id: ThreatId): Briefing => ({ threats: [{ id, level: 3 }], restriction: null, opportunity: null });

  it("the lamp-staff raises the odds against Darkness", () => {
    const dungeon = dungeonById.ratCellar;
    const options = { briefing: briefingOf3('darkness') };
    const withLamp = estimateOdds(saveWith('minersLampStaff'), ['bram', 'lyra', 'mira'], dungeon, 100, options);
    const without = estimateOdds(saveWith(null), ['bram', 'lyra', 'mira'], dungeon, 100, options);
    expect(withLamp.success).toBeGreaterThan(without.success);
  });

  it("the Cartographer's focus raises the odds against a Maze", () => {
    const dungeon = dungeonById.ratCellar;
    const briefing = briefingOf3('maze');
    const heroIds = ['bram', 'lyra', 'mira'];
    // Just enough supply to eat well when the maze is met, short when it is not.
    const base = launchNeed(saveWith(null), dungeon, heroIds);
    const stock = (relicId: string | null) => {
      const save = saveWith(relicId);
      return { ...save, consumables: { trailMix: Math.ceil(base / 2) } };
    };
    const withFocus = estimateOdds(stock('cartographersFocus'), heroIds, dungeon, 100, { briefing });
    const without = estimateOdds(stock(null), heroIds, dungeon, 100, { briefing });
    expect(withFocus.success).toBeGreaterThan(without.success);
  });
});

/** The supply points the party needs with no threats in play. */
function launchNeed(save: SaveData, dungeon: DungeonDef, heroIds: string[]) {
  return launchPlan(save, dungeon, heroIds, {}, { threats: [], restriction: null, opportunity: null }).need;
}

describe('every relic', () => {
  it.each(Object.keys(relicById))('%s reaches its wearer with every effect', (relicId) => {
    const relic = relicById[relicId];
    const member = relicMember(relicId);
    const own = relic.effects.filter((effect) => effect.kind !== 'keyword');
    expect((member.relicEffects ?? []).map((worn) => worn.effect)).toEqual(own);
    for (const effect of relic.effects) {
      if (effect.kind !== 'keyword') continue;
      const entry = member.gearKeywords.find((k) => k.keyword === effect.keyword && (effect.when ? k.when === effect.when : !k.when));
      expect(entry).toBeDefined();
      // A situational keyword never answers a threat; a plain one does.
      const answered = heroAnswers(answersMemberOf(member)).keywords.some((k) => k.keyword === effect.keyword);
      if (!effect.when) expect(answered).toBe(true);
    }
  });
});
