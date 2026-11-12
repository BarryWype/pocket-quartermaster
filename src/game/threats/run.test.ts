import { expeditionRules } from '@/content/dungeons';
import { patrolThreat, restrictionRules } from '@/content/threats';
import { travellerRules } from '@/content/patrols';
import { newHero } from '@/content/heroes';
import { dungeonById, itemById } from '@/content/lookup';

import { applyOverrides, dailyRotation, rotationDay } from '../dungeons/rotation';
import { launchPlan, resolveExpedition, startExpedition, type Loadout } from '../expeditions/expeditions';
import { prepareParty, simulateRun, type PartyMember, type RunOptions } from '../expeditions/simulate';
import { patrolDungeon, patrolRunOptions } from '../patrols/fight';
import { findSpawn, tierTeam } from '../patrols/testHelpers';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import type { FamilyId } from '@/content/families';
import type { HeroFamilyTag } from '../families/families';
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
// State math to keep in mind: a threat is met when the party's family level
// reaches its level, half (every number halved) when one short, full (all of
// it) when two or more short. A party with no family tags of the threat's
// family half-misses level 1 and fully misses level 2 and 3.

const ALL = ['bram', 'lyra', 'mira'];
const steady = { ...expeditionRules, mishapChance: 0, fortune: 0, damageVariance: 0, enemyCritChance: 0 };
/** No threats, just the restriction or opportunity under test. */
const briefing = (extra: Partial<Briefing> = {}): Briefing => ({ threats: [], restriction: null, opportunity: null, ...extra });
const threat = (id: ThreatId, level: 1 | 2 | 3 = 1, element?: Briefing['threats'][number]['element']): Briefing => ({
  threats: [{ id, level, ...(element ? { element } : {}) }],
  restriction: null,
  opportunity: null,
});

/** A family tag fixture, as heroFamilyTagSources would have built it. */
const familyTag = (family: FamilyId, count = 1, overrides: Partial<HeroFamilyTag> = {}): HeroFamilyTag => ({
  family,
  count,
  source: 'class',
  ...overrides,
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
    familyTags: [],
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
const trap = (): EncounterDef => ({ type: 'trap', weight: 1, name: 'test trap' });
const fights = pool([fight()]);
/** The boss on its own. */
const bossOnly = (boss: Partial<DungeonDef['boss']>, count: [number, number] = [1, 1]) => pool([], count, boss);

describe('run penalties', () => {
  it('expose the first fights: the enemies strike first, and it shows in the results', () => {
    // No Watch tags against level 2 (needs 2 tags): a full miss, the first three fights exposed.
    const run = simulateRun([member('a', [], { maxHp: 1e6, power: 1000 })], fights, 's', {
      rules: steady,
      briefing: threat('darkness', 2),
    });
    expect(run.threats[0]).toMatchObject({ threat: { id: 'darkness' }, state: 'full' });
    expect(run.encounters[0].effects).toContainEqual({ heroId: null, key: 'exposed' });
    expect(run.encounters[2].effects).toContainEqual({ heroId: null, key: 'exposed' });
    expect(run.encounters[3].effects).not.toContainEqual({ heroId: null, key: 'exposed' });
  });

  it('expose every other fight when "all" is halved by a half miss', () => {
    // Darkness level 3 exposes every fight; two Watch tags (one short) halve that to every other one.
    const watcher = [member('a', [], { maxHp: 1e6, power: 1000, familyTags: [familyTag('watch', 2)] })];
    const runs = Array.from({ length: 8 }, (_, i) =>
      simulateRun(watcher, fights, `d${i}`, { rules: steady, briefing: threat('darkness', 3) }),
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
    // No Watch tags against level 2 (needs family level 2): a full miss, ×0.65 damage.
    const weakened = simulateRun(strong, fights, 's', { rules: steady, briefing: threat('darkness', 2) });
    expect(weakened.threats[0].state).toBe('full');
    // The 40 HP boss takes 2 rounds at 20 damage, 4 at 13.
    expect(weakened.encounters.at(-1)!.rounds).toBeGreaterThan(none.encounters.at(-1)!.rounds);
  });

  it('poison everyone after each fight, and it shows in the results', () => {
    // No Venom tags in the party: level 1 is half-missed at 20% of max HP per fight.
    const hero = [member('a', [], { maxHp: 1000, power: 1000 })];
    const plain = simulateRun(hero, fights, 's', { rules: steady });
    const poisoned = simulateRun(hero, fights, 's', { rules: steady, briefing: threat('poison', 1) });
    expect(poisoned.encounters[0].effects).toContainEqual({ heroId: null, key: 'poison' });
    // The same fight otherwise: exactly the poison's 20% of max HP extra.
    expect(poisoned.encounters[0].taken.a - plain.encounters[0].taken.a).toBeCloseTo(200);
  });

  it('make the party hit softer against any enemy when Armoured is missed', () => {
    const dungeon = bossOnly({ hp: 5000, damage: 4 });
    const run = (briefingOf?: Briefing) =>
      simulateRun([member('a', [], { maxHp: 1e6, power: 1000 })], dungeon, 's', { rules: steady, ...(briefingOf ? { briefing: briefingOf } : {}) });
    expect(run(threat('armoured', 2)).encounters[0].rounds).toBeGreaterThan(run().encounters[0].rounds);
  });

  it('beef up undead enemies when Holy is missed', () => {
    const dungeon = bossOnly({ hp: 100, damage: 0, tags: ['undead'] });
    const run = (briefingOf: Briefing) =>
      simulateRun([member('a', [], { maxHp: 1e6, power: 25 })], dungeon, 's', { rules: steady, briefing: briefingOf });
    // No Faith tags against level 1 (needs 2): half-missed, +35% HP: 6 rounds instead of 4.
    expect(run(threat('holy', 1)).encounters[0].rounds).toBe(run(briefing()).encounters[0].rounds + 2);
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
    const thief = run('hiddenCache', [member('a', [], { classId: 'thief', power: 1000, familyTags: [familyTag('cunning', 2)] })]);
    expect(thief.opportunity).toMatchObject({ id: 'hiddenCache', answered: true, gold: Math.round(0.25 * dungeonById.ratCellar.gold[1]) });
    expect(thief.bonusGold).toBe(thief.opportunity?.gold);
    const finder = run('hiddenCache', [member('a', [{ kind: 'cacheBonus', multiplier: 2 }], { classId: 'thief', power: 1000, familyTags: [familyTag('cunning', 2)] })]);
    expect(finder.opportunity?.gold).toBe(Math.round(0.25 * dungeonById.ratCellar.gold[1] * 2));
    const clumsy = run('hiddenCache', [member('a', [], { classId: 'fireMage', power: 1000 })]);
    expect(clumsy.opportunity).toMatchObject({ id: 'hiddenCache', answered: false });
    expect(clumsy.bonusGold).toBe(0);
  });

  it('richVein: gives the tier\'s ore', () => {
    const result = run('richVein', [member('a', [], { power: 1000, familyTags: [familyTag('breaker', 2)] })]);
    expect(result.opportunity).toMatchObject({ id: 'richVein', answered: true, materials: [{ materialId: 'wood', amount: 4 }] });
  });

  it('bounty: multiplies the dungeon\'s rolled gold', () => {
    expect(run('bounty', [member('a', [], { classId: 'troubadour', power: 1000, familyTags: [familyTag('rally', 2)] })]).opportunity).toMatchObject({
      id: 'bounty',
      answered: true,
      goldMultiplier: 1.3,
    });
  });

  it('prisoners: pay their share of the top gold, and sometimes join the roster', () => {
    const save = rallySave();
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
    const result = run('forgottenShrine', [member('a', [], { classId: 'cleric', power: 1000, familyTags: [familyTag('faith', 4)] })]);
    expect(result.opportunity).toMatchObject({ id: 'forgottenShrine', answered: true, damageMultiplier: 1.1 });
  });

  it('oldInscriptions: teach XP, and sometimes an unknown Provisions recipe', () => {
    const save = noBonusRows(watchSave());
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

  it('trophyBeast: gives hide and bone for a wild hand', () => {
    const druid = member('a', [], { classId: 'druid', power: 1000, familyTags: [familyTag('wild', 2)] });
    const result = run('trophyBeast', [druid]);
    expect(result.opportunity?.answered).toBe(true);
    const materials = result.opportunity?.materials ?? [];
    const hide = materials.find((m) => m.materialId === 'hide')!;
    expect(hide.amount).toBeGreaterThanOrEqual(2);
    expect(hide.amount).toBeLessThanOrEqual(3);
    expect(materials.find((m) => m.materialId === 'bone')!.amount).toBe(2);
  });

  it('trophyBeast: needs the Wild family, and costs nothing when missed', () => {
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
});

describe('patrol threats', () => {
  it('each patrol kind carries its threat in its briefing', () => {
    const goblins = findSpawn((s) => s.kind === 'goblins').spawn;
    const herd = findSpawn((s) => s.kind === 'herd').spawn;
    const bandits = findSpawn((s) => s.kind === 'bandits').spawn;
    expect(patrolRunOptions(goblins).briefing).toEqual({ threats: [patrolThreat(goblins)], restriction: null, opportunity: null });
    expect(patrolRunOptions(herd).briefing).toEqual({ threats: [patrolThreat(herd)], restriction: null, opportunity: null });
    expect(patrolRunOptions(bandits).briefing).toEqual({ threats: [patrolThreat(bandits)], restriction: null, opportunity: null });
  });

  it('darkness exposes the goblins\' first fight when half-missed, and the odds include it', () => {
    const save = tierTeam();
    // Bram alone has no Watch tags: the level 1 darkness is half-missed, one exposed fight.
    const party = prepareParty(save, ['bram']);
    const { spawn } = findSpawn((s) => s.kind === 'goblins');
    // Elites, so the fights can be lost and the exposure shows in the odds.
    const dungeon = patrolDungeon(spawn, 1, true);
    const runs = Array.from({ length: 10 }, (_, i) => simulateRun(party, dungeon, `s${i}`, patrolRunOptions(spawn)));
    runs.forEach((run) => {
      expect(run.threats[0]).toMatchObject({ threat: { id: 'darkness' }, state: 'half' });
      // The enemies strike first in the one exposed fight.
      expect(run.encounters[0].effects).toContainEqual({ heroId: null, key: 'exposed' });
    });
    // The odds the party and the escort see run the same seeds with the same briefing.
    const oddsSeeds = Array.from({ length: 30 }, (_, i) =>
      simulateRun(party, dungeon, `odds|${dungeon.id}|${i}`, patrolRunOptions(spawn)),
    );
    expect(oddsSeeds.every((run) => run.encounters[0].effects.some((e) => e.key === 'exposed'))).toBe(true);
  });

  it('beasts make the herd\'s mobs hit harder', () => {
    const save = tierTeam();
    const party = prepareParty(save, ['bram']);
    const { spawn } = findSpawn((s) => s.kind === 'herd');
    const dungeon = patrolDungeon(spawn, 1, true);
    const seeds = Array.from({ length: 20 }, (_, i) => `s${i}`);
    const withThreat = seeds.map((seed) => simulateRun(party, dungeon, seed, patrolRunOptions(spawn)));
    const without = seeds.map((seed) => simulateRun(party, dungeon, seed, { rules: { ...expeditionRules, mishapChance: 0 } }));
    const taken = (runs: typeof without) => runs.reduce((sum, run) => sum + (run.encounters[0].taken.bram ?? 0), 0);
    expect(withThreat[0].threats[0]).toMatchObject({ threat: { id: 'beasts' }, state: 'half' });
    expect(taken(withThreat)).toBeGreaterThan(taken(without));
  });
});

/** A tutorial-free save with tier-5 gear and veterans who clear tier 1, and a stocked kitchen. */
function geared(consumables: Record<string, number> = {}): SaveData {
  let save: SaveData = {
    ...createInitialSave(),
    tutorial: { ...createInitialSave().tutorial, step: 'done' },
    // Past the safe start, so briefings keep their threats.
    stats: { ...createInitialSave().stats, expeditionsLaunched: 2 },
    consumables: { ...createInitialSave().consumables, trailMix: 30, ...consumables },
    heroes: createInitialSave().heroes.map((h) => ({ ...h, level: 30 })),
    gear: [
      { uid: 'g1', itemId: 'sword5', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
      { uid: 'g2', itemId: 'bow5', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
      { uid: 'g3', itemId: 'wand5', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
    ],
    nextUid: 10,
  };
  save = equip(save, 'bram', 'weapon', 'g1');
  save = equip(save, 'lyra', 'weapon', 'g2');
  save = equip(save, 'mira', 'weapon', 'g3');
  return save;
}

/** The trio as Rally veterans: three troubadours, one with a sword, clearing Prisoners (Rally 2). */
function rallySave(): SaveData {
  let save: SaveData = {
    ...createInitialSave(),
    tutorial: { ...createInitialSave().tutorial, step: 'done' },
    // Past the safe start, so briefings keep their threats.
    stats: { ...createInitialSave().stats, expeditionsLaunched: 2 },
    consumables: { ...createInitialSave().consumables, trailMix: 30 },
    heroes: [
      newHero('bram', 'Bram', 'troubadour', 'none', 30),
      newHero('lyra', 'Lyra', 'troubadour', 'none', 30),
      newHero('mira', 'Mira', 'troubadour', 'none', 30),
    ],
    gear: [{ uid: 'g1', itemId: 'sword5', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 }],
    nextUid: 10,
  };
  save = equip(save, 'bram', 'weapon', 'g1');
  return save;
}

/** The trio as Watch veterans: three scouts, one with a runestone, clearing Old inscriptions (Watch 2). */
function watchSave(): SaveData {
  let save: SaveData = {
    ...createInitialSave(),
    tutorial: { ...createInitialSave().tutorial, step: 'done' },
    // Past the safe start, so briefings keep their threats.
    stats: { ...createInitialSave().stats, expeditionsLaunched: 2 },
    consumables: { ...createInitialSave().consumables, trailMix: 30 },
    heroes: [
      newHero('bram', 'Bram', 'scout', 'none', 30),
      newHero('lyra', 'Lyra', 'scout', 'none', 30),
      newHero('mira', 'Mira', 'scout', 'none', 30),
    ],
    gear: [{ uid: 'g1', itemId: 'runestone5', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 }],
    nextUid: 10,
  };
  save = equip(save, 'bram', 'weapon', 'g1');
  return save;
}

/** A rotation with a debug-forced briefing on `dungeonId`. */
function forcedRotation(dungeonId: string, briefingOf: Briefing) {
  return applyOverrides(dailyRotation(rotationDay(0)), {
    briefings: { [dungeonId]: briefingOf },
  });
}
