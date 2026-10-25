import { dungeonById } from '@/content/lookup';

import { successChance, teamPower } from '../expeditions/expeditions';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import type { Tier } from '../types';
import { simulateWalk } from './simulateWalk';

// Guard rails for tuning. The simulated walker is greedy, so real walks yield
// roughly half of these numbers.

const ALL = ['bram', 'lyra', 'mira'];

function averageWalk(minutes: number, tools: string[] = ['ironPickaxe']) {
  const starts = [
    { latitude: -41.2865, longitude: 174.7762 },
    { latitude: 48.8566, longitude: 2.3522 },
    { latitude: 40.7128, longitude: -74.006 },
    { latitude: 35.6762, longitude: 139.6503 },
  ];
  const totals: Record<string, number> = {};
  const runs = starts.flatMap((start, i) =>
    [6, 12, 18].map((hour) =>
      simulateWalk(start, Date.UTC(2026, 9, 20 + i, hour), minutes, { ...createInitialSave(), tools }),
    ),
  );
  for (const save of runs) {
    for (const [id, amount] of Object.entries(save.materials)) totals[id] = (totals[id] ?? 0) + amount;
  }
  const avg = (id: string) => (totals[id] ?? 0) / runs.length;
  return {
    avg,
    ore: avg('wood') + avg('stone') + avg('copperOre') + avg('ironOre') + avg('coal'),
    metal: avg('copperOre') + avg('ironOre'),
    animal: avg('hide') + avg('bone') + avg('meat'),
    herb: avg('herb') + avg('berries') + avg('mushroom'),
    rare: avg('starMetal') + avg('moonpetal'),
  };
}

/** Every hero wears the `tier` weapon of their class and `tier` armor. */
function team(level: number, tier: Tier | null, elixirs = false): SaveData {
  let save: SaveData = {
    ...createInitialSave(),
    heroes: createInitialSave().heroes.map((h) => ({ ...h, level })),
    consumables: { fireResistanceElixir: 2 },
  };
  if (tier) {
    const loadout = { bram: 'Sword', lyra: 'Bow', mira: 'Wand' };
    save.gear = Object.entries(loadout).flatMap(([heroId, weapon]) => [
      { uid: `${heroId}-weapon`, itemId: `${tier}${weapon}`, durability: 10 },
      { uid: `${heroId}-armor`, itemId: `${tier}Armor`, durability: 10 },
    ]);
    for (const heroId of ALL) {
      save = equip(save, heroId, 'weapon', `${heroId}-weapon`);
      save = equip(save, heroId, 'armor', `${heroId}-armor`);
    }
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
    expect(walk.metal).toBeGreaterThan(8);
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

  it('gives a new player only wood, enough for the wooden pickaxe and a weapon', () => {
    const fresh = averageWalk(30, []);
    expect(fresh.avg('wood')).toBeGreaterThan(4);
    expect(fresh.ore).toBe(fresh.avg('wood'));
  });

  it('gives enough stone with the wooden pickaxe for the stone pickaxe', () => {
    expect(averageWalk(30, ['woodPickaxe']).avg('stone')).toBeGreaterThan(3);
  });
});

describe('expedition progression', () => {
  it('lets a fresh team usually clear the first dungeon, and wooden gear makes it easy', () => {
    expect(chance(team(1, null), 'goblinWarren')).toBeGreaterThan(0.6);
    expect(chance(team(1, 'wood'), 'goblinWarren')).toBeGreaterThan(0.8);
  });

  // Each later dungeon is a coin flip one tier below the gear that clears it comfortably.
  const steps: [dungeonId: string, level: number, coinFlip: Tier, comfortable: Tier][] = [
    ['trollBridge', 2, 'stone', 'copper'],
    ['collapsedMine', 3, 'copper', 'iron'],
    ['cinderHollow', 5, 'iron', 'steel'],
    ['wyrmSpire', 7, 'steel', 'steel'],
  ];
  it.each(steps)('makes %s a coin flip at level %i with %s gear', (dungeonId, level, coinFlip, comfortable) => {
    const elixirs = Boolean(dungeonById[dungeonId].hazard);
    const odds = chance(team(level, coinFlip, elixirs), dungeonId);
    expect(odds).toBeGreaterThan(0.35);
    expect(odds).toBeLessThan(0.65);
    if (comfortable !== coinFlip) expect(chance(team(level, comfortable, elixirs), dungeonId)).toBeGreaterThan(0.6);
  });

  it('keeps each dungeon out of reach with the gear of two tiers below', () => {
    expect(chance(team(2, 'wood'), 'trollBridge')).toBeLessThan(0.4);
    expect(chance(team(3, 'stone'), 'collapsedMine')).toBeLessThan(0.4);
    expect(chance(team(5, 'copper', true), 'cinderHollow')).toBeLessThan(0.4);
    expect(chance(team(7, 'iron'), 'wyrmSpire')).toBeLessThan(0.4);
  });

  it('rewards fire protection in Cinder Hollow', () => {
    const without = chance(team(5, 'iron'), 'cinderHollow');
    expect(chance(team(5, 'iron', true), 'cinderHollow')).toBeGreaterThan(without + 0.1);
  });
});
