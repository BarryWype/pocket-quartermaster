import { gearRecipes } from '@/content/equipment';
import { dungeons } from '@/content/dungeons';
import { itemById, recipeById } from '@/content/lookup';
import { recipes } from '@/content/recipes';
import { shopRules } from '@/content/shops';
import { workToolId, workToolNames, workToolRules, workTools } from '@/content/workTools';

import { resolveExpedition, startExpedition } from '../expeditions/expeditions';
import { jobChoices } from '../jobs/jobs';
import type { GearDef } from '../types';
import { gearPool } from '../places/shops';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import { scavengeLoot, scavengeMaterial } from './workTools';

const KINDS = workTools.map((tool) => tool.kind);

describe('work tool content', () => {
  it('has one tool per job place line, priced at about half the tier’s Common gear', () => {
    expect(workTools.map((tool) => tool.job)).toEqual(['woodcutter', 'forager', 'trapper', 'miner', 'charcoalBurner']);
    for (let tier = 1; tier <= 5; tier++) {
      expect(workToolRules.price[tier - 1]).toBe(Math.round(shopRules.gearPrice[tier - 1] / 2));
    }
    expect(workToolRules.outputBonus).toEqual([0.2, 0.25, 0.3, 0.35, 0.4]);
    expect(workToolRules.scavengePerWin).toBe(1);
  });

  it('gives one item per kind and tier, off-hand with no gear type, damage stat or keywords, and ids that clash with nothing', () => {
    for (const kind of KINDS) {
      for (let tier = 1; tier <= 5; tier++) {
        const item = itemById[workToolId(kind, tier)];
        expect(item).toBeDefined();
        expect(item.slot).toBe('offhand');
        expect(item.name).toBe(workToolNames[kind][tier - 1]);
        const gear = item as GearDef;
        expect(gear.gearType).toBeUndefined();
        expect(gear.damageStat).toBeUndefined();
        expect(gear.keywords).toEqual([]);
        expect(gear.workTool).toEqual({ kind, job: workTools.find((tool) => tool.kind === kind)!.job });
        expect(gear.stats.power ?? 0).toBe(0);
        expect(gear.stats.magic ?? 0).toBe(0);
      }
    }
    const ids = new Set(Object.keys(itemById));
    expect(ids.size).toBe(Object.keys(itemById).length);
  });

  it('never forges, drops or stocks work tools: no recipe, no gear recipe entry, no smithy pool line', () => {
    const toolIds = new Set(KINDS.flatMap((kind) => [1, 2, 3, 4, 5].map((tier) => workToolId(kind, tier))));
    for (const recipe of Object.values(recipeById)) {
      if ('itemId' in recipe.output) expect(toolIds.has(recipe.output.itemId)).toBe(false);
    }
    expect(recipes.filter((recipe) => 'itemId' in recipe.output && toolIds.has(recipe.output.itemId))).toEqual([]);
    for (const kind of KINDS) expect(gearRecipes[kind as keyof typeof gearRecipes]).toBeUndefined();
    const save = { ...createInitialSave(), clearedDungeons: ['banditStockade', 'ogreQuarry', 'drownedCrypt', 'giantsHall', 'elderDragon'] };
    expect(gearPool(save).every((recipe) => !('itemId' in recipe.output && toolIds.has(recipe.output.itemId)))).toBe(true);
  });
});

describe('scavenge', () => {
  const withTool = (itemId: string): SaveData => {
    const base = createInitialSave();
    return {
      ...base,
      gear: [{ uid: 't1', itemId, rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 }],
      heroes: base.heroes.map((h) => (h.id === 'bram' ? { ...h, equipment: { ...h.equipment, offhand: 't1' } } : h)),
    };
  };

  it('scavenges the tool’s fixed material per won fight', () => {
    expect(scavengeLoot(withTool('hatchet1'), 'bram', 0, 'run1')).toEqual([{ materialId: 'wood', amount: 1 }]);
    expect(scavengeLoot(withTool('hatchet3'), 'bram', 2, 'run1')).toEqual([{ materialId: 'wood', amount: 1 }]);
  });

  it('adds nothing without a tool, or for a hero who does not wear one', () => {
    expect(scavengeLoot(createInitialSave(), 'bram', 0, 'run1')).toEqual([]);
    expect(scavengeLoot(withTool('hatchet1'), 'lyra', 0, 'run1')).toEqual([]);
  });

  it('rolls a weighted job’s material with the job’s weights, the same roll for the same seed', () => {
    const save = withTool('snare1');
    const ctx = { jobChoice: save.jobChoice.trapper, choices: [] };
    for (const seed of ['run1', 'run2', 'run3']) {
      const material = scavengeMaterial('trapper', `${seed}|scavenge|bram|0`, ctx);
      expect(['meat', 'hide', 'bone']).toContain(material);
      expect(scavengeMaterial('trapper', `${seed}|scavenge|bram|0`, ctx)).toBe(material);
    }
    expect(scavengeLoot(save, 'bram', 0, 'run1')[0].amount).toBe(1);
  });

  it('gives the miner its chosen ore, else its highest unlocked one, else stone', () => {
    const save = withTool('miningPick2');
    expect(scavengeMaterial('miner', 's', { jobChoice: save.jobChoice.miner, choices: [] })).toBe('stone');
    const chosen = { ...save, jobChoice: { ...save.jobChoice, miner: 'iron' } };
    expect(scavengeMaterial('miner', 's', { jobChoice: chosen.jobChoice.miner, choices: [] })).toBe('iron');
    const tier4 = { ...save, clearedDungeons: ['banditStockade', 'ogreQuarry', 'drownedCrypt'] };
    expect(scavengeMaterial('miner', 's', { jobChoice: tier4.jobChoice.miner, choices: jobChoices(tier4, 'miner') })).toBe('iron');
  });
});

describe('scavenge in a run', () => {
  /** A geared party with bram wearing a tier-5 tongs (charcoal burner: coal). */
  const tooledParty = (): SaveData => {
    const base = createInitialSave();
    let save: SaveData = {
      ...base,
      clearedDungeons: dungeons.filter((d) => d.isBoss).map((d) => d.id),
      tutorial: { ...base.tutorial, step: 'done' },
      gear: [
        { uid: 'g1', itemId: 'sword1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
        { uid: 'g2', itemId: 'axe1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
        { uid: 'g3', itemId: 'wand1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
        { uid: 't1', itemId: 'tongs5', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
      ],
      nextUid: 10,
    };
    save = equip(save, 'bram', 'weapon', 'g1');
    save = equip(save, 'lyra', 'weapon', 'g2');
    save = equip(save, 'mira', 'weapon', 'g3');
    return equip(save, 'bram', 'offhand', 't1');
  };
  const coalOf = (loot: { materials: { materialId: string; amount: number }[] }) =>
    loot.materials.find((m) => m.materialId === 'coal')?.amount ?? 0;

  it('adds the tool’s material to a won run’s loot, and shows in its results', () => {
    const save = tooledParty();
    const started = startExpedition(save, 'ratCellar', ['bram', 'lyra', 'mira'], 0);
    // A guaranteed run, like the tutorial's: every fight is won.
    const { report, save: next } = resolveExpedition(started, { ...started.expeditions[0], guaranteed: true });
    expect(report.success).toBe(true);
    expect(coalOf(report.loot)).toBeGreaterThanOrEqual(1);
    expect((next.materials.coal ?? 0) - (save.materials.coal ?? 0)).toBe(coalOf(report.loot));
  });

  it('adds nothing to a lost run', () => {
    const save = tooledParty();
    const boss5 = dungeons.find((d) => d.tier === 5 && d.isBoss)!.id;
    const started = startExpedition({ ...save, nextUid: 1 }, boss5, ['bram'], 0);
    const { report, save: next } = resolveExpedition(started, started.expeditions[0]);
    expect(report.success).toBe(false);
    expect(coalOf(report.loot)).toBe(0);
    expect((next.materials.coal ?? 0) - (save.materials.coal ?? 0)).toBe(0);
  });
});
