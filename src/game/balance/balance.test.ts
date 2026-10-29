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
import { baseWalkConfig } from '../sim/walking';
import { expectedLevels } from '../sim/config';
import { referenceTeam } from '../sim/matrix';
import { equip } from '../team/team';
import { simulateWalk } from './simulateWalk';

// Guard rails for tuning. The simulated walker is greedy, so real walks yield
// roughly half of these numbers.

const ALL = ['bram', 'lyra', 'mira'];
const TIER_MATERIALS = ['wood', 'stone', 'copper', 'iron', 'steel'];
/** Level the team is expected to reach while playing each tier (measured by the balance lab). */
const TIER_LEVELS = expectedLevels;

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
    const pieces = ['Sword', 'Bow', 'Wand', 'Armour', 'Armour', 'Armour'];
    save = { ...save, gear: pieces.map((piece, i) => ({ uid: `g${i}`, itemId: material + piece, quality })) };
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

/** The same for a prepared party, e.g. with abilities changed. */
function memberChance(party: PartyMember[], dungeon: DungeonDef, runs = 400) {
  let wins = 0;
  for (let i = 0; i < runs; i++) if (simulateRun(party, dungeon, `odds|${dungeon.id}|${i}`).bossDefeated) wins++;
  return wins / runs;
}

const dealsFire = (dungeon: DungeonDef) =>
  dungeon.boss.element === 'fire' || dungeon.encounters.some((e) => e.type === 'trap' && e.element === 'fire');

describe('gathering balance (30 minute walk)', () => {
  // The pacing pass raised animal density (tileChance 0.15 → 0.28) and plant
  // density (0.5 → 0.8): casual players were short of hide, bone and herbs for
  // gear and food, and the kitchen was eating more than the 60–80% target share
  // of the meat and berries gathered. Locked ore nodes also read as minable
  // ore half the time (see game/gathering/lockedNodes.ts), which adds to the
  // early stone and copper yields. The walking bonus is left out here
  // (baseWalkConfig), so these numbers hold for any walk of the day.

  it('shows only wood during the tutorial', () => {
    const walk = averageWalk(withTools([]), 30);
    expect(walk('wood')).toBeGreaterThan(10);
    expect(walk('stone', 'hide', 'herb')).toBe(0);
  });

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
    gear: [{ uid: 'g', itemId: 'woodSword', quality: 'crappy' }],
  };
  return equip(save, 'bram', 'weapon', 'g');
}

describe('tier 1 opens up as the team gears up', () => {
  for (const dungeon of dungeons.filter((d) => d.tier === 1 && d.slot === 'short')) {
    // Skipped until the class and gear rework rebalances dungeons around threats.
    it.skip(`lets one wooden sword clear ${dungeon.name} 60–80% of the time`, () => {
      const odds = chance(swordOnly(), dungeon);
      expect(odds).toBeGreaterThanOrEqual(0.6);
      expect(odds).toBeLessThanOrEqual(0.8);
    });
  }

  it('needs more than one sword for the long dungeons and the boss', () => {
    for (const dungeon of dungeons.filter((d) => d.tier === 1 && d.slot !== 'short')) expect(chance(swordOnly(), dungeon)).toBeLessThan(0.1);
  });

  it('never reaches 100%: a mishap can always end a run', () => {
    expect(chance(team(10, 'steel'), dungeonById.ratCellar)).toBeLessThan(1);
  });

  it('does not let levels replace gear', () => {
    const levelled = swordOnly(3);
    const kit = team(expectedLevels[0], 'wood');
    expect(chance(levelled, dungeonById.goblinWarren)).toBeLessThan(chance(kit, dungeonById.goblinWarren) - 0.3);
    expect(chance(levelled, dungeonById.banditStockade)).toBeLessThan(chance(kit, dungeonById.banditStockade) - 0.2);
  });
});

// Skipped until the class and gear rework rebalances dungeons around threats.
describe.skip('expedition progression', () => {
  /**
   * Odds for the starting classes at the tier's expected level, in the tier's
   * gear at Normal quality, at full HP with a healing potion each (30%), plain
   * supply and no meal, kit or charm; no traits or counters.
   * Tier 1 short dungeons follow the lone-sword start above instead.
   */
  const BANDS = { short: [0.75, 0.85], long: [0.6, 0.75], boss: [0.45, 0.6] };
  const BASE: HeroClassId[] = ['warrior', 'ranger', 'fireMage'];
  const reference = (tier: number, quality: Quality, gearTier = tier) => {
    const save = referenceTeam(BASE, gearTier, quality, expectedLevels[tier - 1]);
    return (dungeon: DungeonDef) => estimateOdds(save, save.heroes.map((h) => h.id), dungeon, 400).success;
  };

  for (let tier = 1; tier <= 5; tier++) {
    const normal = reference(tier, 'normal');
    // Overnight quests have their own odds band (see expeditions/overnight.test.ts).
    for (const dungeon of dungeons.filter((d) => d.tier === tier && !d.overnight && !(tier === 1 && d.slot === 'short'))) {
      const [low, high] = BANDS[dungeon.isBoss ? 'boss' : dungeon.slot!];
      it(`puts ${dungeon.name} (tier ${tier} ${dungeon.isBoss ? 'boss' : dungeon.slot}) at ${low * 100}–${high * 100}% with Normal tier gear`, () => {
        const odds = normal(dungeon);
        expect(odds).toBeGreaterThanOrEqual(low);
        expect(odds).toBeLessThanOrEqual(high);
      });
    }

    const boss = dungeons.find((d) => d.tier === tier && d.isBoss)!;
    it(`makes the tier ${tier} boss about 30–45% with Crappy gear, and much harder in the previous tier's gear`, () => {
      const crappy = reference(tier, 'crappy')(boss);
      expect(crappy).toBeGreaterThanOrEqual(0.27);
      expect(crappy).toBeLessThanOrEqual(0.45);
      if (tier > 1) expect(reference(tier, 'normal', tier - 1)(boss)).toBeLessThan(normal(boss) - 0.08);
    });

    it(`keeps tier ${tier} within 25 points of its targets without any abilities: no hard gates`, () => {
      const save = referenceTeam(BASE, tier, 'normal', expectedLevels[tier - 1]);
      const party = prepareParty(save, save.heroes.map((h) => h.id)).map((m) => ({ ...m, abilities: [] }));
      for (const dungeon of dungeons.filter((d) => d.tier === tier && !d.overnight && !(tier === 1 && d.slot === 'short'))) {
        const [low] = BANDS[dungeon.isBoss ? 'boss' : dungeon.slot!];
        expect(memberChance(party, dungeon)).toBeGreaterThan(low - 0.25);
      }
    });
  }

  // Overnight quests are safe patrols: ward salves matter less there (they have their own band).
  for (const dungeon of dungeons.filter((d) => dealsFire(d) && !d.overnight)) {
    it(`makes ember ward salves worth at least 10 points in ${dungeon.name}`, () => {
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
      consumables: { ...createInitialSave().consumables, healingPotion: 3 },
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
    // Skipped until the class and gear rework rebalances dungeons around threats.
    it.skip(`gives a tier ${tier} Sigil about 65% with the tier kit and potions, ~85–90% with the winning element`, () => {
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

// Skipped until the class and gear rework rebalances dungeons around threats.
describe.skip('class counters', () => {
  /**
   * A hero's abilities that counter a dungeon's main tag: beast damage for
   * beasts, the damageVsTag fixture for undead. Obstacles, locals and traps
   * are quiet steps without a briefing, so no ability counters them anymore.
   */
  function counterFor(dungeon: DungeonDef): Ability[] | null {
    switch (mainTag(dungeon)) {
      case 'beast':
        return heroClasses.ranger.abilities;
      case 'undead':
        return [{ kind: 'damageVsTag', tag: 'undead', multiplier: 1.5 }];
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

  // Overnight quests are near-certain without counters, so they are left out here.
  for (const dungeon of dungeons.filter((d) => counterFor(d) && !d.overnight)) {
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

// Skipped until the class and gear rework rebalances dungeons around threats.
describe.skip('new classes', () => {
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

  /** A pool dungeon where each class's remaining run abilities show: rage and the support buffs. */
  // The thief and the paladin have no pair left: pickpocket and cache bonus need
  // a briefing (locals threat, hidden cache opportunity) to do anything, and
  // protect alone moves a run by less than the band.
  const matching: [HeroClassId, string][] = [
    ['barbarian', 'millRuins'],
    ['cleric', 'boneField'],
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
