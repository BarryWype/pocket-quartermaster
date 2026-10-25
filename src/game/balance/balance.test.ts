import { dungeons } from '@/content/dungeons';
import { elementRules } from '@/content/elements';
import { sanctums } from '@/content/sanctums';
import type { DungeonDef } from '@/game/types';

import type { Element } from '../elements';
import { estimateOdds } from '../expeditions/odds';
import { sanctumOdds } from '../sanctums/sanctums';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import { simulateWalk } from './simulateWalk';

// Guard rails for tuning. The simulated walker is greedy, so real walks yield
// roughly half of these numbers.

const ALL = ['bram', 'lyra', 'mira'];
const TIER_MATERIALS = ['wood', 'stone', 'copper', 'iron', 'steel'];
/** Level the team is expected to reach while playing each tier. */
const TIER_LEVELS = [1, 3, 5, 7, 9];

const withTools = (tools: string[]): SaveData => ({
  ...createInitialSave(),
  tools,
  tutorial: { step: tools.length ? 'done' : 'collectWood', woodSpot: null },
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
    [6, 12, 18].map((hour) => simulateWalk(save, start, Date.UTC(2026, 9, 20 + i, hour), minutes)),
  );
  for (const run of runs) {
    for (const [id, amount] of Object.entries(run.materials)) totals[id] = (totals[id] ?? 0) + amount;
  }
  return (...ids: string[]) => ids.reduce((sum, id) => sum + (totals[id] ?? 0), 0) / runs.length;
}

/** Every hero in the tier's weapon and armour; fire elixirs for heroes who need them. */
function team(level: number, material: string | null, elixirs = false): SaveData {
  let save: SaveData = {
    ...createInitialSave(),
    heroes: createInitialSave().heroes.map((h) => ({ ...h, level })),
    consumables: { fireResistanceElixir: 2 },
  };
  if (material) {
    const pieces = ['Sword', 'Bow', 'Wand', 'Armour', 'Armour', 'Armour'];
    save = { ...save, gear: pieces.map((piece, i) => ({ uid: `g${i}`, itemId: material + piece, durability: 99 })) };
    ALL.forEach((heroId, i) => {
      save = equip(save, heroId, 'weapon', `g${i}`);
      save = equip(save, heroId, 'armor', `g${i + 3}`);
    });
  }
  if (elixirs) {
    save = equip(save, 'bram', 'consumable', 'fireResistanceElixir');
    save = equip(save, 'lyra', 'consumable', 'fireResistanceElixir');
  }
  return save;
}

/** Simulated success rate; enough runs that a couple of points of noise don't flip a test. */
const chance = (save: SaveData, dungeon: DungeonDef) => estimateOdds(save, ALL, dungeon, 400).success;

const dealsFire = (dungeon: DungeonDef) =>
  dungeon.boss.element === 'fire' || dungeon.encounters.some((e) => e.type === 'trap' && e.element === 'fire');

describe('gathering balance (30 minute walk)', () => {
  it('shows only wood during the tutorial', () => {
    const walk = averageWalk(withTools([]), 30);
    expect(walk('wood')).toBeGreaterThan(10);
    expect(walk('stone', 'hide', 'herb')).toBe(0);
  });

  it('gives enough wood and stone for a couple of pieces of gear with the wooden pickaxe', () => {
    const walk = averageWalk(withTools(['woodPickaxe']), 30);
    expect(walk('wood')).toBeGreaterThan(15);
    expect(walk('wood')).toBeLessThan(40);
    expect(walk('stone')).toBeGreaterThan(7);
    expect(walk('stone')).toBeLessThan(25);
    expect(walk('copper', 'iron', 'coal')).toBe(0);
  });

  it('keeps animal and herb materials in the same range as ore', () => {
    const walk = averageWalk(withTools(['woodPickaxe']), 30);
    expect(walk('hide', 'bone', 'meat')).toBeGreaterThan(10);
    expect(walk('hide', 'bone', 'meat')).toBeLessThan(45);
    expect(walk('herb', 'berries', 'mushroom')).toBeGreaterThan(4);
    expect(walk('herb', 'berries', 'mushroom')).toBeLessThan(25);
  });

  it('opens copper, iron and coal with the better pickaxes', () => {
    const walk = averageWalk(withTools(['woodPickaxe', 'stonePickaxe', 'copperPickaxe', 'ironPickaxe']), 30);
    expect(walk('copper')).toBeGreaterThan(3);
    expect(walk('iron')).toBeGreaterThan(2);
    expect(walk('coal')).toBeGreaterThan(3);
  });
});

/** Tier 1 team states, all at level 1 unless given. */
function swordOnly(level = 1): SaveData {
  const save: SaveData = {
    ...createInitialSave(),
    heroes: createInitialSave().heroes.map((h) => ({ ...h, level })),
    gear: [{ uid: 'g', itemId: 'woodSword', durability: 15 }],
  };
  return equip(save, 'bram', 'weapon', 'g');
}

function fullKitWithPotions(): SaveData {
  let save: SaveData = { ...team(1, 'wood'), consumables: { healingPotion: 3 } };
  ALL.forEach((heroId) => {
    save = equip(save, heroId, 'consumable', 'healingPotion');
  });
  return save;
}

describe('tier 1 odds open up as the team gears up', () => {
  const [cellar, warren, stockade] = dungeons.filter((d) => d.tier === 1);
  // [dungeon, team, low, high]: the design targets with about ±10 points of room.
  const cases: [string, () => SaveData, DungeonDef, number, number][] = [
    ['one wooden sword', swordOnly, cellar, 0.65, 0.85],
    // By design one sword is not enough for Goblin Warren: forge more first.
    ['one wooden sword', swordOnly, warren, 0, 0.1],
    ['one wooden sword', swordOnly, stockade, 0, 0.1],
    ['full wooden kit', () => team(1, 'wood'), cellar, 0.88, 0.98],
    ['full wooden kit', () => team(1, 'wood'), warren, 0.6, 0.8],
    ['full wooden kit', () => team(1, 'wood'), stockade, 0.25, 0.45],
    ['full kit and potions', fullKitWithPotions, cellar, 0.88, 0.98],
    ['full kit and potions', fullKitWithPotions, warren, 0.75, 0.95],
    ['full kit and potions', fullKitWithPotions, stockade, 0.68, 0.9],
  ];
  for (const [label, makeTeam, dungeon, low, high] of cases) {
    it(`${label}: ${dungeon.name} between ${low * 100}% and ${high * 100}%`, () => {
      const odds = chance(makeTeam(), dungeon);
      expect(odds).toBeGreaterThanOrEqual(low);
      expect(odds).toBeLessThanOrEqual(high);
    });
  }

  it('never reaches 100%: a mishap can always end a run', () => {
    expect(chance(team(5, 'steel'), cellar)).toBeLessThan(1);
  });

  it('does not let levels replace gear', () => {
    const levelled = swordOnly(3);
    expect(chance(levelled, warren)).toBeLessThan(chance(team(1, 'wood'), warren) - 0.3);
    expect(chance(levelled, stockade)).toBeLessThan(chance(team(1, 'wood'), stockade) - 0.2);
  });
});

describe('expedition progression', () => {

  for (let tier = 1; tier <= 5; tier++) {
    const [first, second, boss] = dungeons.filter((d) => d.tier === tier);
    const level = TIER_LEVELS[tier - 1];
    const current = team(level, TIER_MATERIALS[tier - 1], true);
    const previous = team(level, tier > 1 ? TIER_MATERIALS[tier - 2] : null, true);

    it(`makes tier ${tier}'s first dungeon comfortable with tier ${tier} gear`, () => {
      expect(chance(current, first)).toBeGreaterThan(0.65);
    });

    it(`gets harder through tier ${tier}`, () => {
      expect(chance(current, second)).toBeLessThan(chance(current, first));
      expect(chance(current, boss)).toBeLessThan(chance(current, second));
    });

    it(`makes the tier ${tier} boss a real fight that needs tier ${tier} gear`, () => {
      expect(chance(current, boss)).toBeGreaterThan(0.3);
      expect(chance(current, boss)).toBeLessThan(0.6);
      expect(chance(previous, boss)).toBeLessThan(chance(current, boss) - 0.08);
    });
  }

  for (const dungeon of dungeons.filter(dealsFire)) {
    it(`makes fire resistance elixirs worth at least 10 points in ${dungeon.name}`, () => {
      const level = TIER_LEVELS[dungeon.tier - 1];
      const material = TIER_MATERIALS[dungeon.tier - 1];
      expect(chance(team(level, material, true), dungeon)).toBeGreaterThan(chance(team(level, material), dungeon) + 0.1);
    });
  }
});

describe('Sanctum guardians', () => {
  /** The element that beats `element`. */
  const beater = (element: Element) =>
    (Object.keys(elementRules.beats) as Element[]).find((e) => elementRules.beats[e] === element)!;

  /** Full tier kit and a potion each; optionally every weapon of one element. */
  function prepared(tier: number, weaponElement?: Element): SaveData {
    let save: SaveData = {
      ...team(TIER_LEVELS[tier - 1], TIER_MATERIALS[tier - 1]),
      consumables: { healingPotion: 3 },
    };
    save = { ...save, gear: save.gear.map((g, i) => (i < 3 ? { ...g, element: weaponElement } : g)) };
    ALL.forEach((heroId) => {
      save = equip(save, heroId, 'consumable', 'healingPotion');
    });
    return save;
  }

  const average = (tier: number, elemental: boolean) =>
    sanctums.reduce(
      (sum, s) => sum + sanctumOdds(prepared(tier, elemental ? beater(s.element) : undefined), ALL, s, tier, 300).success,
      0,
    ) / sanctums.length;

  for (let tier = 1; tier <= 5; tier++) {
    it(`gives a tier ${tier} Sigil about 65% with the tier kit and potions, ~85–90% with the winning element`, () => {
      const plain = average(tier, false);
      expect(plain).toBeGreaterThan(0.57);
      expect(plain).toBeLessThan(0.73);
      const elemental = average(tier, true);
      expect(elemental).toBeGreaterThan(0.8);
      expect(elemental).toBeLessThan(0.96);
    });
  }

  it('lets every tier 1 guardian be beaten without elemental gear', () => {
    for (const sanctum of sanctums) expect(sanctumOdds(prepared(1), ALL, sanctum, 1, 300).success).toBeGreaterThan(0.45);
  });
});
