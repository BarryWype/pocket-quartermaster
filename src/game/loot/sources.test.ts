import { difficultyRules } from '@/content/difficulty';
import { lootMatrix } from '@/content/loot/matrix';
import { monsterParts } from '@/content/loot/monsterParts';

import { ELEMENTS, shardId, stoneId } from '../elements';
import { createRng } from '../generation/rng';
import { createInitialSave } from '../save';
import { rollForSave, sourceAmounts } from './context';
import { LOOT_CATEGORIES, LOOT_SOURCES, type LootCategory, type LootSourceId } from './types';

const SEEDS = 200;
const LUCK = 100;
const SHARD_IDS = new Set(ELEMENTS.map(shardId));
// Elemental stones drop as trophies.
const STONE_IDS = new Set(ELEMENTS.map(stoneId));
const PART_IDS = new Set(monsterParts.map((p) => p.id));

/** The categories a source may drop: every mark except '—'. */
const droppable = (source: LootSourceId): LootCategory[] =>
  LOOT_CATEGORIES.filter((category) => lootMatrix[source].marks[category] !== '—');

/** Stacks that are neither element shards, stones nor monster parts: all live in `materials` too. */
const gathered = (materials: { materialId: string }[]) =>
  materials.filter((m) => !SHARD_IDS.has(m.materialId) && !STONE_IDS.has(m.materialId) && !PART_IDS.has(m.materialId));

describe('rollForSave', () => {
  for (const source of LOOT_SOURCES) {
    it(`drops only the categories ${source} can drop`, () => {
      const allowed = new Set(droppable(source));
      for (let i = 0; i < SEEDS; i++) {
        const loot = rollForSave(createInitialSave(), source, createRng(`${source}|${i}`), { luck: LUCK });
        for (const category of loot.dropped) expect(allowed.has(category)).toBe(true);
      }
    });

    it(`gives materials only when ${source}'s materials mark is not '—'`, () => {
      const allowed = lootMatrix[source].marks.materials !== '—';
      for (let i = 0; i < SEEDS; i++) {
        const loot = rollForSave(createInitialSave(), source, createRng(`${source}|m|${i}`), { luck: LUCK });
        if (!allowed) expect(gathered(loot.materials)).toEqual([]);
      }
    });
  }

  it('never gives materials from a dungeon source', () => {
    for (const source of ['dungeonRun', 'firstWin', 'firstTierClear', 'firstDungeonClear', 'tierBoss', 'overnightExpedition'] as LootSourceId[]) {
      for (let i = 0; i < SEEDS; i++) {
        expect(gathered(rollForSave(createInitialSave(), source, createRng(`${source}|d|${i}`), { luck: LUCK }).materials)).toEqual([]);
      }
    }
  });

  it('scales a source\'s gold and XP by its difficulty', () => {
    const base = sourceAmounts('sanctum', 3);
    for (const difficulty of difficultyRules.order) {
      const { goldXp } = difficultyRules.rewards[difficulty];
      expect(sourceAmounts('sanctum', 3, difficulty)).toEqual({
        gold: Math.round(base.gold * goldXp),
        xp: Math.round(base.xp * goldXp),
      });
    }
  });
});
