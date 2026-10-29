import { createInitialSave, type SaveData } from './save';
import { resolveExpedition } from './expeditions/expeditions';
import { migrateV11Save, migrateV12Save, migrateV13Save, migrateV14Save } from './migrations';
import type { ActiveExpedition, ExpeditionReport } from './types';

describe('migrateV11Save', () => {
  it('gives existing gear a neutral roll and starts the new daily counters empty', () => {
    const before: Partial<SaveData> = {
      ...createInitialSave(),
      gold: 123,
      gear: [
        { uid: 'g1', itemId: 'woodSword', quality: 'rare' },
        { uid: 'g2', itemId: 'ironArmour', quality: 'crappy', element: 'fire' },
      ],
    };
    const after = migrateV11Save(before);
    expect(after.gear).toEqual([
      { uid: 'g1', itemId: 'woodSword', quality: 'rare', roll: 1 },
      { uid: 'g2', itemId: 'ironArmour', quality: 'crappy', roll: 1, element: 'fire' },
    ]);
    expect(after.blueprintBonusDays).toEqual({});
    expect(after.freshGathers).toEqual({ day: '', used: 0 });
    expect(after.gold).toBe(123);
  });

  it('leaves gear that already has a roll alone', () => {
    const before: Partial<SaveData> = {
      ...createInitialSave(),
      gear: [{ uid: 'g1', itemId: 'woodSword', quality: 'normal', roll: 1.06 }],
    };
    expect(migrateV11Save(before).gear).toEqual([{ uid: 'g1', itemId: 'woodSword', quality: 'normal', roll: 1.06 }]);
  });
});

describe('migrateV12Save', () => {
  it('starts auto-gather with no processed walk and an empty history', () => {
    const { autoGather, ...older } = createInitialSave();
    const after = migrateV12Save({ ...older, gold: 7 });
    expect(after.autoGather).toEqual({ processedUntil: 0, anchor: null, history: [] });
    expect(after.gold).toBe(7);
    expect(autoGather).toEqual(after.autoGather);
  });
});

describe('migrateV13Save', () => {
  it('starts with no escort, no patrol fights and empty patrol bookkeeping', () => {
    const { escort, patrolFights, beatenPatrols, helpedTravellers, traderUses, keyFragments, appliedBackgroundResults, ...older } = createInitialSave();
    const after = migrateV13Save({ ...older, gold: 9 });
    expect(after).toMatchObject({ escort, patrolFights, beatenPatrols, helpedTravellers, traderUses, keyFragments, appliedBackgroundResults, gold: 9 });
    expect(after.escort).toBeNull();
    expect(after.keyFragments).toBe(0);
  });
});

describe('migrateV14Save', () => {
  const ALL = ['bram', 'lyra', 'mira'];
  const expedition = {
    id: 'e1',
    dungeonId: 'ratCellar',
    heroIds: ALL,
    startedAt: 0,
    endsAt: 0,
    seed: 'seed',
    notificationId: null,
    kitId: 'lockpicks',
    modifierId: 'flooded',
  };
  const report = {
    id: 'r1',
    dungeonId: 'ratCellar',
    heroIds: ALL,
    finishedAt: 0,
    outcome: 'success' as const,
    success: true,
    encountersCleared: 3,
    encounterCount: 3,
    heroHp: [],
    threats: [],
    opportunity: null,
    salvaged: [],
    mainRewards: [],
    gold: 10,
    materials: [],
    recipeId: null,
    xp: 1,
    consumablesUsed: ['fireResistanceElixir', 'healingPotion'],
    log: [],
    seen: false,
    kitId: 'lockpicks',
    kitUsed: true,
  };
  const before = (): Partial<SaveData> => ({
    ...createInitialSave(),
    consumables: { lockpicks: 2, wardBone: 1, healingPotion: 1 },
    heroes: createInitialSave().heroes.map((h) => (h.id === 'bram' ? { ...h, equipment: { ...h.equipment, consumable: 'fireResistanceElixir' } } : h)),
    knownRecipes: [...createInitialSave().knownRecipes, 'fireResistanceElixir', 'lockpicks', 'wardBone'],
    expeditions: [expedition],
    reports: [report],
  });

  it('maps stock and equipped ids, counts adding up', () => {
    const after = migrateV14Save({ ...before(), expeditions: [] });
    // Lockpicks 2 and a ward bone 1 are a Rogue's roll 3.
    expect(after.consumables).toEqual({ roguesRoll: 3, healingPotion: 1 });
    expect(after.heroes.find((h) => h.id === 'bram')!.equipment.consumable).toBe('emberWardSalve');
  });

  it('drops the old recipe ids from knownRecipes', () => {
    const after = migrateV14Save(before());
    expect(after.knownRecipes).not.toContain('fireResistanceElixir');
    expect(after.knownRecipes).not.toContain('lockpicks');
    expect(after.knownRecipes).not.toContain('wardBone');
    expect(after.knownRecipes).toEqual(createInitialSave().knownRecipes);
  });

  it('refunds a running expedition kit as its new one, and resolves it with no threats', () => {
    const after = migrateV14Save(before());
    const migrated = after.expeditions[0] as ActiveExpedition & { kitId?: string; modifierId?: string };
    expect('kitId' in migrated).toBe(false);
    expect('modifierId' in migrated).toBe(false);
    expect(migrated.briefing).toBeUndefined();
    // The lockpicks become one Rogue's roll on top of the stock's three.
    expect(after.consumables.roguesRoll).toBe(4);
    const { report: resolved } = resolveExpedition(after, migrated);
    expect(resolved.success).toBeDefined();
    expect(resolved.threats).toEqual([]);
  });

  it('strips the kit fields from old reports and remaps their consumables', () => {
    const after = migrateV14Save(before());
    const migrated = after.reports[0] as ExpeditionReport & { kitId?: string; kitUsed?: boolean };
    expect('kitId' in migrated).toBe(false);
    expect('kitUsed' in migrated).toBe(false);
    expect(migrated.consumablesUsed).toEqual(['emberWardSalve', 'healingPotion']);
  });
});
