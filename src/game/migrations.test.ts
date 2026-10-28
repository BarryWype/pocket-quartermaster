import { createInitialSave, type SaveData } from './save';
import { migrateV11Save } from './migrations';

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
