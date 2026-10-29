import { expeditionRules } from '@/content/dungeons';
import { dungeonById } from '@/content/lookup';
import { provisionRules } from '@/content/provisions';
import { tavernRules } from '@/content/taverns';
import { traits } from '@/content/traits';

import { migrateV10Save } from '../migrations';
import { createInitialSave, type SaveData } from '../save';
import { buySupply, buySupplyProblem, supplyPrice } from '../taverns/taverns';
import { equip } from '../team/team';
import type { Ability, BossDef, Briefing, DungeonDef, EncounterDef, HeroState } from '../types';
import { launchPlan, resolveExpedition, startExpedition } from './expeditions';
import { emergencyPrice, heroSupplyNeed, hungerEffect, hungerFor, pickSupply, supplyHeld } from './provisions';
import { prepareParty, simulateRun, type PartyMember } from './simulate';

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
      { uid: 'g1', itemId: 'woodSword', quality: 'normal' },
      { uid: 'g2', itemId: 'woodBow', quality: 'normal' },
      { uid: 'g3', itemId: 'woodWand', quality: 'normal' },
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
    expect(one('scholarsPorridge')).toBe(Math.round(one(null) * 1.15));
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

describe('charms', () => {
  it('Rabbit’s foot: +5% crit chance for the hero', () => {
    const save = equip(ready({ trailMix: 5, rabbitsFoot: 1 }), 'bram', 'consumable', 'rabbitsFoot');
    expect(prepareParty(save, ['bram'])[0].abilities).toContainEqual({ kind: 'critBonus', chance: provisionRules.charms.rabbitsFoot });
  });

  it('Lucky tooth: +5% party gold, once however many heroes carry one', () => {
    const gold = (holders: string[]) => {
      let save = { ...ready({ trailMix: 5, luckyTooth: 3 }), nextUid: 42 };
      for (const id of holders) save = equip(save, id, 'consumable', 'luckyTooth');
      return resolve(startExpedition(save, 'ratCellar', ALL, 0)).report;
    };
    const plain = gold([]);
    const one = gold(['bram']);
    const all = gold(ALL);
    expect(one.success).toBe(plain.success);
    expect(one.gold).toBe(Math.round(plain.gold * 1.05));
    expect(all.gold).toBe(one.gold);
    expect(all.consumablesUsed).toEqual(['luckyTooth', 'luckyTooth', 'luckyTooth']);
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
