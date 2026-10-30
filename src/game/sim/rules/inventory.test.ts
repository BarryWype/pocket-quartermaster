import { createInitialSave, type SaveData } from '../../save';
import { createRng } from '../../generation/rng';
import { dungeonById } from '@/content/lookup';
import { emptyLog, type Sim } from '../bot';
import { profiles, simConfig } from '../config';
import { craftCharms, craftStatPotions, partRecipeFor, valuablesToSell } from './inventory';


/** A Sim with just the fields the inventory rules touch: a real day 1 save, an empty log. */
function simOf(save: SaveData): Sim {
  return {
    save,
    now: simConfig.startDay,
    day: 1,
    startedAt: simConfig.startDay,
    profile: profiles.regular,
    config: simConfig,
    rates: { perMinute: [], lure: {}, lureSpawns: 0, gathersPerMinute: [], autoPerMinute: [], autoGathersPerMinute: [], nodes: [] },
    due: {},
    met: new Set(),
    rng: createRng('test'),
    rotation: { day: 0, tiers: {} },
    location: simConfig.location,
    tavern: { id: 'tavern', kind: 'market', group: '', tile: '', position: simConfig.location, startsAt: 0, expiresAt: Infinity, roll: 0, name: 'Tavern' },
    reach: { meters: 0, tavern: false, sanctums: [], maps: new Map() },
    bonusGathers: 0,
    collectionAt: () => simConfig.startDay,
    oddsCache: new Map(),
    launched: new Map(),
    waiting: new Set(),
    log: emptyLog('regular', 'test'),
  };
}

describe('valuablesToSell', () => {
  it('keeps the gem a held relic needs and sells the rest', () => {
    const save = createInitialSave();
    save.valuables = { 'oldCoins:1': 2, 'roughGem:1': 1 };
    save.relics = [{ uid: 'r1', relicId: 'rustedSaintsBuckler' }];
    expect(valuablesToSell(save)).toEqual([{ key: 'oldCoins:1', count: 2 }]);
  });

  it('keeps one gem a known charm recipe needs', () => {
    const save = createInitialSave();
    save.valuables = { 'roughGem:1': 2 };
    save.partRecipes = ['prismCharm'];
    expect(valuablesToSell(save)).toEqual([{ key: 'roughGem:1', count: 1 }]);
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

describe('craftCharms', () => {
  it('crafts a charm with its parts up to the stock', () => {
    const sim = simOf(createInitialSave());
    sim.save.partRecipes = ['luckyEar'];
    sim.save.materials = { ...sim.save.materials, goblinEar: 5 };
    craftCharms(sim);
    expect(sim.save.consumables.luckyEar).toBe(1);
    expect(sim.save.materials.goblinEar).toBe(2);
    expect(sim.log.crafts.filter((c) => c.kind === 'consumable')).toHaveLength(1);
    expect(sim.log.milestones.charmCrafted).toBe(1);
    craftCharms(sim);
    expect(sim.save.consumables.luckyEar).toBe(1);
    expect(sim.log.crafts).toHaveLength(1);
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
