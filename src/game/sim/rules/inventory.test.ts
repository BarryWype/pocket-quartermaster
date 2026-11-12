import { createInitialSave, type SaveData } from '../../save';
import { createRng } from '../../generation/rng';
import { dungeonById } from '@/content/lookup';
import { emptyLog, stockProvisions, type Sim } from '../bot';
import { profiles, simConfig } from '../config';
import { craftOils, craftStatPotions, forgeLootTrinkets, partRecipeFor, partsToSell } from './inventory';


/** A Sim with just the fields the inventory rules touch: a real day 1 save, an empty log. */
function simOf(save: SaveData): Sim {
  return {
    save,
    now: simConfig.startDay,
    day: 1,
    startedAt: simConfig.startDay,
    profile: profiles.regular,
    config: simConfig,
    jobs: true,
    rates: { perMinute: [], lure: {}, lureSpawns: 0, gathersPerMinute: [], autoPerMinute: [], autoGathersPerMinute: [], nodes: [] },
    due: {},
    met: new Set(),
    rng: createRng('test'),
    rotation: { day: 0, tiers: {} },
    location: simConfig.location,
    tavern: { id: 'tavern', kind: 'market', group: '', tile: '', position: simConfig.location, startsAt: 0, expiresAt: Infinity, roll: 0, name: 'Tavern' },
    recruitWanted: 0,
    reach: { meters: 0, tavern: false, sanctums: [], maps: new Map() },
    bonusGathers: 0,
    collectionAt: () => simConfig.startDay,
    oddsCache: new Map(),
    launched: new Map(),
    waiting: new Set(),
    rerolled: new Set(),
    expeditionStop: { reason: null, launched: false },
    log: emptyLog('regular', 'test'),
  };
}

describe('partsToSell', () => {
  it('sells the parts above the cap, keeping a known recipe’s input', () => {
    const save = createInitialSave();
    save.partRecipes = ['firebomb'];
    save.materials = { ...save.materials, goblinEar: 25, fangOrHorn: 30, scale: 20 };
    expect(partsToSell(save, 20)).toEqual([
      { id: 'fangOrHorn', count: 10 },
      { id: 'goblinEar', count: 5 },
    ]);
    // The firebomb's scale recipe is known, so it keeps one craft's worth of scales; nothing holds goblin ears back.
    expect(partsToSell(save, 2)).toEqual([
      { id: 'fangOrHorn', count: 28 },
      { id: 'goblinEar', count: 23 },
      { id: 'scale', count: 18 },
    ]);
  });

  it('keeps one forge of a known loot trinket recipe back from the sale', () => {
    const save = createInitialSave();
    save.partRecipes = ['bountyToken'];
    save.materials = { ...save.materials, tatteredInsignia: 25 };
    expect(partsToSell(save, 2)).toEqual([{ id: 'tatteredInsignia', count: 17 }]);
  });
});

describe('partRecipeFor', () => {
  it('returns the part recipe only when its part is held and known, else null', () => {
    const save = createInitialSave();
    save.partRecipes = ['healingPotionPart'];
    save.materials = { ...save.materials, herb: 1, bruteBlood: 1 };
    expect(partRecipeFor(save, 'healingPotion')?.id).toBe('healingPotionPart');
    expect(partRecipeFor({ ...save, materials: { ...save.materials, bruteBlood: 0 } }, 'healingPotion')).toBeNull();
    expect(partRecipeFor({ ...save, partRecipes: [] }, 'healingPotion')).toBeNull();
  });
});

describe('craftStatPotions', () => {
  const tier2 = (save: SaveData): SaveData => ({
    ...save,
    clearedDungeons: Object.values(dungeonById).filter((d) => d.tier === 1 && d.isBoss).map((d) => d.id),
  });

  it('crafts a stat potion from its parts up to the stock', () => {
    const sim = simOf(tier2(createInitialSave()));
    sim.save.partRecipes = ['strengthDraughtPart'];
    sim.save.materials = { ...sim.save.materials, stone: 5, fangOrHorn: 2, herb: 5 };
    craftStatPotions(sim);
    expect(sim.save.consumables.strengthDraught).toBe(2);
    expect(sim.save.materials.fangOrHorn ?? 0).toBe(0);
    expect(sim.log.crafts.filter((c) => c.kind === 'consumable')).toHaveLength(2);
    craftStatPotions(sim);
    expect(sim.save.consumables.strengthDraught).toBe(2);
    expect(sim.log.crafts).toHaveLength(2);
  });

  it('uses the base recipe when the parts are not held, and nothing while the tier is locked', () => {
    const save = tier2(createInitialSave());
    const sim = simOf(save);
    sim.save.materials = { ...sim.save.materials, stone: 1, meat: 1, herb: 1 };
    craftStatPotions(sim);
    expect(sim.save.consumables.strengthDraught).toBe(1);
    const locked = simOf(createInitialSave());
    locked.save.materials = { stone: 1, meat: 1, herb: 1 };
    craftStatPotions(locked);
    expect(locked.save.consumables.strengthDraught).toBeUndefined();
    expect(locked.log.crafts).toHaveLength(0);
  });
});

describe('craftOils', () => {
  it('crafts each elemental oil up to the stock once the tier is reached', () => {
    const tier3 = (save: SaveData): SaveData => ({
      ...save,
      clearedDungeons: Object.values(dungeonById).filter((d) => d.isBoss && d.tier <= 2).map((d) => d.id),
    });
    const sim = simOf(tier3(createInitialSave()));
    sim.save.materials = { ...sim.save.materials, copper: 2, fireShard: 4, herb: 2 };
    craftOils(sim);
    expect(sim.save.consumables.emberOil).toBe(2);
    expect(sim.log.crafts.filter((c) => c.kind === 'consumable')).toHaveLength(2);
    const locked = simOf(createInitialSave());
    locked.save.materials = { ...locked.save.materials, copper: 2, fireShard: 4, herb: 2 };
    craftOils(locked);
    expect(locked.save.consumables.emberOil).toBeUndefined();
  });
});

describe('forgeLootTrinkets', () => {
  it('forges one of each known loot trinket recipe the bot holds none of, and only once', () => {
    const sim = simOf(createInitialSave());
    sim.save.partRecipes = ['bountyToken'];
    sim.save.materials = { ...sim.save.materials, tatteredInsignia: 20 };
    forgeLootTrinkets(sim);
    expect(sim.save.gear.filter((g) => g.itemId === 'bountyToken')).toHaveLength(1);
    expect(sim.save.materials.tatteredInsignia).toBe(12);
    expect(sim.log.milestones.lootTrinketForged).toBe(1);
    forgeLootTrinkets(sim);
    expect(sim.save.gear.filter((g) => g.itemId === 'bountyToken')).toHaveLength(1);
    expect(sim.log.crafts.filter((c) => c.kind === 'lootTrinket')).toHaveLength(1);
  });

  it('forges nothing while the recipe is unknown or the parts are short', () => {
    const sim = simOf(createInitialSave());
    sim.save.materials = { ...sim.save.materials, tatteredInsignia: 20 };
    forgeLootTrinkets(sim);
    expect(sim.log.crafts).toHaveLength(0);
    const known = simOf(createInitialSave());
    known.save.partRecipes = ['bountyToken'];
    known.save.materials = { ...known.save.materials, tatteredInsignia: 3 };
    forgeLootTrinkets(known);
    expect(known.log.crafts).toHaveLength(0);
  });
});

describe('stockProvisions', () => {
  it('keeps the strongest healing potion the bot can brew, not always the minor one', () => {
    const tier3 = (save: SaveData): SaveData => ({
      ...save,
      clearedDungeons: Object.values(dungeonById).filter((d) => d.isBoss && d.tier <= 2).map((d) => d.id),
    });
    const sim = simOf(tier3(createInitialSave()));
    sim.save.materials = { ...sim.save.materials, copper: 3, herb: 3, mushroom: 3 };
    stockProvisions(sim);
    expect(sim.save.consumables.standardHealingPotion).toBe(3);
    expect(sim.save.consumables.healingPotion ?? 0).toBe(0);
  });
});
