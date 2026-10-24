import { dungeonById } from '@/content/lookup';

import { successChance, teamPower } from '../expeditions/expeditions';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import { simulateWalk } from './simulateWalk';

// Guard rails for tuning. The simulated walker is greedy, so real walks yield
// roughly half of these numbers.

const ALL = ['bram', 'lyra', 'mira'];

function averageWalk(minutes: number) {
  const starts = [
    { latitude: -41.2865, longitude: 174.7762 },
    { latitude: 48.8566, longitude: 2.3522 },
    { latitude: 40.7128, longitude: -74.006 },
    { latitude: 35.6762, longitude: 139.6503 },
  ];
  const totals: Record<string, number> = {};
  const runs = starts.flatMap((start, i) =>
    [6, 12, 18].map((hour) => simulateWalk(start, Date.UTC(2026, 9, 20 + i, hour), minutes)),
  );
  for (const save of runs) {
    for (const [id, amount] of Object.entries(save.materials)) totals[id] = (totals[id] ?? 0) + amount;
  }
  const avg = (id: string) => (totals[id] ?? 0) / runs.length;
  return {
    ore: avg('ironOre') + avg('copperOre') + avg('crystal'),
    animal: avg('hide') + avg('bone') + avg('meat'),
    herb: avg('herb') + avg('berries') + avg('mushroom'),
    rare: avg('starMetal') + avg('moonpetal'),
  };
}

function team(level: number, geared: boolean, elixirs = false): SaveData {
  let save: SaveData = {
    ...createInitialSave(),
    heroes: createInitialSave().heroes.map((h) => ({ ...h, level })),
    gear: [
      { uid: 'g1', itemId: 'ironSword', durability: 30 },
      { uid: 'g2', itemId: 'boneBow', durability: 25 },
      { uid: 'g3', itemId: 'crystalWand', durability: 20 },
      { uid: 'g4', itemId: 'leatherArmor', durability: 30 },
    ],
    consumables: { fireResistanceElixir: 2 },
  };
  if (geared) {
    save = equip(save, 'bram', 'weapon', 'g1');
    save = equip(save, 'lyra', 'weapon', 'g2');
    save = equip(save, 'mira', 'weapon', 'g3');
    save = equip(save, 'bram', 'armor', 'g4');
  }
  if (elixirs) {
    save = equip(save, 'bram', 'consumable', 'fireResistanceElixir');
    save = equip(save, 'lyra', 'consumable', 'fireResistanceElixir');
  }
  return save;
}

const chance = (save: SaveData, dungeonId: string) =>
  successChance(teamPower(save, ALL, dungeonById[dungeonId]), dungeonById[dungeonId].difficulty);

describe('gathering balance (30 minute walk)', () => {
  const walk = averageWalk(30);

  it('yields enough ore for a couple of weapons, not a whole armoury', () => {
    expect(walk.ore).toBeGreaterThan(8);
    expect(walk.ore).toBeLessThan(30);
  });

  it('keeps animal and herb materials in the same range as ore', () => {
    expect(walk.animal).toBeGreaterThan(8);
    expect(walk.animal).toBeLessThan(45);
    expect(walk.herb).toBeGreaterThan(6);
    expect(walk.herb).toBeLessThan(30);
  });

  it('makes rare materials rare', () => {
    expect(walk.rare).toBeLessThan(1);
  });
});

describe('expedition progression', () => {
  it('lets a fresh team usually clear the first dungeon', () => {
    expect(chance(team(1, false), 'goblinWarren')).toBeGreaterThan(0.6);
  });

  it('makes the second dungeon a coin flip with basic gear', () => {
    const odds = chance(team(1, true), 'trollBridge');
    expect(odds).toBeGreaterThan(0.35);
    expect(odds).toBeLessThan(0.7);
  });

  it('keeps the third dungeon out of reach early and rewards fire protection', () => {
    expect(chance(team(1, true), 'cinderHollow')).toBeLessThan(0.1);
    const levelFour = chance(team(4, true), 'cinderHollow');
    const withElixirs = chance(team(4, true, true), 'cinderHollow');
    expect(levelFour).toBeLessThan(0.35);
    expect(withElixirs).toBeGreaterThan(levelFour + 0.1);
  });
});
