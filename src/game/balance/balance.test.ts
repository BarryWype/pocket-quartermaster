import { dungeons } from '@/content/dungeons';
import { dungeonById } from '@/content/lookup';
import { tierMaterials } from '@/content/materials';
import type { DungeonDef, Quality } from '@/game/types';

import { estimateOdds } from '../expeditions/odds';
import { createInitialSave, type SaveData } from '../save';
import { baseWalkConfig } from '../sim/walking';
import { equip } from '../team/team';
import { simulateWalk } from './simulateWalk';

// Guard rails for tuning. The simulated walker is greedy, so real walks yield
// roughly half of these numbers.

const ALL = ['bram', 'lyra', 'mira'];

const withTools = (tools: string[]): SaveData => ({
  ...createInitialSave(),
  tools,
  tutorial: { ...createInitialSave().tutorial, step: tools.length ? 'done' : 'gatherWood' },
});

function averageWalk(save: SaveData, minutes: number) {
  const starts = [
    { latitude: -41.2865, longitude: 174.7762 },
    { latitude: 48.8566, longitude: 2.3522 },
    { latitude: 40.7128, longitude: -74.006 },
    { latitude: 35.6762, longitude: 139.6503 },
  ];
  const totals: Record<string, number> = {};
  const runs = starts.flatMap((start, i) =>
    [6, 12, 18].map((hour) => simulateWalk(save, start, Date.UTC(2026, 9, 20 + i, hour), minutes, baseWalkConfig)),
  );
  for (const run of runs) {
    for (const [id, amount] of Object.entries(run.materials)) totals[id] = (totals[id] ?? 0) + amount;
  }
  return (...ids: string[]) => ids.reduce((sum, id) => sum + (totals[id] ?? 0), 0) / runs.length;
}

/** Every hero in the tier's weapon and armour (Normal unless given); ember ward salves for heroes who need them. */
function team(level: number, material: string | null, elixirs = false, quality: Quality = 'normal'): SaveData {
  let save: SaveData = {
    ...createInitialSave(),
    heroes: createInitialSave().heroes.map((h) => ({ ...h, level })),
    consumables: { ...createInitialSave().consumables, emberWardSalve: 2 },
  };
  if (material) {
    const gearTier = tierMaterials.indexOf(material) + 1;
    const pieces = [`sword${gearTier}`, `bow${gearTier}`, `wand${gearTier}`, `mail${gearTier}`, `mail${gearTier}`, `mail${gearTier}`];
    save = { ...save, gear: pieces.map((piece, i) => ({ uid: `g${i}`, itemId: piece, quality })) };
    ALL.forEach((heroId, i) => {
      save = equip(save, heroId, 'weapon', `g${i}`);
      save = equip(save, heroId, 'armor', `g${i + 3}`);
    });
  }
  if (elixirs) {
    save = equip(save, 'bram', 'consumable', 'emberWardSalve');
    save = equip(save, 'lyra', 'consumable', 'emberWardSalve');
  }
  return save;
}

/** Simulated success rate; enough runs that a couple of points of noise don't flip a test. */
const chance = (save: SaveData, dungeon: DungeonDef) => estimateOdds(save, ALL, dungeon, 400).success;

describe('gathering balance (30 minute walk)', () => {
  // The pacing pass raised animal density (tileChance 0.15 → 0.28) and plant
  // density (0.5 → 0.8): casual players were short of hide, bone and herbs for
  // gear and food, and the kitchen was eating more than the 60–80% target share
  // of the meat and berries gathered. Locked ore nodes also read as minable
  // ore half the time (see game/gathering/lockedNodes.ts), which adds to the
  // early stone and copper yields. The walking bonus is left out here
  // (baseWalkConfig), so these numbers hold for any walk of the day.

  it('gives enough wood and stone for a couple of pieces of gear with the wooden pickaxe', () => {
    const walk = averageWalk(withTools(['woodPickaxe']), 30);
    expect(walk('wood')).toBeGreaterThan(15);
    expect(walk('wood')).toBeLessThan(40);
    // Stone includes converted locked nodes (copper veins reading as stone).
    expect(walk('stone')).toBeGreaterThan(10);
    expect(walk('stone')).toBeLessThan(25);
    expect(walk('copper', 'iron', 'coal')).toBe(0);
  });

  it('keeps animal and herb materials in the same range as ore', () => {
    const walk = averageWalk(withTools(['woodPickaxe']), 30);
    expect(walk('hide', 'bone', 'meat')).toBeGreaterThan(15);
    expect(walk('hide', 'bone', 'meat')).toBeLessThan(45);
    expect(walk('herb', 'berries', 'mushroom')).toBeGreaterThan(10);
    expect(walk('herb', 'berries', 'mushroom')).toBeLessThan(25);
  });

  it('opens copper, iron and coal with the better pickaxes', () => {
    const walk = averageWalk(withTools(['woodPickaxe', 'stonePickaxe', 'copperPickaxe', 'ironPickaxe']), 30);
    expect(walk('copper')).toBeGreaterThan(3);
    expect(walk('iron')).toBeGreaterThan(2);
    expect(walk('coal')).toBeGreaterThan(3);
  });
});

// A new player starts with the tutorial's Crappy wooden sword: tier 1's short
// dungeons are where they earn the rest of the wooden kit.

/** Tier 1 team states, all at level 1 unless given. */
function swordOnly(level = 1): SaveData {
  const save: SaveData = {
    ...createInitialSave(),
    heroes: createInitialSave().heroes.map((h) => ({ ...h, level })),
    gear: [{ uid: 'g', itemId: 'sword1', quality: 'crappy' }],
  };
  return equip(save, 'bram', 'weapon', 'g');
}

describe('tier 1 opens up as the team gears up', () => {
  it('needs more than one sword for the long dungeons and the boss', () => {
    for (const dungeon of dungeons.filter((d) => d.tier === 1 && d.slot !== 'short')) expect(chance(swordOnly(), dungeon)).toBeLessThan(0.1);
  });

  it('never reaches 100%: a mishap can always end a run', () => {
    expect(chance(team(10, 'steel'), dungeonById.ratCellar)).toBeLessThan(1);
  });

  it('does not let levels replace gear', () => {
    // The boss is tuned past the reference kit at the band's top: compare two levels up.
    const levelled = swordOnly(5);
    const kit = team(5, 'wood');
    expect(chance(levelled, dungeonById.goblinWarren)).toBeLessThan(chance(kit, dungeonById.goblinWarren) - 0.3);
    expect(chance(levelled, dungeonById.banditStockade)).toBeLessThan(chance(kit, dungeonById.banditStockade) - 0.2);
  });
});
