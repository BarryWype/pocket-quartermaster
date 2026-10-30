import { expeditionRules } from '@/content/dungeons';
import { patrolThreats, restrictionRules, threatRules } from '@/content/threats';
import { travellerRules } from '@/content/patrols';
import { newHero } from '@/content/heroes';
import { dungeonById, itemById } from '@/content/lookup';

import { applyOverrides, dailyRotation, rotationDay } from '../dungeons/rotation';
import { launchPlan, resolveExpedition, startExpedition, type Loadout } from '../expeditions/expeditions';
import { prepareParty, simulateRun, type PartyMember, type RunOptions } from '../expeditions/simulate';
import { patrolDungeon, patrolRunOptions } from '../patrols/fight';
import { findSpawn, tierTeam } from '../patrols/testHelpers';
import { createInitialSave, type SaveData } from '../save';
import { healAll } from '../team/health';
import { equip } from '../team/team';
import type { Briefing, ConsumableDef, DungeonDef, EncounterDef, MobGroup, OpportunityId, RestrictionId, ThreatId } from '../types';

/** No first win of the day or first tier clear on top, so a run pays its own row only. */
const noBonusRows = (save: SaveData): SaveData => ({
  ...save,
  firstWinDay: rotationDay(0),
  clearedDungeons: [...new Set([...save.clearedDungeons, 'ratCellar'])],
});

// The threats rework wired into the run: what each briefing does to a party
// through simulateRun, launchPlan and resolveExpedition.
//
// State math to keep in mind: a threat one short of its answer is 'half' (every
// number halved), two or more short is 'full'. A plain warrior party answers
// nothing (Might 3 aside), so keyword threats at level 1 are half-missed.

const ALL = ['bram', 'lyra', 'mira'];
const steady = { ...expeditionRules, mishapChance: 0, fortune: 0, damageVariance: 0, enemyCritChance: 0 };
/** No threats, just the restriction or opportunity under test. */
const briefing = (extra: Partial<Briefing> = {}): Briefing => ({ threats: [], restriction: null, opportunity: null, ...extra });
const threat = (id: ThreatId, level: 1 | 2 | 3 = 1, element?: Briefing['threats'][number]['element']): Briefing => ({
  threats: [{ id, level, ...(element ? { element } : {}) }],
  restriction: null,
  opportunity: null,
});

function member(heroId: string, abilities: PartyMember['abilities'] = [], overrides: Partial<PartyMember> = {}): PartyMember {
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
    abilities,
    consumable: null,
    ...overrides,
  };
}

/** A dungeon whose every step is the same encounter, so what the briefing does always has something to bite. */
const pool = (
  encounters: EncounterDef[],
  count: [number, number] = [4, 4],
  boss: Partial<DungeonDef['boss']> = {},
): DungeonDef => ({
  ...dungeonById.ratCellar,
  encounterCount: count,
  encounters,
  boss: { id: 'testBoss', name: 'test boss', hp: 40, damage: 4, damageType: 'power', speed: 5, tags: [], ...boss },
});
const fight = (mobs: MobGroup[] = [{ mobId: 'wolfPup', count: 2 }]): EncounterDef => ({ type: 'fight', weight: 1, mobs });
const trap = (): EncounterDef => ({ type: 'trap', weight: 1, name: 'test trap', targets: 'all' });
const fights = pool([fight()]);
/** The boss on its own. */
const bossOnly = (boss: Partial<DungeonDef['boss']>, count: [number, number] = [1, 1]) => pool([], count, boss);

describe('run penalties', () => {
  it('expose the first fights: the enemies strike first, and it shows in the results', () => {
    // Watchful 0 against level 2 (needs 2): a full miss, the first two fights exposed.
    const run = simulateRun([member('a', [], { maxHp: 1e6, power: 1000 })], fights, 's', {
      rules: steady,
      briefing: threat('ambush', 2),
    });
    expect(run.threats[0]).toMatchObject({ threat: { id: 'ambush' }, state: 'full' });
    expect(run.encounters[0].effects).toContainEqual({ heroId: null, key: 'exposed' });
    expect(run.encounters[1].effects).toContainEqual({ heroId: null, key: 'exposed' });
    expect(run.encounters[2].effects).not.toContainEqual({ heroId: null, key: 'exposed' });
  });

  it('expose every other fight when "all" is halved by a half miss', () => {
    // Darkness level 3 exposes every fight; two light holders halve that to every other one.
    const carriers = [member('a', [], { classId: 'fireMage', maxHp: 1e6, power: 1000 }), member('b', [], { classId: 'fireMage', maxHp: 1e6, power: 1000 })];
    const runs = Array.from({ length: 8 }, (_, i) =>
      simulateRun(carriers, fights, `d${i}`, { rules: steady, briefing: threat('darkness', 3) }),
    );
    runs.forEach((run) => {
      expect(run.threats[0].state).toBe('half');
      run.encounters.forEach((encounter, i) => {
        expect(encounter.effects.some((e) => e.key === 'exposed')).toBe(i % 2 === 0);
      });
    });
  });

  it('weaken the party when missed', () => {
    const strong = [member('a', [], { maxHp: 1e6, power: 20 })];
    const none = simulateRun(strong, fights, 's', { rules: steady });
    // Wits 1 against level 1 (needs 2): a half miss, ×0.925 damage.
    const weakened = simulateRun(strong, fights, 's', { rules: steady, briefing: threat('underwater', 1) });
    expect(weakened.threats[0].state).toBe('half');
    // The 40 HP boss takes 2 rounds at 20 damage, 3 at 18.5.
    expect(weakened.encounters.at(-1)!.rounds).toBeGreaterThan(none.encounters.at(-1)!.rounds);
  });

  it('poison everyone after each fight, and it shows in the results', () => {
    // No antidote in the party: level 1 is half-missed at 7.5% of max HP per fight.
    const hero = [member('a', [], { maxHp: 1000, power: 1000 })];
    const plain = simulateRun(hero, fights, 's', { rules: steady });
    const poisoned = simulateRun(hero, fights, 's', { rules: steady, briefing: threat('poison', 1) });
    expect(poisoned.encounters[0].effects).toContainEqual({ heroId: null, key: 'poison' });
    // The same fight otherwise: exactly the poison's 7.5% of max HP extra.
    expect(poisoned.encounters[0].taken.a - plain.encounters[0].taken.a).toBeCloseTo(75);
  });

  it('let enemy casters wound one hero before each fight', () => {
    const run = simulateRun(
      [member('a', [], { maxHp: 1000, power: 1000 }), member('b', [], { maxHp: 1000, power: 1000 })],
      fights,
      's',
      { rules: steady, briefing: threat('casters', 2) },
    );
    expect(run.encounters[0].effects.some((e) => e.key === 'casters')).toBe(true);
  });

  it('make the brute hit harder on the boss', () => {
    const dungeon = bossOnly({ hp: 5000, damage: 4 });
    const run = (briefingOf?: Briefing) =>
      simulateRun([member('a', [], { maxHp: 1e6, power: 1000 })], dungeon, 's', { rules: steady, ...(briefingOf ? { briefing: briefingOf } : {}) });
    expect(run(threat('brute', 2)).encounters[0].taken.a).toBeGreaterThan(run().encounters[0].taken.a);
  });

  it('beef up undead enemies when missed', () => {
    const dungeon = bossOnly({ hp: 100, damage: 0, tags: ['undead'] });
    const run = (briefingOf: Briefing) =>
      simulateRun([member('a', [], { maxHp: 1e6, power: 25 })], dungeon, 's', { rules: steady, briefing: briefingOf });
    // Blessed 0 against level 1 (needs 1): half-missed, +35% HP: 6 rounds instead of 4.
    expect(run(threat('undead', 1)).encounters[0].rounds).toBe(run(briefing()).encounters[0].rounds + 2);
  });

  it('report lost loot and delay from missed threats', () => {
    // Finesse 1 and Might 3 both fall short of level 3 Locked (needs 4): a full miss.
    const locked = simulateRun([member('a', [], { maxHp: 1e6, power: 1000 })], fights, 's', { rules: steady, briefing: threat('locked', 3) });
    expect(locked.threats[0].state).toBe('full');
    expect(locked.lostLoot).toBeCloseTo(0.4);
    expect(locked.delay).toBe(0);
    // Wits 1 against level 2 Puzzle (needs 3): a full miss, 30% longer.
    const puzzled = simulateRun([member('a', [], { maxHp: 1e6, power: 1000 })], fights, 's', { rules: steady, briefing: threat('puzzle', 2) });
    expect(puzzled.delay).toBeCloseTo(0.3);
  });
});

describe('run restrictions', () => {
  it('antiMagic: halves the magic part of damage and party heals', () => {
    const mage = member('a', [], { classId: 'fireMage', maxHp: 1e6, magic: 12, damageStat: 'magic' });
    const options = (restriction: RestrictionId | null): RunOptions => ({ rules: steady, briefing: briefing({ restriction }) });
    expect(simulateRun([mage], fights, 's', options(null)).encounters[0].rounds).toBeLessThan(
      simulateRun([mage], fights, 's', options('antiMagic')).encounters[0].rounds,
    );
    // A healer under the zone tends the party at half strength.
    const healer = member('h', [{ kind: 'partyHeal', pct: 0.1 }], { maxHp: 100 });
    const trapRun = (restriction: RestrictionId | null) =>
      simulateRun([healer], pool([trap()], [2, 2]), 's', {
        rules: steady,
        briefing: { threats: [{ id: 'traps', level: 3 }], restriction, opportunity: null },
      });
    expect(trapRun('antiMagic').encounters[0].healed.h).toBeCloseTo(trapRun(null).encounters[0].healed.h * restrictionRules.antiMagic);
  });

  it('sacredGround: dulls gear it can see; Concealed gear is untouched', () => {
    // A sword, or a dagger with a shield, is not Concealed.
    const sword = member('a', [], { concealed: false, maxHp: 1e6, power: 20 });
    const shielded = member('ds', [], { concealed: false, maxHp: 1e6, power: 20 });
    const options = (restriction: RestrictionId | null): RunOptions => ({ rules: steady, briefing: briefing({ restriction }) });
    for (const exposed of [sword, shielded]) {
      expect(simulateRun([exposed], fights, 's', options('sacredGround')).encounters[0].rounds).toBeGreaterThan(
        simulateRun([exposed], fights, 's', options(null)).encounters[0].rounds,
      );
    }
    // A dagger with a parrying dagger, or an unarmed hero, fights the same fight as without the restriction.
    for (const concealed of [
      member('d', [], { concealed: true, maxHp: 1e6, power: 20 }),
      member('u', [], { concealed: true, maxHp: 1e6, power: 20 }),
    ]) {
      const { signed: _with, ...withRestriction } = simulateRun([concealed], fights, 's', options('sacredGround'));
      const { signed: _without, ...without } = simulateRun([concealed], fights, 's', options(null));
      expect(withRestriction).toEqual(without);
    }
  });

  it('underwater weakened: counts double for heavy wearers', () => {
    // A boss they cannot kill, so the damage dealt tracks the multiplier alone.
    const meatShield = bossOnly({ hp: 1e9 });
    const options = { rules: steady, briefing: threat('underwater', 3) };
    const dealt = (party: PartyMember[]) =>
      simulateRun(party, meatShield, 's', options).encounters.reduce(
        (sum, e) => sum + Object.values(e.dealt).reduce((a, b) => a + b, 0),
        0,
      );
    const light = member('l', [], { maxHp: 1e6, power: 20 });
    const heavy = member('h', [], { heavy: true, maxHp: 1e6, power: 20 });
    // Level 3 weakened is 0.32; the heavy wearer takes it doubled, to 0.64.
    expect(dealt([heavy])).toBeCloseTo((dealt([light]) * (1 - 0.64)) / (1 - 0.32));
  });

  it('noHealing: halves every heal in the run', () => {
    const potion = itemById.healingPotion as ConsumableDef;
    const party = [member('a', [], { consumable: potion, maxHp: 1000, power: 1000 })];
    const run = (restriction: RestrictionId | null) =>
      simulateRun(party, pool([trap()], [4, 4]), 's', { rules: steady, briefing: { ...threat('traps', 3), restriction } });
    const healed = (restriction: RestrictionId | null) =>
      run(restriction).encounters.flatMap((e) => Object.values(e.healed)).reduce((a, b) => a + b, 0);
    expect(healed('noHealing')).toBeCloseTo(healed(null) * restrictionRules.noHealing, 0);
  });

  it('cursedLuck: no critical hits', () => {
    const lucky = [member('a', [{ kind: 'critBonus', chance: 0.05 }], { maxHp: 1e6, power: 10, crit: 100 })];
    const dungeon = bossOnly({ hp: 40, damage: 4 });
    const options = (restriction: RestrictionId | null): RunOptions => ({ rules: steady, briefing: briefing({ restriction }) });
    const plain = simulateRun(lucky, dungeon, 's', options(null));
    const cursed = simulateRun(lucky, dungeon, 's', options('cursedLuck'));
    expect(plain.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'crit' });
    expect(cursed.encounters[0].effects).not.toContainEqual({ heroId: 'a', key: 'crit' });
    // Without the crits the fight drags on: 4 rounds instead of 3.
    expect(cursed.encounters[0].rounds).toBeGreaterThan(plain.encounters[0].rounds);
  });

  it('thickFog: only a kit answers an ambush', () => {
    const ranger = member('r', [], { classId: 'ranger' });
    const fog: Briefing = { ...threat('ambush', 1), restriction: 'thickFog' };
    const watchful = simulateRun([ranger], fights, 's', { rules: steady, briefing: fog });
    expect(watchful.threats[0]).toMatchObject({ state: 'half', have: 0, needed: 1 });
    const lit = simulateRun([{ ...ranger, consumable: itemById.lantern as ConsumableDef }], fights, 's', { rules: steady, briefing: fog });
    expect(lit.threats[0]).toMatchObject({ state: 'met' });
  });

  it('narrowPassages: one hero fewer than the usual party, unless a Curse-breaker goes', () => {
    const base = geared();
    const breaker = { ...newHero('cb', 'Breaker', 'curseBreaker', 'none', 30) };
    const save = { ...base, heroes: [...base.heroes, breaker] };
    const rotation = forcedRotation('ratCellar', briefing({ restriction: 'narrowPassages' }));
    expect(() => startExpedition(save, 'ratCellar', ['bram', 'lyra'], 0, 1, rotation)).not.toThrow();
    expect(() => startExpedition(save, 'ratCellar', ALL, 0, 1, rotation)).toThrow(/At most 2 heroes fit the narrow passages/);
    expect(() => startExpedition(save, 'ratCellar', ['bram', 'lyra', 'cb'], 0, 1, rotation)).not.toThrow();
  });

  it('spoiledStores: the meal is eaten but does nothing', () => {
    const save = geared({ quickBites: 1 });
    const spoiled = briefing({ restriction: 'spoiledStores' });
    const plan = launchPlan(save, dungeonById.ratCellar, ALL, { mealId: 'quickBites' }, spoiled);
    expect(plan.minutes).toBe(dungeonById.ratCellar.durationMinutes);
    const started = startExpedition(save, 'ratCellar', ALL, 0, 1, forcedRotation('ratCellar', spoiled), { mealId: 'quickBites' });
    expect(started.consumables.quickBites).toBe(0);
    expect(started.expeditions[0].mealId).toBe('quickBites');
    // The quick bites did not shorten the run.
    expect(started.expeditions[0].endsAt).toBe(dungeonById.ratCellar.durationMinutes * 60_000);
  });
});

describe('opportunities', () => {
  const springs = pool([{ type: 'event', weight: 1, eventId: 'spring' }]);
  const run = (opportunity: OpportunityId, party: PartyMember[], options: Partial<RunOptions> = {}) =>
    simulateRun(party, springs, 's', { rules: steady, briefing: briefing({ opportunity }), ...options });

  it('healingSpring: free, heals every conscious hero at the midpoint', () => {
    const hurt = [member('a', [], { hp: 40, power: 1000 })];
    const result = run('healingSpring', hurt);
    expect(result.opportunity).toMatchObject({ id: 'healingSpring', answered: true });
    // The heal landed on the midpoint encounter: 30% of max HP.
    expect(result.encounters.flatMap((e) => Object.values(e.healed)).reduce((a, b) => a + b, 0)).toBeCloseTo(30);
  });

  it('hiddenCache: pays a share of the top gold, doubled by the Thief\'s cache bonus, and nothing when missed', () => {
    const thief = run('hiddenCache', [member('a', [], { classId: 'thief', power: 1000 })]);
    expect(thief.opportunity).toMatchObject({ id: 'hiddenCache', answered: true, gold: Math.round(0.25 * dungeonById.ratCellar.gold[1]) });
    expect(thief.bonusGold).toBe(thief.opportunity?.gold);
    const finder = run('hiddenCache', [member('a', [{ kind: 'cacheBonus', multiplier: 2 }], { classId: 'thief', power: 1000 })]);
    expect(finder.opportunity?.gold).toBe(Math.round(0.25 * dungeonById.ratCellar.gold[1] * 2));
    const clumsy = run('hiddenCache', [member('a', [], { classId: 'fireMage', power: 1000 })]);
    expect(clumsy.opportunity).toMatchObject({ id: 'hiddenCache', answered: false });
    expect(clumsy.bonusGold).toBe(0);
  });

  it('richVein: gives the tier\'s ore', () => {
    const result = run('richVein', [member('a', [], { power: 1000 })]);
    expect(result.opportunity).toMatchObject({ id: 'richVein', answered: true, materials: [{ materialId: 'wood', amount: 4 }] });
  });

  it('bounty: multiplies the dungeon\'s rolled gold', () => {
    expect(run('bounty', [member('a', [], { classId: 'troubadour', power: 1000 })]).opportunity).toMatchObject({
      id: 'bounty',
      answered: true,
      goldMultiplier: 1.3,
    });
  });

  it('prisoners: pay their share of the top gold, and sometimes join the roster', () => {
    const save = geared();
    const rotation = forcedRotation('ratCellar', briefing({ opportunity: 'prisoners' }));
    let recruit = false;
    let gold = 0;
    for (let i = 0; i < 60 && !recruit; i++) {
      const started = startExpedition({ ...save, nextUid: i }, 'ratCellar', ALL, 0, 1, rotation);
      const { report, save: next } = resolveExpedition(started, started.expeditions[0]);
      expect(report.opportunity).toMatchObject({ id: 'prisoners', answered: true });
      gold = report.opportunity?.gold ?? 0;
      if (report.opportunity?.recruit) {
        recruit = true;
        expect(next.heroes).toHaveLength(save.heroes.length + 1);
        expect(next.heroes.at(-1)!.level).toBeGreaterThan(0);
      }
    }
    expect(gold).toBe(Math.round(0.2 * dungeonById.ratCellar.gold[1]));
    expect(recruit).toBe(true);
  });

  it('refugees: only an opted-in party helps, paying the supply up front', () => {
    const save = geared();
    const refugees = briefing({ opportunity: 'refugees' });
    const plain = launchPlan(save, dungeonById.ratCellar, ALL, {}, refugees);
    const optedIn = launchPlan(save, dungeonById.ratCellar, ALL, { optIn: true }, refugees);
    expect(optedIn.need).toBe(plain.need + travellerRules.pilgrimSupplyPoints);
    expect(run('refugees', [member('a', [], { power: 1000 })]).opportunity).toMatchObject({ id: 'refugees', answered: false });
    const helped = run('refugees', [member('a', [], { power: 1000 })], { optIn: true });
    expect(helped.opportunity?.answered).toBe(true);
    expect(['blessing', 'gold', 'keyFragment']).toContain(helped.opportunity?.pilgrim);
  });

  it('forgottenShrine: steels the party for the rest of the run', () => {
    const result = run('forgottenShrine', [member('a', [], { classId: 'cleric', power: 1000 })]);
    expect(result.opportunity).toMatchObject({ id: 'forgottenShrine', answered: true, damageMultiplier: 1.1 });
  });

  it('oldInscriptions: teach XP, and sometimes an unknown Provisions recipe', () => {
    const save = noBonusRows(geared());
    const rotation = forcedRotation('ratCellar', briefing({ opportunity: 'oldInscriptions' }));
    let taught = 0;
    let xp = 0;
    for (let i = 0; i < 40; i++) {
      const started = startExpedition({ ...save, nextUid: 100 + i }, 'ratCellar', ALL, 0, 1, rotation);
      const { report, save: next } = resolveExpedition(started, started.expeditions[0]);
      expect(report.opportunity).toMatchObject({ id: 'oldInscriptions', answered: true, xpMultiplier: 1.25 });
      xp = report.xp;
      if (report.opportunity?.recipe) {
        taught++;
        // The opportunity's Provisions recipe is one more than the run's other teaching.
        expect(next.knownRecipes.length).toBe(
          save.knownRecipes.length + 1 + new Set(report.loot.recipeIds).size,
        );
      }
    }
    expect(taught).toBeGreaterThan(0);
    expect(xp).toBe(Math.round(dungeonById.ratCellar.xp * 1.25));
  });

  it('trophyBeast: gives hide and bone for a calm hand', () => {
    const druid = member('a', [], { classId: 'druid', power: 1000 });
    const result = run('trophyBeast', [druid]);
    expect(result.opportunity?.answered).toBe(true);
    const materials = result.opportunity?.materials ?? [];
    const hide = materials.find((m) => m.materialId === 'hide')!;
    expect(hide.amount).toBeGreaterThanOrEqual(2);
    expect(hide.amount).toBeLessThanOrEqual(3);
    expect(materials.find((m) => m.materialId === 'bone')!.amount).toBe(2);
  });

  it('trophyBeast: needs a calm hand or a strong arm, and costs nothing when missed', () => {
    const result = run('trophyBeast', [member('a', [], { classId: 'fireMage', power: 1000 })]);
    expect(result.opportunity).toMatchObject({ id: 'trophyBeast', answered: false });
    expect(result.opportunity?.materials).toBeUndefined();
  });
});

describe('salvage and consumables', () => {
  /** A veterans' run through the Rat Cellar: one expedition, resolved through the game. */
  const resolve = (save: SaveData, loadout: Loadout = {}, briefingOf: Briefing | null = null, dungeonId = 'ratCellar') => {
    const rotation = briefingOf ? forcedRotation(dungeonId, briefingOf) : undefined;
    const started = startExpedition(save, dungeonId, ALL, 0, 1, rotation, loadout);
    return resolveExpedition(started, started.expeditions[0]);
  };

  it('uses up every equipped consumable: gone from the slot, never back to the stock', () => {
    let save = geared({ healingPotion: 1, standardHealingPotion: 2 });
    save = equip(save, 'bram', 'consumable', 'healingPotion');
    save = equip(save, 'mira', 'consumable', 'standardHealingPotion');
    const { save: after, report } = resolve(save);
    for (const id of ALL) expect(after.heroes.find((h) => h.id === id)!.equipment.consumable).toBeNull();
    expect(report.consumablesUsed.sort()).toEqual(['healingPotion', 'standardHealingPotion'].sort());
    // Veterans rarely need a potion in tier 1: both come back as salvage, not to the stock.
    expect(after.consumables.healingPotion).toBe(0);
    expect(report.salvaged.map((s) => s.itemId)).toContain('healingPotion');
    expect(report.salvaged.map((s) => s.itemId)).toContain('standardHealingPotion');
  });

  it('salvages an undrunk standard or greater healing potion', () => {
    for (const itemId of ['standardHealingPotion', 'greaterHealingPotion']) {
      let save = geared({ [itemId]: 1 });
      save = equip(save, 'bram', 'consumable', itemId);
      const { report } = resolve(save);
      expect(report.salvaged.map((s) => s.itemId)).toContain(itemId);
    }
  });

  it('salvages an untriggered kit into half its recipe, and adds it to the stock', () => {
    let save = geared({ roguesRoll: 1 });
    save = equip(save, 'bram', 'consumable', 'roguesRoll');
    const { save: after, report } = resolve(save);
    const roll = report.salvaged.find((s) => s.itemId === 'roguesRoll');
    // The Rogue's roll is bone 2, hide 1: half is one bone.
    expect(roll).toMatchObject({ heroId: 'bram', itemId: 'roguesRoll', materials: [{ materialId: 'bone', amount: 1 }], gold: 0 });
    expect((after.materials.bone ?? 0) - (save.materials.bone ?? 0)).toBe(1);
  });

  it('keeps a kit that answered a drawn threat', () => {
    let save = geared({ roguesRoll: 1 });
    save = equip(save, 'bram', 'consumable', 'roguesRoll');
    // Finesse 1 + the kit's 2 meets level 2 traps (needs 3): the roll did its job.
    const { report } = resolve(save, {}, threat('traps', 2));
    expect(report.threats[0]).toMatchObject({ id: 'traps', state: 'met' });
    expect(report.salvaged.map((s) => s.itemId)).not.toContain('roguesRoll');
  });

  it('keeps a ward salve that faced its element', () => {
    const briefingOf = threat('element', 1, 'fire');
    let save = geared({ emberWardSalve: 1 });
    save = equip(save, 'bram', 'consumable', 'emberWardSalve');
    // Bram alone: his salve is the party's only Resist fire, so it answers the threat.
    const started = startExpedition(save, 'ratCellar', ['bram'], 0, 1, forcedRotation('ratCellar', briefingOf));
    const { report } = resolveExpedition(started, started.expeditions[0]);
    expect(report.briefing).toEqual(briefingOf);
    expect(report.threats[0]).toMatchObject({ id: 'element', element: 'fire', state: 'met' });
    expect(report.salvaged.map((s) => s.itemId)).not.toContain('emberWardSalve');
    // Without the salve the threat is half-missed; with it met (see threats/score.test.ts).
    const bareStart = startExpedition(geared(), 'ratCellar', ['bram'], 0, 1, forcedRotation('ratCellar', briefingOf));
    expect(resolveExpedition(bareStart, bareStart.expeditions[0]).report.threats[0]).toMatchObject({ state: 'half' });
  });

  it('keeps a ward salve whose carrier took damage of its element, even when it answered nothing', () => {
    // Mira already resists fire, so Bram's salve changes no threat's result;
    // facing the fire itself still uses it up.
    const briefingOf = threat('element', 1, 'fire');
    let kept = 0;
    for (let i = 0; i < 10; i++) {
      let save: SaveData = {
        ...createInitialSave(),
        tutorial: { ...createInitialSave().tutorial, step: 'done' },
        consumables: { ...createInitialSave().consumables, emberWardSalve: 1, trailMix: 30 },
        nextUid: 400 + i,
      };
      save = equip(save, 'bram', 'consumable', 'emberWardSalve');
      const started = startExpedition(save, 'ratCellar', ['bram', 'mira'], 0, 1, forcedRotation('ratCellar', briefingOf));
      const { report } = resolveExpedition(started, started.expeditions[0]);
      expect(report.threats[0]).toMatchObject({ id: 'element', element: 'fire', state: 'met' });
      if (!report.salvaged.map((s) => s.itemId).includes('emberWardSalve')) kept++;
    }
    expect(kept).toBeGreaterThan(0);
  });

  it('salvages a ward salve that never faced its element', () => {
    let save = geared({ emberWardSalve: 1 });
    save = equip(save, 'bram', 'consumable', 'emberWardSalve');
    const { report } = resolve(save);
    // The Ember ward salve is iron 1, fire shard 1, herb 1: halves round down, the main input at least 1.
    expect(report.salvaged).toContainEqual({
      heroId: 'bram',
      itemId: 'emberWardSalve',
      materials: [{ materialId: 'iron', amount: 1 }],
      gold: 0,
    });
  });
});

describe('locked forced with Might', () => {
  it('cuts only the rolled gold, and nothing else', () => {
    const save = noBonusRows(healAll(geared()));
    let cut = 0;
    // Warriors have Might 3: level 2 Locked (needs 3, Finesse falls short) is forced open, at the cost of some loot.
    const rotation = forcedRotation('ratCellar', threat('locked', 2));
    for (let i = 0; i < 30; i++) {
      const forcedStart = startExpedition({ ...save, nextUid: 200 + i }, 'ratCellar', ALL, 0, 1, rotation);
      const forced = resolveExpedition(forcedStart, forcedStart.expeditions[0]).report;
      const plainStart = startExpedition({ ...save, nextUid: 200 + i }, 'ratCellar', ALL, 0, 1);
      const plain = resolveExpedition(plainStart, plainStart.expeditions[0]).report;
      expect(forced.threats[0]).toMatchObject({ id: 'locked', state: 'met', forced: true });
      expect(forced.success).toBe(plain.success);
      // The same loot rolls either way: only the dungeon's rolled gold is cut.
      expect(forced.loot.dropped).toEqual(plain.loot.dropped);
      expect(forced.xp).toBe(plain.xp);
      expect(forced.loot.recipeIds).toEqual(plain.loot.recipeIds);
      expect(forced.loot.gear).toEqual(plain.loot.gear);
      expect(forced.gold).toBeLessThanOrEqual(plain.gold);
      if (forced.gold < plain.gold) cut++;
      // The forced loss takes its share of the rolled gold, never more than the whole.
      expect(plain.gold - forced.gold).toBeLessThanOrEqual(1 + threatRules.forcedLockLoss * plain.gold);
    }
    expect(cut).toBeGreaterThan(0);
  });
});

describe('patrol threats', () => {
  it('each patrol kind carries its threat in its briefing', () => {
    expect(patrolRunOptions('goblins').briefing).toEqual({ threats: [patrolThreats.goblins], restriction: null, opportunity: null });
    expect(patrolRunOptions('herd').briefing).toEqual({ threats: [patrolThreats.herd], restriction: null, opportunity: null });
    expect(patrolRunOptions('bandits').briefing).toEqual({ threats: [patrolThreats.bandits], restriction: null, opportunity: null });
  });

  it('ambush half-exposes the goblins\' first fight, and the odds include it', () => {
    const save = tierTeam();
    // Bram alone has no Watchful: the level 1 ambush is half-missed.
    const party = prepareParty(save, ['bram']);
    const { spawn } = findSpawn((s) => s.kind === 'goblins' && s.tierRoll === 'current');
    // Elites, so the fights can be lost and the exposure shows in the odds.
    const dungeon = patrolDungeon(spawn, 1, true);
    const runs = Array.from({ length: 10 }, (_, i) => simulateRun(party, dungeon, `s${i}`, patrolRunOptions('goblins')));
    runs.forEach((run) => expect(run.threats[0]).toMatchObject({ threat: { id: 'ambush' }, state: 'half' }));
    // Half of the first fights are exposed: the enemies strike first.
    const exposed = runs.filter((run) => run.encounters[0].effects.some((e) => e.key === 'exposed')).length;
    expect(exposed).toBeGreaterThan(0);
    expect(exposed).toBeLessThan(10);
    // The odds the party and the escort see run the same seeds with the same briefing.
    const oddsSeeds = Array.from({ length: 30 }, (_, i) =>
      simulateRun(party, dungeon, `odds|${dungeon.id}|${i}`, patrolRunOptions('goblins')),
    );
    expect(oddsSeeds.some((run) => run.encounters[0].effects.some((e) => e.key === 'exposed'))).toBe(true);
  });

  it('beasts make the herd\'s mobs hit harder', () => {
    const save = tierTeam();
    const party = prepareParty(save, ['bram']);
    const { spawn } = findSpawn((s) => s.kind === 'herd' && s.tierRoll === 'current');
    const dungeon = patrolDungeon(spawn, 1, true);
    const withThreat = simulateRun(party, dungeon, 's', patrolRunOptions('herd'));
    const without = simulateRun(party, dungeon, 's', { rules: { ...expeditionRules, mishapChance: 0 } });
    expect(withThreat.threats[0]).toMatchObject({ threat: { id: 'beasts' }, state: 'half' });
    expect(withThreat.encounters[0].taken.bram).toBeGreaterThan(without.encounters[0].taken.bram);
  });

  it('thieves\' lost loot costs the run, but never the patrol\'s rewards', () => {
    const save = tierTeam();
    // Bram alone: Finesse 1 half-misses the level 1 thieves.
    const party = prepareParty(save, ['bram']);
    const { spawn } = findSpawn((s) => s.kind === 'bandits' && s.tierRoll === 'current');
    const dungeon = patrolDungeon(spawn, 1, false);
    const run = simulateRun(party, dungeon, 's', patrolRunOptions('bandits'));
    expect(run.threats[0]).toMatchObject({ threat: { id: 'thieves' }, state: 'half' });
    expect(run.lostLoot).toBeCloseTo(0.05);
  });
});

/** A tutorial-free save with tier-5 gear and veterans who clear tier 1, and a stocked kitchen. */
function geared(consumables: Record<string, number> = {}): SaveData {
  let save: SaveData = {
    ...createInitialSave(),
    tutorial: { ...createInitialSave().tutorial, step: 'done' },
    consumables: { ...createInitialSave().consumables, trailMix: 30, ...consumables },
    heroes: createInitialSave().heroes.map((h) => ({ ...h, level: 30 })),
    gear: [
      { uid: 'g1', itemId: 'sword5', quality: 'normal' },
      { uid: 'g2', itemId: 'bow5', quality: 'normal' },
      { uid: 'g3', itemId: 'wand5', quality: 'normal' },
    ],
    nextUid: 10,
  };
  save = equip(save, 'bram', 'weapon', 'g1');
  save = equip(save, 'lyra', 'weapon', 'g2');
  save = equip(save, 'mira', 'weapon', 'g3');
  return save;
}

/** A rotation with a debug-forced briefing on `dungeonId`, and the dungeon forced open in its slot. */
function forcedRotation(dungeonId: string, briefingOf: Briefing) {
  const dungeon = dungeonById[dungeonId];
  return applyOverrides(dailyRotation(rotationDay(0)), {
    ...(dungeon.slot ? { slots: { [`${dungeon.tier}:${dungeon.slot}`]: dungeonId } } : {}),
    briefings: { [dungeonId]: briefingOf },
  });
}
