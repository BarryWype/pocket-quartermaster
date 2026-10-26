import { dungeons } from '@/content/dungeons';
import { elementRules } from '@/content/elements';
import { sanctums } from '@/content/sanctums';
import { heroClasses, newHero } from '@/content/heroes';
import { items } from '@/content/items';
import { dungeonById } from '@/content/lookup';
import type { Ability, DungeonDef, HeroClassId, Quality, WeaponType } from '@/game/types';

import type { Element } from '../elements';
import { mainTag } from '../dungeons/tags';
import { estimateOdds } from '../expeditions/odds';
import { prepareParty, simulateRun, type PartyMember } from '../expeditions/simulate';
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

/** Every hero in the tier's weapon and armour (Normal unless given); fire elixirs for heroes who need them. */
function team(level: number, material: string | null, elixirs = false, quality: Quality = 'normal'): SaveData {
  let save: SaveData = {
    ...createInitialSave(),
    heroes: createInitialSave().heroes.map((h) => ({ ...h, level })),
    consumables: { fireResistanceElixir: 2 },
  };
  if (material) {
    const pieces = ['Sword', 'Bow', 'Wand', 'Armour', 'Armour', 'Armour'];
    save = { ...save, gear: pieces.map((piece, i) => ({ uid: `g${i}`, itemId: material + piece, quality })) };
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

/** The same for a prepared party, e.g. with abilities changed. */
function memberChance(party: PartyMember[], dungeon: DungeonDef, runs = 400) {
  let wins = 0;
  for (let i = 0; i < runs; i++) if (simulateRun(party, dungeon, `odds|${dungeon.id}|${i}`).bossDefeated) wins++;
  return wins / runs;
}

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

// Tier 1 targets use Crappy gear: what a new player actually forges.

/** Tier 1 team states, all at level 1 unless given. */
function swordOnly(level = 1): SaveData {
  const save: SaveData = {
    ...createInitialSave(),
    heroes: createInitialSave().heroes.map((h) => ({ ...h, level })),
    gear: [{ uid: 'g', itemId: 'woodSword', quality: 'crappy' }],
  };
  return equip(save, 'bram', 'weapon', 'g');
}

const woodKit = () => team(1, 'wood', false, 'crappy');

function fullKitWithPotions(): SaveData {
  let save: SaveData = { ...woodKit(), consumables: { healingPotion: 3 } };
  ALL.forEach((heroId) => {
    save = equip(save, heroId, 'consumable', 'healingPotion');
  });
  return save;
}

describe('tier 1 odds open up as the team gears up', () => {
  const [cellar, warren, stockade] = [dungeonById.ratCellar, dungeonById.goblinWarren, dungeonById.banditStockade];
  // [dungeon, team, low, high]: the design targets with about ±10 points of room.
  const cases: [string, () => SaveData, DungeonDef, number, number][] = [
    ['one wooden sword', swordOnly, cellar, 0.65, 0.85],
    // By design one sword is not enough for Goblin Warren: forge more first.
    ['one wooden sword', swordOnly, warren, 0, 0.1],
    ['one wooden sword', swordOnly, stockade, 0, 0.1],
    ['full wooden kit', woodKit, cellar, 0.88, 0.98],
    ['full wooden kit', woodKit, warren, 0.6, 0.8],
    ['full wooden kit', woodKit, stockade, 0.25, 0.45],
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
    expect(chance(levelled, warren)).toBeLessThan(chance(woodKit(), warren) - 0.3);
    expect(chance(levelled, stockade)).toBeLessThan(chance(woodKit(), stockade) - 0.2);
  });
});

describe('expedition progression', () => {
  /** What each slot should give the tier's geared team; counters may move it, but not by more than 25 points. */
  const TARGETS = { short: 0.65, long: 0.45, boss: 0.3 };

  for (let tier = 1; tier <= 5; tier++) {
    const inTier = dungeons.filter((d) => d.tier === tier);
    const boss = inTier.find((d) => d.isBoss)!;
    const shorts = inTier.filter((d) => d.slot === 'short');
    const longs = inTier.filter((d) => d.slot === 'long');
    const level = TIER_LEVELS[tier - 1];
    const current = team(level, TIER_MATERIALS[tier - 1], true);
    const previous = team(level, tier > 1 ? TIER_MATERIALS[tier - 2] : null, true);

    for (const dungeon of shorts) {
      it(`makes ${dungeon.name} (tier ${tier} short) comfortable with tier ${tier} gear`, () => {
        expect(chance(current, dungeon)).toBeGreaterThan(TARGETS.short);
      });
    }

    for (const dungeon of longs) {
      it(`makes ${dungeon.name} (tier ${tier} long) harder than the short ones, but above ${TARGETS.long * 100}%`, () => {
        const odds = chance(current, dungeon);
        expect(odds).toBeGreaterThan(TARGETS.long);
        expect(odds).toBeLessThan(Math.min(...shorts.map((d) => chance(current, d))));
      });
    }

    it(`makes the tier ${tier} boss a real fight that needs tier ${tier} gear`, () => {
      expect(chance(current, boss)).toBeGreaterThan(0.3);
      expect(chance(current, boss)).toBeLessThan(0.6);
      expect(chance(previous, boss)).toBeLessThan(chance(current, boss) - 0.08);
    });

    it(`keeps tier ${tier} within 25 points of its targets without any class counters`, () => {
      const party = prepareParty(current, ALL).map((m) => ({ ...m, abilities: [] }));
      for (const dungeon of inTier) {
        const target = dungeon.isBoss ? TARGETS.boss : TARGETS[dungeon.slot!];
        expect(memberChance(party, dungeon)).toBeGreaterThan(target - 0.25);
      }
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

describe('class counters', () => {
  /** A hero's abilities that counter a dungeon's main tag: the existing classes', plus fixtures for later ones. */
  function counterFor(dungeon: DungeonDef): Ability[] | null {
    const kinds = [...new Set(dungeon.encounters.flatMap((e) => (e.type === 'obstacle' ? [e.kind] : [])))];
    switch (mainTag(dungeon)) {
      case 'beast':
        return heroClasses.ranger.abilities;
      case 'trap':
        return heroClasses.ranger.abilities;
      case 'obstacle':
        return [{ kind: 'obstacleSolve', kinds }];
      case 'undead':
        return [{ kind: 'damageVsTag', tag: 'undead', multiplier: 1.5 }];
      case 'locals':
        return [{ kind: 'localsReaction', key: 'charm' }];
      default:
        // Elements: no class counters them yet.
        return null;
    }
  }

  /** Teams a player might bring, from the tier's full kit down to a lone wooden sword. */
  const candidates = (tier: number): SaveData[] => [
    team(TIER_LEVELS[tier - 1], TIER_MATERIALS[tier - 1]),
    team(TIER_LEVELS[tier - 1], TIER_MATERIALS[tier - 1], false, 'crappy'),
    tier > 1 ? team(TIER_LEVELS[tier - 1], TIER_MATERIALS[tier - 2]) : swordOnly(),
  ];

  for (const dungeon of dungeons.filter(counterFor)) {
    it(`gives ${dungeon.name} (${mainTag(dungeon)}) 5 to 25 points for a hero who counters it`, () => {
      // Without abilities, then with the counter on one hero. Measured on the team whose odds are most in doubt.
      const plainParty = (save: SaveData) => prepareParty(save, ALL).map((m) => ({ ...m, abilities: [] as Ability[] }));
      const [base, plain] = candidates(dungeon.tier)
        .map((save) => [plainParty(save), memberChance(plainParty(save), dungeon)] as const)
        .sort((a, b) => Math.abs(a[1] - 0.6) - Math.abs(b[1] - 0.6))[0];
      const countered = memberChance(
        base.map((m, i) => (i === 0 ? { ...m, abilities: counterFor(dungeon)! } : m)),
        dungeon,
      );
      expect(countered - plain).toBeGreaterThanOrEqual(0.05);
      expect(countered - plain).toBeLessThanOrEqual(0.25);
    });
  }
});

describe('new classes', () => {
  const STANDARD = ['bram', 'lyra', 'mira'];
  /** The tier's kit for any party: each hero gets a weapon of their class and the tier's armour. */
  function roster(tier: number, classes: HeroClassId[], quality: Quality = 'normal'): SaveData {
    const material = TIER_MATERIALS[tier - 1];
    let save: SaveData = { ...createInitialSave(), heroes: [], gear: [] };
    classes.forEach((classId, i) => {
      const id = STANDARD[i] ?? `h${i}`;
      const weaponType = Object.keys(heroClasses[classId].affinities)[0] as WeaponType;
      const weapon = items.find((item) => item.slot === 'weapon' && item.weaponType === weaponType && item.id.startsWith(material))!;
      save = {
        ...save,
        heroes: [...save.heroes, { ...newHero(id, id, classId, 'tough', TIER_LEVELS[tier - 1]) }],
        gear: [...save.gear, { uid: `w${i}`, itemId: weapon.id, quality }, { uid: `a${i}`, itemId: `${material}Armour`, quality }],
      };
      save = equip(equip(save, id, 'weapon', `w${i}`), id, 'armor', `a${i}`);
    });
    return save;
  }
  const odds = (save: SaveData, dungeon: DungeonDef) => memberChance(prepareParty(save, save.heroes.map((h) => h.id)), dungeon);
  const NEW: HeroClassId[] = ['frostMage', 'thief', 'barbarian', 'cleric', 'paladin', 'druid', 'troubadour', 'sorcerer'];
  const BASE: HeroClassId[] = ['warrior', 'ranger', 'fireMage'];

  /** Only fights, against enemies with no tags, so no ability but raw combat matters. */
  const untagged = (dungeon: DungeonDef): DungeonDef => ({
    ...dungeon,
    encounters: dungeon.encounters.filter((e) => e.type === 'fight' || e.type === 'event'),
  });
  const cases: [number, DungeonDef][] = [
    [1, untagged(dungeonById.goblinWarren)],
    [4, untagged(dungeonById.orcWarcamp)],
  ];

  for (const classId of NEW) {
    it(`lets a ${heroClasses[classId].name.toLowerCase()} stand in for a starting hero within 15 points`, () => {
      for (const [tier, dungeon] of cases) {
        const standard = odds(roster(tier, BASE), dungeon);
        const swaps = BASE.map((_, i) => odds(roster(tier, BASE.map((c, j) => (j === i ? classId : c))), dungeon) - standard);
        const average = swaps.reduce((sum, d) => sum + d, 0) / swaps.length;
        expect(Math.abs(average)).toBeLessThan(0.15);
      }
    });
  }

  /** A pool dungeon each class counters, by its main tag. */
  const matching: [HeroClassId, string][] = [
    ['thief', 'clockworkVault'],
    ['barbarian', 'millRuins'],
    ['cleric', 'boneField'],
    ['paladin', 'oldGraveyard'],
    ['druid', 'wolfDen'],
    ['troubadour', 'smugglersCove'],
  ];
  for (const [classId, dungeonId] of matching) {
    it(`gives ${dungeonById[dungeonId].name} 5 to 25 points for a ${heroClasses[classId].name.toLowerCase()}'s abilities`, () => {
      const dungeon = dungeonById[dungeonId];
      const plainParty = (save: SaveData) => prepareParty(save, ALL).map((m) => ({ ...m, abilities: [] as Ability[] }));
      const options = [
        team(TIER_LEVELS[dungeon.tier - 1], TIER_MATERIALS[dungeon.tier - 1]),
        team(TIER_LEVELS[dungeon.tier - 1], TIER_MATERIALS[dungeon.tier - 1], false, 'crappy'),
        dungeon.tier > 1 ? team(TIER_LEVELS[dungeon.tier - 1], TIER_MATERIALS[dungeon.tier - 2]) : swordOnly(),
      ];
      const [base, plain] = options
        .map((save) => [plainParty(save), memberChance(plainParty(save), dungeon)] as const)
        .sort((a, b) => Math.abs(a[1] - 0.6) - Math.abs(b[1] - 0.6))[0];
      const countered = memberChance(
        base.map((m, i) => (i === 0 ? { ...m, abilities: heroClasses[classId].abilities } : m)),
        dungeon,
      );
      expect(countered - plain).toBeGreaterThanOrEqual(0.05);
      expect(countered - plain).toBeLessThanOrEqual(0.25);
    });
  }

  for (const classId of ['troubadour', 'cleric', 'paladin'] as HeroClassId[]) {
    it(`makes a ${heroClasses[classId].name.toLowerCase()} worth taking on a long dungeon, mostly for their support`, () => {
      const dungeon = dungeonById.trollBridge;
      // Crappy gear keeps the run in doubt, where support shows.
      const save = roster(2, ['warrior', 'ranger', classId], 'crappy');
      const party = prepareParty(save, save.heroes.map((h) => h.id));
      const withSupport = memberChance(party, dungeon);
      const withoutThem = memberChance(party.slice(0, 2), dungeon);
      const supportStripped = memberChance(party.map((m, i) => (i === 2 ? { ...m, abilities: [] } : m)), dungeon);
      expect(withSupport).toBeGreaterThan(withoutThem);
      expect(withSupport).toBeGreaterThan(supportStripped);
    });
  }
});
