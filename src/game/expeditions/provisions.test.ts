import { expeditionRules } from '@/content/dungeons';
import { TIER_SCALE } from '@/content/enemies';
import { dungeonById, itemById } from '@/content/lookup';
import { provisionRules } from '@/content/provisions';
import { tavernRules } from '@/content/taverns';
import { traits } from '@/content/traits';

import type { Element } from '../elements';
import { migrateV10Save } from '../migrations';
import { createInitialSave, type SaveData } from '../save';
import { buySupply, buySupplyProblem, supplyPrice } from '../taverns/taverns';
import { setHeroHp } from '../team/health';
import { equip, heroStats } from '../team/team';
import type { Ability, BossDef, Briefing, ConsumableDef, DungeonDef, EncounterDef, HeroState, MealEffect } from '../types';
import { launchPlan, resolveExpedition, startExpedition, untriggeredSalvage } from './expeditions';
import { emergencyPrice, heroSupplyNeed, hungerEffect, hungerFor, pickSupply, supplyHeld } from './provisions';
import { estimateOdds } from './odds';
import { EMPTY_BRIEFING, prepareParty, simulateRun, type PartyMember, type RunResult } from './simulate';

const ALL = ['bram', 'lyra', 'mira'];
const steady = { ...expeditionRules, mishapChance: 0, fortune: 0, damageVariance: 0, enemyCritChance: 0 };
/** A briefing whose missed traps make every trap in the pool bite at 12% of max HP. */
const traps: Briefing = { threats: [{ id: 'traps', level: 2 }], restriction: null, opportunity: null };

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
  abilities,
  consumable: null,
  ...overrides,
});

const weakBoss: BossDef = { id: 'testBoss', name: 'test boss', hp: 1, damage: 0, damageType: 'power', speed: 5, tags: [] };
const oneEncounter = (encounter: EncounterDef): DungeonDef => ({
  ...dungeonById.ratCellar,
  encounterCount: [2, 2],
  encounters: [encounter],
  boss: weakBoss,
});

const trap: EncounterDef = { type: 'trap', weight: 1, name: 'test trap', targets: 'all' };

/** A started tutorial-free save with the starting heroes in wooden kit. */
function ready(consumables: Record<string, number> = createInitialSave().consumables): SaveData {
  let save: SaveData = {
    ...createInitialSave(),
    tutorial: { step: 'done', woodSpot: null },
    clearedDungeons: ['banditStockade', 'ogreQuarry'],
    consumables,
    gear: [
      { uid: 'g1', itemId: 'sword1', quality: 'normal' },
      { uid: 'g2', itemId: 'bow1', quality: 'normal' },
      { uid: 'g3', itemId: 'wand1', quality: 'normal' },
    ],
  };
  ALL.forEach((id, i) => {
    save = equip(save, id, 'weapon', `g${i + 1}`);
  });
  return save;
}

const resolve = (save: SaveData) => resolveExpedition(save, save.expeditions[0]);

describe('supply', () => {
  it('needs heroes × started hours', () => {
    expect(heroSupplyNeed([], 5)).toBe(1);
    expect(heroSupplyNeed([], 60)).toBe(1);
    expect(heroSupplyNeed([], 61)).toBe(2);
    expect(heroSupplyNeed([], 180)).toBe(3);
    expect(launchPlan(ready(), dungeonById.ratCellar, ALL).need).toBe(3);
    expect(launchPlan(ready(), dungeonById.ogreQuarry, ALL).need).toBe(3 * Math.ceil(dungeonById.ogreQuarry.durationMinutes / 60));
  });

  it('counts Light eater and Glutton per hero, never below 0', () => {
    expect(heroSupplyNeed([{ kind: 'supplyNeed', add: -1 }], 5)).toBe(0);
    expect(heroSupplyNeed([{ kind: 'supplyNeed', add: -1 }], 120)).toBe(1);
    expect(heroSupplyNeed([{ kind: 'supplyNeed', add: 1 }], 5)).toBe(2);
  });

  it('takes the cheapest combination', () => {
    const stock = { trailMix: 10, jerky: 10 };
    expect(pickSupply(stock, 3).items).toEqual({ jerky: 1 });
    expect(pickSupply(stock, 4).items).toEqual({ trailMix: 2 });
    expect(pickSupply(stock, 5).items).toEqual({ trailMix: 1, jerky: 1 });
    expect(pickSupply(stock, 6).items).toEqual({ jerky: 2 });
    expect(pickSupply(stock, 9).items).toEqual({ jerky: 3 });
    expect(pickSupply({ trailMix: 1, jerky: 0 }, 3)).toEqual({ items: { trailMix: 1 }, points: 2 });
    expect(pickSupply({ jerky: 2 }, 1)).toEqual({ items: { jerky: 1 }, points: 3 });
  });

  it('is used up at launch, and the status is kept for the run', () => {
    const started = startExpedition(ready({ trailMix: 3 }), 'ratCellar', ALL, 0);
    expect(started.consumables.trailMix).toBe(1);
    expect(started.expeditions[0]).toMatchObject({ hunger: 'fed', supplyUsed: 4 });
    const underfed = startExpedition(ready({ trailMix: 1 }), 'ratCellar', ALL, 0);
    expect(underfed.expeditions[0].hunger).toBe('underfed');
    const starving = startExpedition(ready({}), 'ratCellar', ALL, 0);
    expect(starving.expeditions[0].hunger).toBe('starving');
    expect(resolve(starving).report.hunger).toBe('starving');
  });

  it('starts new saves with enough for about five short runs', () => {
    const points = supplyHeld(createInitialSave().consumables);
    expect(points).toBeGreaterThanOrEqual(15);
    expect(points).toBeLessThan(20);
  });

  it('turns status into effects: −10% / −20% damage, −15% HP when starving, halved by Hardy', () => {
    expect(hungerFor(3, 3)).toBe('fed');
    expect(hungerFor(2, 3)).toBe('underfed');
    expect(hungerFor(0, 3)).toBe('starving');
    expect(hungerFor(0, 0)).toBe('fed');
    expect(hungerEffect('underfed', [])).toEqual({ damage: 0.9, hpLoss: 0 });
    expect(hungerEffect('starving', [])).toEqual({ damage: 0.8, hpLoss: 0.15 });
    const hardy = hungerEffect('starving', [{ kind: 'hungerResist', multiplier: 0.5 }]);
    expect(hardy.damage).toBeCloseTo(0.9);
    expect(hardy.hpLoss).toBeCloseTo(0.075);
  });

  it('slows the party when hungry, and starving costs HP at the start', () => {
    const fight: EncounterDef = { type: 'fight', weight: 1, mobs: [{ mobId: 'wolfPup', count: 3 }] };
    const dealt = (hunger: 'fed' | 'underfed' | 'starving') =>
      simulateRun([member('a', [], { maxHp: 1e6 })], oneEncounter(fight), 's', { rules: steady, hunger }).encounters[0];
    expect(dealt('underfed').rounds).toBeGreaterThanOrEqual(dealt('fed').rounds);
    expect(dealt('starving').dealt.a).toBeGreaterThan(0);
    const run = simulateRun([member('a')], oneEncounter({ type: 'event', weight: 1, eventId: 'cache' }), 's', { rules: steady, hunger: 'starving' });
    expect(run.hp[0].hp).toBe(85);
  });

  it('sells emergency supply at taverns, dearer each tier', () => {
    const tavern = { latitude: 0, longitude: 0 };
    const save = { ...ready({}), gold: 100 };
    expect(emergencyPrice(1)).toBe(12);
    expect(emergencyPrice(2)).toBe(24);
    expect(supplyPrice(save)).toBe(emergencyPrice(3));
    const bought = buySupply(save, 2, tavern, tavern);
    expect(bought.consumables.jerky).toBe(2);
    expect(bought.gold).toBe(100 - 2 * supplyPrice(save));
    expect(buySupplyProblem({ ...save, clearedDungeons: [] }, 1, tavern, tavern)).toBe('locked');
    expect(buySupplyProblem(save, 1, tavern, { latitude: 1, longitude: 0 })).toBe('tooFar');
    expect(buySupplyProblem({ ...save, gold: 0 }, 1, tavern, tavern)).toBe('gold');
    expect(tavernRules.unlockedBy).toBe('banditStockade');
  });
});

describe('meals', () => {
  const outcomes = (mealId: string | null, dungeonId = 'ratCellar', runs = 40) =>
    Array.from({ length: runs }, (_, i) => {
      const save = { ...ready({ trailMix: 10, [mealId ?? 'none']: 1 }), nextUid: 100 + i };
      return resolve(startExpedition(save, dungeonId, ALL, 0, 1, undefined, { mealId })).report;
    });

  it('costs one meal item, one per expedition', () => {
    const started = startExpedition(ready({ trailMix: 5, merchantsPie: 2 }), 'ratCellar', ALL, 0, 1, undefined, { mealId: 'merchantsPie' });
    expect(started.consumables.merchantsPie).toBe(1);
    expect(started.expeditions[0].mealId).toBe('merchantsPie');
    expect(() => startExpedition(ready({ trailMix: 5 }), 'ratCellar', ALL, 0, 1, undefined, { mealId: 'merchantsPie' })).toThrow();
    expect(() => startExpedition(ready({ trailMix: 5, jerky: 1 }), 'ratCellar', ALL, 0, 1, undefined, { mealId: 'jerky' })).toThrow();
  });

  it('Merchant’s pie: +15% gold; Scholar’s porridge: +15% XP', () => {
    const plain = outcomes(null);
    const pie = outcomes('merchantsPie');
    const porridge = outcomes('scholarsPorridge');
    const sum = (list: typeof plain, key: 'gold' | 'xp') => list.reduce((s, r) => s + r[key], 0);
    expect(sum(pie, 'gold') / sum(plain, 'gold')).toBeCloseTo(1.15, 1);
    const xpOf = (save: SaveData) => save.heroes.find((h) => h.id === 'lyra')!.xp;
    const one = (mealId: string | null) =>
      xpOf(resolve(startExpedition({ ...ready({ trailMix: 5, scholarsPorridge: 1 }), nextUid: 7 }, 'ratCellar', ALL, 0, 1, undefined, { mealId })).save);
    expect(one('scholarsPorridge')).toBeGreaterThan(one(null));
    expect(Math.abs(one('scholarsPorridge') - Math.round(one(null) * 1.15))).toBeLessThanOrEqual(1);
    expect(porridge.length).toBe(plain.length);
  });

  it('Quick bites: −10% duration', () => {
    const started = startExpedition(ready({ trailMix: 5, quickBites: 1 }), 'ratCellar', ALL, 0, 1, undefined, { mealId: 'quickBites' });
    expect(started.expeditions[0].endsAt).toBe(dungeonById.ratCellar.durationMinutes * 0.9 * 60_000);
  });

  it('Hunter’s stew: heals before the boss', () => {
    const run = simulateRun([member('a', [], { hp: 50, power: 1000 })], oneEncounter({ type: 'event', weight: 1, eventId: 'cache' }), 's', {
      rules: steady,
      meal: { kind: 'bossHeal', pct: provisionRules.meals.stewHeal },
    });
    expect(run.encounters[1].healed.a).toBeCloseTo(15);
  });

  it('Comfort broth: +25% of the cleared share after a retreat, never more than a full clear', () => {
    const weak = (mealId: string | null) =>
      Array.from({ length: 60 }, (_, i) => {
        // Tier 1 as the highest, so XP isn't reduced.
        const save = { ...ready({ trailMix: 10, comfortBroth: 1 }), clearedDungeons: [], nextUid: 200 + i };
        return resolve(startExpedition(save, 'banditStockade', ['mira'], 0, 1, undefined, { mealId })).report;
      });
    const plain = weak(null);
    const broth = weak('comfortBroth');
    plain.forEach((report, i) => {
      if (report.success || report.encountersCleared === 0) return;
      const share = report.encountersCleared / report.encounterCount;
      expect(broth[i].xp).toBe(Math.round(dungeonById.banditStockade.xp * Math.min(1, share * 1.25)));
    });
    expect(plain.some((r) => r.outcome === 'retreat')).toBe(true);
  });
});

describe('party meals', () => {
  const mealRun = (meal: MealEffect | null, boss: BossDef = weakBoss, briefing: Briefing = EMPTY_BRIEFING) =>
    simulateRun(
      [member('a', [], { resistance: 10, approachBonus: { finesse: 1, wits: 2, presence: 1 } })],
      { ...oneEncounter(trap), encounterCount: [3, 3], boss },
      's',
      { rules: steady, meal, briefing },
    );

  it('Hearty roast: +10% max HP, the HP share kept, full heroes start full', () => {
    const roast: MealEffect = { kind: 'maxHp', multiplier: provisionRules.meals.roastHp };
    const hurt = simulateRun([member('a', [], { hp: 50 })], oneEncounter(trap), 's', { rules: steady, meal: roast });
    expect(hurt.hp[0]).toEqual({ heroId: 'a', hp: 55, maxHp: 110 });
    const full = simulateRun([member('a')], oneEncounter(trap), 's', { rules: steady, meal: roast });
    expect(full.hp[0]).toEqual({ heroId: 'a', hp: 110, maxHp: 110 });
  });

  it('Spiced skewers: +1 Speed, quick heroes strike first', () => {
    const quick = { ...weakBoss, speed: 6, damage: 40 };
    const plain = mealRun(null, quick);
    const fed = mealRun({ kind: 'speed', add: provisionRules.meals.skewersSpeed }, quick);
    expect(plain.hp[0].hp).toBe(60);
    expect(fed.hp[0].hp).toBe(100);
  });

  it('Mushroom risotto: +10% Resistance blunts magic hits', () => {
    const caster: BossDef = { ...weakBoss, speed: 10, damage: 40, damageType: 'magic' };
    const defence = (resistance: number) => Math.round(100 - (40 * 100) / (100 + expeditionRules.defenseFactor * resistance));
    expect(mealRun(null, caster, undefined).hp[0].hp).toBe(defence(10));
    expect(mealRun({ kind: 'resistance', multiplier: provisionRules.meals.risottoResistance }, caster, undefined).hp[0].hp).toBe(defence(11));
  });

  it('Honey cakes: opportunity gold and materials ×1.25, multipliers only their excess', () => {
    const honey: MealEffect = { kind: 'opportunity', multiplier: provisionRules.meals.honeyOpportunity };
    const withOpportunity = (id: Briefing['opportunity'], meal: MealEffect | null) =>
      mealRun(meal, weakBoss, { threats: [], restriction: null, opportunity: id });
    const top = dungeonById.ratCellar.gold[1];
    expect(withOpportunity('hiddenCache', null).opportunity?.gold).toBe(Math.round(0.25 * top));
    expect(withOpportunity('hiddenCache', honey).opportunity?.gold).toBe(Math.round(0.25 * top * 1.25));
    expect(withOpportunity('richVein', null).opportunity?.materials).toEqual([{ materialId: 'wood', amount: 4 }]);
    expect(withOpportunity('richVein', honey).opportunity?.materials).toEqual([{ materialId: 'wood', amount: 5 }]);
    expect(withOpportunity('oldInscriptions', null).opportunity?.xpMultiplier).toBe(1.25);
    expect(withOpportunity('oldInscriptions', honey).opportunity?.xpMultiplier).toBe(1 + 0.25 * 1.25);
    expect(withOpportunity('bounty', honey).opportunity?.goldMultiplier).toBe(1 + 0.3 * 1.25);
  });

  it('Hearty roast: nobody comes home above their real max HP', () => {
    const after = resolve(startExpedition({ ...ready({ trailMix: 10, heartyRoast: 1 }), nextUid: 7 }, 'ratCellar', ALL, 0, 1, undefined, { mealId: 'heartyRoast' })).save;
    for (const id of ALL) {
      const hero = after.heroes.find((h) => h.id === id)!;
      expect(hero.hp === undefined || hero.hp <= heroStats(after, hero).hp).toBe(true);
    }
  });

  it('Pemmican counts as 5 supply points', () => {
    const plan = launchPlan(ready({ pemmican: 1 }), dungeonById.ratCellar, ALL);
    expect(plan.held).toBe(5);
    expect(plan.need).toBe(3);
    expect(plan.hunger).toBe('fed');
    const started = startExpedition(ready({ pemmican: 1 }), 'ratCellar', ALL, 0, 1);
    expect(started.consumables.pemmican).toBe(0);
  });

  it('Salted fish counts as 4 supply points', () => {
    const plan = launchPlan(ready({ saltedFish: 1 }), dungeonById.ratCellar, ALL);
    expect(plan.held).toBe(4);
    expect(plan.need).toBe(3);
    expect(plan.hunger).toBe('fed');
    const started = startExpedition(ready({ saltedFish: 1 }), 'ratCellar', ALL, 0, 1);
    expect(started.consumables.saltedFish).toBe(0);
  });

  it('estimates better odds with a hearty roast on a marginal party', () => {
    let frail = ready({ trailMix: 10, heartyRoast: 1 });
    for (const id of ALL) frail = setHeroHp(frail, id, 0.5, 0);
    const pair = ['bram', 'lyra'];
    const fed = estimateOdds(frail, pair, dungeonById.ratCellar, 300, { loadout: { mealId: 'heartyRoast' } }).success;
    expect(fed).toBeGreaterThan(estimateOdds(frail, pair, dungeonById.ratCellar, 300).success);
  });
});

describe('traits', () => {
  it('Tough: −10% damage taken', () => {
    const taken = (abilities: Ability[]) =>
      simulateRun([member('a', abilities)], oneEncounter(trap), 's', { rules: steady, briefing: traps }).encounters[0].taken.a;
    expect(taken([{ kind: 'damageTaken', multiplier: 0.9 }])).toBeCloseTo(taken([]) * 0.9);
  });

  it('Light eater and Glutton change what the party needs', () => {
    const save = (trait: string): SaveData => ({ ...ready(), heroes: ready().heroes.map((h): HeroState => (h.id === 'bram' ? { ...h, trait } : h)) });
    expect(launchPlan(save('lightEater'), dungeonById.ratCellar, ALL).need).toBe(2);
    expect(launchPlan(save('glutton'), dungeonById.ratCellar, ALL).need).toBe(4);
  });

  it('are all in the tavern pool', () => {
    const ids = traits.map((t) => t.id);
    for (const id of ['resilient', 'tough', 'quickHealer', 'lightEater', 'hardy', 'frail', 'slowHealer', 'glutton']) expect(ids).toContain(id);
  });
});

const elixirOf = (id: string) => itemById[id] as ConsumableDef;

describe('elixirs', () => {
  /** A one-step dungeon: an event, then a configurable boss. */
  const bossRun = (boss: Partial<BossDef>): DungeonDef => ({
    ...dungeonById.drownedCrypt,
    tier: 3,
    encounterCount: [2, 2],
    encounters: [{ type: 'event', weight: 1, eventId: 'cache' }],
    boss: { id: 'testBoss', name: 'test boss', hp: 100, damage: 10, damageType: 'power', speed: 5, tags: [], ...boss },
  });
  const fights = (mobs: { mobId: string; count: number }[], count: [number, number] = [2, 2]): DungeonDef => ({
    ...bossRun({}),
    encounters: [{ type: 'fight', weight: 1, mobs }],
  });

  it('multiplies the stat the elixir names, quicksilver adds speed and Viper oil crit, only when the run takes elixirs', () => {
    const base = prepareParty(ready(), ['bram'])[0];
    const saveWith = (id: string) => equip(ready({ ...createInitialSave().consumables, [id]: 1 }), 'bram', 'consumable', id);
    const taken = (id: string) => prepareParty(saveWith(id), ['bram'], 0, true)[0];
    const leftOut = (id: string) => prepareParty(saveWith(id), ['bram'])[0];
    const cases: [string, 'power' | 'magic' | 'armour' | 'resistance', number][] = [
      ['strengthDraught', 'power', provisionRules.elixirs.power],
      ['arcaneTonic', 'magic', provisionRules.elixirs.magic],
      ['ironskinBrew', 'armour', provisionRules.elixirs.armour],
      ['nullrootTincture', 'resistance', provisionRules.elixirs.resistance],
    ];
    for (const [id, stat, multiplier] of cases) {
      expect(taken(id)[stat]).toBe(Math.round(base[stat] * multiplier));
      expect(leftOut(id)[stat]).toBe(base[stat]);
    }
    expect(taken('quicksilver').speed).toBe(base.speed + provisionRules.elixirs.quicksilverSpeed);
    expect(leftOut('quicksilver').speed).toBe(base.speed);
    expect(taken('viperOil').crit).toBe(base.crit + provisionRules.elixirs.viperCrit);
    expect(leftOut('viperOil').crit).toBe(base.crit);
  });

  it('coats the weapon in the oil’s element, replacing a permanent infusion', () => {
    const oiled = (permanent?: Element) => {
      let save = ready({ ...createInitialSave().consumables, emberOil: 1 });
      save = { ...save, gear: save.gear.map((g) => (g.uid === 'g1' ? { ...g, ...(permanent ? { element: permanent } : {}) } : g)) };
      return equip(save, 'bram', 'consumable', 'emberOil');
    };
    expect(prepareParty(oiled(), ['bram'], 0, true)[0].weaponElement).toBe('fire');
    expect(prepareParty(oiled('water'), ['bram'], 0, true)[0].weaponElement).toBe('fire');
    // Left out of the run, the permanent infusion stands.
    expect(prepareParty(oiled('water'), ['bram'])[0].weaponElement).toBe('water');
  });

  it('hits like a permanently infused weapon of the same element', () => {
    const permanent = () => {
      let save = ready();
      return { ...save, gear: save.gear.map((g) => (g.uid === 'g1' ? { ...g, element: 'fire' as const } : g)) };
    };
    const oiled = prepareParty(equip(ready({ ...createInitialSave().consumables, emberOil: 1 }), 'bram', 'consumable', 'emberOil'), ['bram'], 0, true);
    const infused = prepareParty(permanent(), ['bram'], 0, true);
    const run = (party: PartyMember[]) => simulateRun(party, fights([{ mobId: 'goblinSlinger', count: 2 }]), 's', { rules: steady, elixirs: true });
    expect(run(oiled).encounters[0].dealt).toEqual(run(infused).encounters[0].dealt);
  });

  it('does nothing for an unarmed hero', () => {
    const unarmed = (consumable: boolean) => {
      let save = ready(consumable ? { ...createInitialSave().consumables, emberOil: 1 } : createInitialSave().consumables);
      save = { ...save, heroes: save.heroes.map((h) => (h.id === 'bram' ? { ...h, equipment: { ...h.equipment, weapon: null } } : h)) };
      return consumable ? equip(save, 'bram', 'consumable', 'emberOil') : save;
    };
    const withOil = simulateRun(prepareParty(unarmed(true), ['bram'], 0, true), bossRun({ damage: 0 }), 's', { rules: steady, elixirs: true });
    const bare = simulateRun(prepareParty(unarmed(false), ['bram'], 0, true), bossRun({ damage: 0 }), 's', { rules: steady, elixirs: true });
    expect(withOil.encounters[0].dealt).toEqual(bare.encounters[0].dealt);
  });

  it('opens the run’s first fight with fire on every enemy, and no later one', () => {
    const bomb = () => [member('a', [], { consumable: elixirOf('firebomb'), power: 0, maxHp: 1e6 })];
    const first = simulateRun(bomb(), { ...fights([{ mobId: 'giantRat', count: 2 }]), tier: 5 }, 's', { rules: steady, elixirs: true });
    expect(first.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'firebomb' });
    // Tier-5 strength against element-less rats: the bomb alone clears the fight.
    expect(first.encounters[0].dealt.a).toBe(2 * Math.round(provisionRules.elixirs.firebombDamage * TIER_SCALE[4]));
    expect(first.encounters[0].cleared).toBe(true);
    expect(first.elixirsUsed).toEqual(['a']);
    const later = simulateRun([member('a', [], { consumable: elixirOf('firebomb'), power: 1000 })], fights([{ mobId: 'giantRat', count: 1 }], [3, 3]), 's', {
      rules: steady,
      elixirs: true,
    });
    expect(later.encounters[0].effects.some((e) => e.key === 'firebomb')).toBe(true);
    expect(later.encounters.slice(1).every((e) => !e.effects.some((x) => x.key === 'firebomb'))).toBe(true);
  });

  it('gets a knocked-out carrier back up once, without a flawless outcome', () => {
    const run = simulateRun([member('a', [], { consumable: elixirOf('revivalDraught'), power: 20, maxHp: 100 })], bossRun({ hp: 30, damage: 100 }), 's', {
      rules: steady,
      elixirs: true,
    });
    expect(run.encounters[1].effects).toContainEqual({ heroId: 'a', key: 'revive' });
    expect(run.elixirsUsed).toEqual(['a']);
    expect(run.bossDefeated).toBe(true);
    expect(run.outcome).toBe('success');
    expect(run.hp[0].hp).toBeCloseTo(provisionRules.elixirs.reviveHp * 100);
  });

  it('turns a knock-out into an escape that ends the run as a retreat, nobody out', () => {
    const party = [
      member('weak', [], { threat: 100, maxHp: 100 }),
      member('bomber', [], { consumable: elixirOf('smokeBomb'), threat: 1, maxHp: 100 }),
    ];
    const run = simulateRun(party, bossRun({ hp: 1e9, damage: 500 }), 's', { rules: steady, elixirs: true });
    expect(run.escaped).toBe(true);
    expect(run.outcome).toBe('retreat');
    expect(run.encounters.flatMap((e) => e.knockedOut)).toEqual([]);
    expect(run.elixirsUsed).toEqual(['bomber']);
    expect(run.hp.find((h) => h.heroId === 'weak')!.hp).toBe(1);
    expect(run.encountersCleared).toBe(1);
    // A fight that merely times out never reaches for the bomb.
    const timeout = simulateRun([member('a', [], { consumable: elixirOf('smokeBomb'), power: 0 })], bossRun({ hp: 1e9, damage: 0 }), 's', {
      rules: steady,
      elixirs: true,
    });
    expect(timeout.elixirsUsed).toEqual([]);
  });

  it('salvages the elixirs that never triggered, keeping the used ones', () => {
    const run = simulateRun([member('x', [], { power: 1000 })], bossRun({ damage: 0 }), 's', { rules: steady });
    const holders = [
      member('stat', [], { consumable: elixirOf('strengthDraught') }),
      member('speed', [], { consumable: elixirOf('quicksilver') }),
      member('oil', [], { consumable: elixirOf('emberOil'), weaponName: 'sword' }),
      member('oilUnarmed', [], { consumable: elixirOf('emberOil') }),
      member('bomb', [], { consumable: elixirOf('firebomb') }),
      member('revive', [], { consumable: elixirOf('revivalDraught') }),
      member('smoke', [], { consumable: elixirOf('smokeBomb') }),
    ];
    const salvaged = untriggeredSalvage(holders, run, 'dungeonRun');
    expect(salvaged.map((s) => s.heroId).sort()).toEqual(['bomb', 'oil', 'oilUnarmed', 'revive', 'smoke']);
    // Triggered: a thrown bomb, a draught that revived, a bomb that escaped, an oil that struck.
    const triggered: [PartyMember, RunResult, RunResult][] = [
      [holders[4], run, { ...run, elixirsUsed: ['bomb'] }],
      [holders[5], run, { ...run, elixirsUsed: ['revive'] }],
      [holders[6], run, { ...run, elixirsUsed: ['smoke'] }],
      [holders[2], run, { ...run, attacked: [...run.attacked, 'oil'] }],
    ];
    for (const [holder, base, tweaked] of triggered) {
      expect(untriggeredSalvage([holder], tweaked, 'dungeonRun')).toEqual([]);
      expect(untriggeredSalvage([holder], base, 'dungeonRun').length).toBe(1);
    }
  });

  it('estimates better odds with a strength draught on a marginal party', () => {
    let frail = ready({ ...createInitialSave().consumables, strengthDraught: 1 });
    for (const id of ALL) frail = setHeroHp(frail, id, 1, 0);
    const pair = ['bram', 'lyra'];
    const drunk = estimateOdds(equip(frail, 'bram', 'consumable', 'strengthDraught'), pair, dungeonById.ratCellar, 300).success;
    expect(drunk).toBeGreaterThan(estimateOdds(frail, pair, dungeonById.ratCellar, 300).success);
  });

  it('pays the smoke bomb’s retreat bonus on the loot of an escape', () => {
    // Heroes at a sliver of HP fall to the first blow: the bomb turns the wipe into an escape.
    const frail = (consumableId: string | null): SaveData => {
      let save = { ...ready({ trailMix: 10, ...(consumableId ? { [consumableId]: 1 } : {}) }), nextUid: 7 };
      for (const id of ALL) save = setHeroHp(save, id, 0.01, 0);
      return consumableId ? equip(save, 'bram', 'consumable', consumableId) : save;
    };
    const report = (consumableId: string | null, i: number) =>
      resolve(startExpedition({ ...frail(consumableId), nextUid: 500 + i }, 'ratCellar', ALL, 0)).report;
    let compared = false;
    for (let i = 0; i < 60 && !compared; i++) {
      const plain = report(null, i);
      const escaped = report('smokeBomb', i);
      // The bomb only triggers on an escape; runs that never reached for it are left alone.
      if (escaped.salvaged.some((s) => s.itemId === 'smokeBomb')) continue;
      // Same fights cleared: the escape and the wipe it averted differ only in the retreat bonus.
      if (escaped.success || plain.success || escaped.encountersCleared === 0 || escaped.encountersCleared !== plain.encountersCleared) continue;
      expect(escaped.outcome).toBe('retreat');
      expect(escaped.gold).toBeGreaterThan(plain.gold);
      compared = true;
    }
    expect(compared).toBe(true);
  });
});

describe('save migration v10 → v11', () => {
  it('turns rations into jerky, Tough into Resilient, and adds the starting supply', () => {
    const old = createInitialSave();
    const save = migrateV10Save({
      ...old,
      consumables: { ration: 2, healingPotion: 1 },
      heroes: old.heroes.map((h) => (h.id === 'bram' ? { ...h, trait: 'tough', equipment: { ...h.equipment, consumable: 'ration' } } : h)),
    });
    expect(save.consumables).toEqual({ healingPotion: 1, jerky: 3, ...provisionRules.startingStock });
    expect(save.heroes.find((h) => h.id === 'bram')).toMatchObject({ trait: 'resilient', equipment: { consumable: null } });
    expect(save.heroes.every((h) => h.hp === undefined)).toBe(true);
    expect(save.cookingHintSeen).toBe(false);
  });
});
