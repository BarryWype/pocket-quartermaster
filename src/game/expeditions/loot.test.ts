import { dungeons } from '@/content/dungeons';

import { resolveExpedition, startExpedition } from './expeditions';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';

const ALL = ['bram', 'lyra', 'mira'];
const BOSS_1 = dungeons.find((d) => d.isBoss && d.tier === 1)!.id;

/** Veterans who clear tier 1 without trouble. */
function veterans(): SaveData {
  let save: SaveData = {
    ...createInitialSave(),
    tutorial: { step: 'done', woodSpot: null },
    heroes: createInitialSave().heroes.map((h) => ({ ...h, level: 30 })),
    gear: [
      { uid: 'g1', itemId: 'sword5', quality: 'normal' },
      { uid: 'g2', itemId: 'bow5', quality: 'normal' },
      { uid: 'g3', itemId: 'wand5', quality: 'normal' },
    ],
    nextUid: 10,
  };
  save = equip(save, 'bram', 'weapon', 'g1');
  save = equip(save, 'lyra', 'weapon', 'g2');
  save = equip(save, 'mira', 'weapon', 'g3');
  return save;
}

const resolve = (save: SaveData, dungeonId: string, seed = 0) => {
  const started = startExpedition({ ...save, nextUid: 100 + seed }, dungeonId, ALL, 0);
  return resolveExpedition(started, started.expeditions[0]);
};

describe('expedition loot', () => {
  it('rolls the run row and the day\'s first win on a win, and the same loot again for the same seed', () => {
    const { report } = resolve(veterans(), 'ratCellar');
    expect(report.success).toBe(true);
    expect(report.firstWin).toBe(true);
    expect(report.loot.dropped).toEqual(expect.arrayContaining(['gold', 'xp']));
    expect(report.loot.gold).toBeGreaterThan(0);
    expect(resolve(veterans(), 'ratCellar').report.loot).toEqual(report.loot);
  });

  it('rolls no first win row for the day\'s second win', () => {
    const first = resolve(veterans(), 'ratCellar');
    const second = resolve(first.save, 'goblinWarren');
    expect(second.report.success).toBe(true);
    expect(second.report.firstWin).toBeUndefined();
  });

  it('never gives an overnight expedition the first win of the day', () => {
    const { report, save } = resolve(veterans(), 'nightWatch1');
    expect(report.success).toBe(true);
    expect(report.firstWin).toBeUndefined();
    expect(save.firstWinDay).toBeNull();
  });

  it('rolls the first clear of a tier only the first time the tier is won', () => {
    const first = resolve(veterans(), 'ratCellar');
    expect(first.report.firstTierClear).toBe(true);
    expect(resolve(first.save, 'goblinWarren').report.firstTierClear).toBeUndefined();
  });

  it('teaches the tier boss its pickaxe', () => {
    const { report, save } = resolve(veterans(), BOSS_1);
    expect(report.success).toBe(true);
    expect(save.knownRecipes).toContain('woodPickaxe');
  });

  it('drops a forced category even where its mark is —', () => {
    const started = startExpedition({ ...veterans(), nextUid: 100 }, 'ratCellar', ALL, 0);
    const { report } = resolveExpedition(started, started.expeditions[0], { loot: { force: 'materials' } });
    expect(report.loot.dropped).toContain('materials');
  });

  it('rolls nothing on a loss, keeping only its gold and XP share', () => {
    const losses = Array.from({ length: 10 }, (_, i) => resolve(createInitialSave(), 'goblinWarren', i).report).filter((r) => !r.success);
    expect(losses.length).toBeGreaterThan(0);
    for (const report of losses) {
      expect(report.loot.dropped).toEqual([]);
      expect(report.loot.gear).toEqual([]);
      expect(report.loot.recipeIds).toEqual([]);
      expect(report.loot.gold).toBeGreaterThanOrEqual(0);
      expect(report.loot.xp).toBeGreaterThanOrEqual(0);
    }
  });
});
