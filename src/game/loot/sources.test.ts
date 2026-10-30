import { lootMatrix } from '@/content/loot/matrix';
import { components } from '@/content/loot/components';
import { monsterParts } from '@/content/loot/monsterParts';

import { ELEMENTS, shardId } from '../elements';
import { createRng } from '../generation/rng';
import { createInitialSave } from '../save';
import { rollForSave } from './context';
import { LOOT_CATEGORIES, LOOT_SOURCES, type LootCategory, type LootSourceId } from './types';

const SEEDS = 200;
const LUCK = 100;
const SHARD_IDS = new Set(ELEMENTS.map(shardId));
const COMPONENT_IDS = new Set(components.map((c) => c.id));
const PART_IDS = new Set(monsterParts.map((p) => p.id));

/** The categories a source may drop: every mark except '—'. */
const droppable = (source: LootSourceId): LootCategory[] =>
  LOOT_CATEGORIES.filter((category) => lootMatrix[source].marks[category] !== '—');

/** Stacks that are neither element shards, components nor monster parts: all live in `materials` too. */
const gathered = (materials: { materialId: string }[]) =>
  materials.filter((m) => !SHARD_IDS.has(m.materialId) && !COMPONENT_IDS.has(m.materialId) && !PART_IDS.has(m.materialId));

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
    for (const source of ['dungeonRun', 'firstWin', 'firstTierClear', 'tierBoss', 'overnightQuest'] as LootSourceId[]) {
      for (let i = 0; i < SEEDS; i++) {
        expect(gathered(rollForSave(createInitialSave(), source, createRng(`${source}|d|${i}`), { luck: LUCK }).materials)).toEqual([]);
      }
    }
  });
});
