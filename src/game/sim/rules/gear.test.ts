import { dailyRotation, rotationDay } from '../../dungeons/rotation';
import { createRng } from '../../generation/rng';
import { createInitialSave, type SaveData } from '../../save';
import { equip } from '../../team/team';
import type { GearInstance, Rarity } from '../../types';
import { generateTavernsAround } from '../../taverns/taverns';
import { emptyLog, type Sim } from '../bot';
import { profiles, simConfig } from '../config';
import type { WalkRates } from '../walking';
import { affixFits, applyStones, planGear, rerollGear, rerollWanted, stoneFor, type GearPlan } from './gear';

const RATES: WalkRates = { perMinute: [], lure: {}, lureSpawns: 0, gathersPerMinute: [], autoPerMinute: [], autoGathersPerMinute: [], nodes: [] };
const NOW = simConfig.startDay;

const piece = (uid: string, itemId: string, rarity: Rarity, affixes: GearInstance['affixes'] = []): GearInstance => ({
  uid,
  itemId,
  rarity,
  roll: 9,
  affixes,
  rerolls: 0,
});

/** A save holding the pieces, the first one worn by the starting warrior. */
const wearing = (
  gear: GearInstance[],
  worn: { heroId: string; slot: 'weapon' | 'armor'; uid: string }[] = [],
  extra: Partial<SaveData> = {},
): SaveData => {
  let save: SaveData = { ...createInitialSave(), gear, ...extra };
  for (const { heroId, slot, uid } of worn) save = equip(save, heroId, slot, uid);
  return save;
};

const makeSim = (save: SaveData): Sim => ({
  save,
  now: NOW,
  day: 1,
  startedAt: NOW,
  profile: profiles.regular,
  config: simConfig,
  jobs: true,
  rates: RATES,
  due: {},
  met: new Set(),
  rng: createRng('gear-test'),
  rotation: dailyRotation(rotationDay(NOW)),
  location: simConfig.location,
  tavern: generateTavernsAround(simConfig.location, NOW)[0],
  reach: { meters: 0, tavern: false, sanctums: [], maps: new Map() },
  bonusGathers: 0,
  collectionAt: (time) => time,
  oddsCache: new Map(),
  launched: new Map(),
  waiting: new Set(),
  rerolled: new Set(),
  expeditionStop: { reason: null, launched: false },
  log: emptyLog('regular', 'gear-test'),
});

const stonesOf = (save: SaveData) =>
  ['fire', 'grass', 'stone', 'electric', 'water'].reduce((sum, element) => sum + (save.materials[`${element}Stone`] ?? 0), 0);

describe('affixFits', () => {
  const plan: GearPlan = { tags: ['beast'], element: null };

  it("fits damage for and against the plan's enemies", () => {
    expect(affixFits(plan, 'hunter')).toBe(true);
    expect(affixFits(plan, 'thickHide')).toBe(true);
  });

  it('fits nothing else', () => {
    expect(affixFits(plan, 'venomous')).toBe(false);
    expect(affixFits(plan, 'dragonhide')).toBe(false);
    expect(affixFits(plan, 'noSuchAffix')).toBe(false);
  });

  it('plans from a real save: the top tiers open today, and their enemies tag it', () => {
    expect(planGear(createInitialSave(), dailyRotation(rotationDay(NOW))).tags.length).toBeGreaterThan(0);
  });
});

describe('stoneFor', () => {
  const held = { fireStone: 1, grassStone: 1, waterStone: 1 };

  it('gives a Common weapon the held stone that beats the plan element, else any held one', () => {
    const save = wearing([piece('w1', 'sword1', 'common')], [{ heroId: 'bram', slot: 'weapon', uid: 'w1' }], { materials: held });
    expect(stoneFor(save, 'w1', { tags: [], element: 'stone' })).toBe('grass');
    expect(stoneFor(save, 'w1', { tags: [], element: 'fire' })).toBe('water');
    expect(stoneFor(save, 'w1', { tags: [], element: null })).toBe('fire');
  });

  it('wards armour and off-hands with the plan element, and nothing above Common', () => {
    const plan: GearPlan = { tags: [], element: 'fire' };
    const save = wearing([piece('a1', 'mail1', 'common'), piece('a2', 'mail1', 'uncommon')], [], { materials: held });
    expect(stoneFor(save, 'a1', plan)).toBe('fire');
    expect(stoneFor(save, 'a2', plan)).toBeNull();
    expect(stoneFor(save, 'a1', { tags: [], element: 'electric' })).toBeNull();
  });

  it('takes no stone without one in stock', () => {
    const save = wearing([piece('w1', 'sword1', 'common')]);
    expect(stoneFor(save, 'w1', { tags: [], element: null })).toBeNull();
  });
});

describe('applyStones', () => {
  it('stones a Common piece only: one affix added, the stone spent, the log kept', () => {
    const save = wearing(
      [piece('w1', 'sword1', 'common'), piece('a1', 'mail1', 'uncommon', [{ id: 'hunter', value: 20 }])],
      [
        { heroId: 'bram', slot: 'weapon', uid: 'w1' },
        { heroId: 'bram', slot: 'armor', uid: 'a1' },
      ],
      { materials: { fireStone: 1, grassStone: 1, stoneStone: 1, electricStone: 1, waterStone: 1 } },
    );
    const sim = makeSim(save);
    applyStones(sim);
    const sword = sim.save.gear.find((g) => g.uid === 'w1')!;
    const mail = sim.save.gear.find((g) => g.uid === 'a1')!;
    expect(sword.affixes).toHaveLength(1);
    expect(sword.affixes[0].id).toMatch(/^infused/);
    expect(sword.rarity).toBe('uncommon');
    expect(mail.affixes).toEqual([{ id: 'hunter', value: 20 }]);
    expect(stonesOf(sim.save)).toBe(4);
    expect(sim.log.stones).toEqual([1]);
  });
});

describe('rerollWanted', () => {
  const plan: GearPlan = { tags: ['beast'], element: null };

  it('wants a Rare or Legendary piece whose affixes fit nothing', () => {
    const save = wearing([piece('r1', 'sword1', 'rare', [{ id: 'lucky', value: 2 }]), piece('r2', 'sword1', 'legendary', [{ id: 'hunter', value: 20 }])]);
    expect(rerollWanted(save, 'r1', plan)).toBe(true);
    expect(rerollWanted(save, 'r2', plan)).toBe(false);
  });

  it('leaves Uncommon pieces alone', () => {
    const save = wearing([piece('u1', 'sword1', 'uncommon', [{ id: 'lucky', value: 2 }])]);
    expect(rerollWanted(save, 'u1', plan)).toBe(false);
  });
});

describe('rerollGear', () => {
  const held = (gold: number): SaveData =>
    wearing([piece('r1', 'sword1', 'rare', [{ id: 'lucky', value: 2 }])], [{ heroId: 'bram', slot: 'weapon', uid: 'r1' }], { gold, materials: { wood: 10 } });

  it('rerolls a piece nothing fits, once, keeping twice the cost in gold back', () => {
    const sim = makeSim(held(100));
    rerollGear(sim);
    expect(sim.save.gear.find((g) => g.uid === 'r1')!.rerolls).toBe(1);
    expect(sim.log.rerolls).toEqual([{ day: 1, gold: 25, materials: { wood: -3 } }]);
    expect(sim.save.gold).toBe(75);
    expect(sim.save.materials.wood).toBe(7);
    rerollGear(sim);
    expect(sim.save.gear.find((g) => g.uid === 'r1')!.rerolls).toBe(1);
    expect(sim.log.rerolls).toHaveLength(1);
  });

  it('waits for the gold reserve', () => {
    const sim = makeSim(held(74));
    rerollGear(sim);
    expect(sim.log.rerolls).toEqual([]);
    expect(sim.save.gold).toBe(74);
    expect(sim.save.gear.find((g) => g.uid === 'r1')!.rerolls).toBe(0);
  });
});
