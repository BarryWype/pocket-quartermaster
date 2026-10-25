import { dungeons } from '@/content/dungeons';
import { dungeonById } from '@/content/lookup';

import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import { fastForward, resolveDue, resolveExpedition, startExpedition, successChance, teamPower } from './expeditions';

const ALL = ['bram', 'lyra', 'mira'];
const MIN = 60_000;

function geared(): SaveData {
  let save: SaveData = {
    ...createInitialSave(),
    gear: [
      { uid: 'g1', itemId: 'ironSword', durability: 30 },
      { uid: 'g2', itemId: 'ironBow', durability: 30 },
      { uid: 'g3', itemId: 'ironWand', durability: 30 },
      { uid: 'g4', itemId: 'ironArmor', durability: 30 },
    ],
    consumables: { healingPotion: 1, fireResistanceElixir: 1 },
    nextUid: 10,
  };
  save = equip(save, 'bram', 'weapon', 'g1');
  save = equip(save, 'lyra', 'weapon', 'g2');
  save = equip(save, 'mira', 'weapon', 'g3');
  save = equip(save, 'bram', 'armor', 'g4');
  return equip(save, 'bram', 'consumable', 'healingPotion');
}

/** Runs the same expedition with many seeds; resolution is deterministic per seed. */
function outcomes(save: SaveData, dungeonId: string, runs = 200) {
  return Array.from({ length: runs }, (_, i) => {
    const started = startExpedition({ ...save, nextUid: i }, dungeonId, ALL, 0);
    return resolveExpedition(started, started.expeditions[0]);
  });
}

describe('startExpedition', () => {
  it('creates a timed expedition with the dungeon duration', () => {
    const save = startExpedition(createInitialSave(), 'trollBridge', ['bram'], 1000);
    expect(save.expeditions[0]).toMatchObject({ dungeonId: 'trollBridge', heroIds: ['bram'], endsAt: 1000 + 20 * MIN });
  });

  it('scales duration in debug mode', () => {
    const save = startExpedition(createInitialSave(), 'trollBridge', ['bram'], 0, 1 / 60);
    expect(save.expeditions[0].endsAt).toBe(20_000);
  });

  it('rejects busy heroes and empty parties', () => {
    const save = startExpedition(createInitialSave(), 'goblinWarren', ['bram'], 0);
    expect(() => startExpedition(save, 'goblinWarren', ['bram', 'lyra'], 0)).toThrow();
    expect(() => startExpedition(save, 'goblinWarren', [], 0)).toThrow();
  });
});

describe('successChance', () => {
  it('is 50% at equal power and clamped at the ends', () => {
    expect(successChance(100, 100)).toBeCloseTo(0.5);
    expect(successChance(1000, 100)).toBe(0.95);
    expect(successChance(1, 100)).toBe(0.05);
  });

  it('rises with power', () => {
    expect(successChance(80, 100)).toBeLessThan(successChance(120, 100));
  });
});

describe('teamPower', () => {
  it('is higher with gear and lower in an unprotected hazard', () => {
    const goblins = dungeonById.goblinWarren;
    const cinder = dungeonById.cinderHollow;
    expect(teamPower(geared(), ALL, goblins)).toBeGreaterThan(teamPower(createInitialSave(), ALL, goblins));
    expect(teamPower(geared(), ['bram'], cinder)).toBeLessThan(teamPower(geared(), ['bram'], goblins));
  });

  it('lets fire resistance cancel the hazard penalty', () => {
    const cinder = dungeonById.cinderHollow;
    const unprotected = teamPower(geared(), ['lyra'], cinder);
    const protectedLyra = equip(geared(), 'lyra', 'consumable', 'fireResistanceElixir');
    expect(teamPower(protectedLyra, ['lyra'], cinder)).toBeGreaterThan(unprotected);
  });
});

describe('resolveExpedition', () => {
  it('gives the same result for the same expedition', () => {
    const save = startExpedition(geared(), 'trollBridge', ALL, 0);
    const a = resolveExpedition(save, save.expeditions[0]);
    const b = resolveExpedition(save, save.expeditions[0]);
    expect(a).toEqual(b);
  });

  it('pays out on success and nothing on failure', () => {
    const results = outcomes(geared(), 'trollBridge');
    const wins = results.filter((r) => r.report.success);
    const losses = results.filter((r) => !r.report.success);
    expect(wins.length).toBeGreaterThan(0);
    expect(losses.length).toBeGreaterThan(0);
    wins.forEach(({ report }) => expect(report.gold).toBeGreaterThanOrEqual(30));
    losses.forEach(({ report }) => {
      expect(report.gold).toBe(0);
      expect(report.materials).toEqual([]);
      expect(report.recipeId).toBeNull();
    });
  });

  it('applies rewards, XP and wear to the save', () => {
    const started = startExpedition(geared(), 'goblinWarren', ALL, 0);
    const { save, report } = resolveExpedition(started, started.expeditions[0]);
    expect(save.expeditions).toEqual([]);
    expect(save.reports[0]).toEqual(report);
    expect(save.gold).toBe(report.gold);
    save.heroes.forEach((hero) => expect(hero.xp + (hero.level - 1) * 100).toBe(report.xp));
    expect(save.gear.find((g) => g.uid === 'g1')!.durability).toBeLessThan(30);
  });

  it('uses up equipped consumables', () => {
    const started = startExpedition(geared(), 'goblinWarren', ALL, 0);
    const { save, report } = resolveExpedition(started, started.expeditions[0]);
    expect(report.consumablesUsed).toEqual(['healingPotion']);
    expect(save.heroes.find((h) => h.id === 'bram')!.equipment.consumable).toBeNull();
  });

  it('breaks worn-out gear and unequips it', () => {
    const worn = { ...geared(), gear: geared().gear.map((g) => (g.uid === 'g1' ? { ...g, durability: 1 } : g)) };
    const started = startExpedition(worn, 'goblinWarren', ALL, 0);
    const { save, report } = resolveExpedition(started, started.expeditions[0]);
    expect(report.brokenGear).toContain('ironSword');
    expect(save.gear.some((g) => g.uid === 'g1')).toBe(false);
    expect(save.heroes.find((h) => h.id === 'bram')!.equipment.weapon).toBeNull();
  });

  it('teaches the next pickaxe on the first clear', () => {
    const wins = outcomes(geared(), 'goblinWarren', 50).filter((r) => r.report.success);
    expect(wins.length).toBeGreaterThan(0);
    wins.forEach(({ report }) => expect(report.recipeId).toBe('copperPickaxe'));
  });

  it('can unlock a recipe it has not taught yet', () => {
    const unlocked = outcomes(geared(), 'trollBridge', 300).filter((r) => r.report.recipeId);
    expect(unlocked.length).toBeGreaterThan(0);
    unlocked.forEach(({ save, report }) => expect(save.knownRecipes).toContain(report.recipeId));
  });

  it('writes a 3-6 line log that names the heroes', () => {
    for (const dungeon of dungeons) {
      for (const { report } of outcomes(geared(), dungeon.id, 30)) {
        expect(report.log.length).toBeGreaterThanOrEqual(3);
        expect(report.log.length).toBeLessThanOrEqual(6);
        expect(report.log.join(' ')).toMatch(/Bram|Lyra|Mira/);
        expect(report.log.join(' ')).not.toMatch(/\{\w+\}/);
      }
    }
  });
});

describe('resolveDue', () => {
  it('resolves only finished expeditions, even after the app was closed', () => {
    let save = startExpedition(createInitialSave(), 'goblinWarren', ['bram'], 0);
    save = startExpedition(save, 'cinderHollow', ['lyra'], 0);
    const later = resolveDue(save, 10 * MIN);
    expect(later.reports.map((r) => r.dungeonId)).toEqual(['goblinWarren']);
    expect(later.save.expeditions.map((e) => e.dungeonId)).toEqual(['cinderHollow']);
  });

  it('fast-forwards running expeditions', () => {
    const save = startExpedition(createInitialSave(), 'cinderHollow', ['lyra'], 0);
    expect(resolveDue(fastForward(save, 5), 5).reports).toHaveLength(1);
  });
});
