import { createInitialSave, type SaveData, type TutorialStep } from '../save';
import { equip } from '../team/team';
import type { GearInstance, SecretTip } from '../types';

import { inventoryPages, inventoryRows, type InventoryPageId, type InventoryRow } from './inventoryPages';

const NOW = 1_000_000;

/** A save past the tutorial, so the reveal's conditions apply. */
function tutorialDone(save: SaveData = createInitialSave()): SaveData {
  return { ...save, tutorial: { ...save.tutorial, step: 'done' as TutorialStep } };
}

/** A save holding nothing at all. */
function emptySave(): SaveData {
  const save = tutorialDone();
  return {
    ...save,
    materials: {},
    consumables: {},
    gear: [],
    tools: [],
    sigils: [],
    treasureMaps: [],
    lures: 0,
    activeLure: null,
    ruinsProgress: 0,
    keyFragments: 0,
    secretTips: [],
    relics: [],
    manuals: {},
  };
}

const tip: SecretTip = {
  id: 'hiddenDen|library-1',
  secret: 'hiddenDen',
  source: 'library',
  sourceId: 'library-1',
  anchor: { latitude: 0, longitude: 0 },
  foundAt: 0,
  expiresAt: NOW + 3_600_000,
};

const pageIds = (save: SaveData) => inventoryPages(save, NOW).map((page) => page.id);
const rowsOn = (save: SaveData, page: InventoryPageId) =>
  inventoryRows(save, NOW).filter((row) => row.page === page);
const itemRows = (rows: InventoryRow[]) => rows.filter((row) => row.kind === 'item').map((row) => (row as { item: { key: string } }).item.key);

describe('inventoryPages', () => {
  it('a new save shows materials but no secrets', () => {
    const pages = inventoryPages(tutorialDone(), NOW);
    expect(pageIds(tutorialDone())).toContain('materials');
    expect(pageIds(tutorialDone())).not.toContain('secrets');
    expect(pages[0].id).toBe('materials');
  });

  it('a key fragment with no secret tip ever received goes on finds', () => {
    const save = { ...emptySave(), keyFragments: 1 };
    expect(pageIds(save)).not.toContain('secrets');
    expect(pageIds(save)).toContain('finds');
    expect(itemRows(rowsOn(save, 'finds'))).toContain('keyFragments');
  });

  it('once a secret has been found, the key fragment moves to the secrets page', () => {
    const save = { ...emptySave(), keyFragments: 1, secretTips: [tip] };
    const pages = inventoryPages(save, NOW);
    expect(pageIds(save)).toContain('secrets');
    expect(itemRows(rowsOn(save, 'secrets'))).toContain('keyFragments');
    expect(itemRows(rowsOn(save, 'finds'))).not.toContain('keyFragments');
    expect(pages.find((page) => page.id === 'secrets')?.count).toBe(2);
  });

  it('a gear piece gives the gear page one row', () => {
    const gear: GearInstance[] = [{ uid: '1', itemId: 'sword1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 }];
    const save = { ...emptySave(), gear };
    expect(inventoryPages(save, NOW)).toEqual(expect.arrayContaining([{ id: 'gear', count: 1 }]));
  });

  it('gear rows list equipped pieces first, each group in order', () => {
    const gear: GearInstance[] = [
      { uid: 'spare1', itemId: 'sword1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
      { uid: 'worn', itemId: 'sword1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
      { uid: 'spare2', itemId: 'sword1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
    ];
    const save = equip({ ...emptySave(), gear }, 'bram', 'weapon', 'worn');
    const uids = rowsOn(save, 'gear')
      .filter((row) => row.kind === 'gear')
      .map((row) => (row as { gear: GearInstance }).gear.uid);
    expect(uids).toEqual(['worn', 'spare1', 'spare2']);
  });

  it('a weakness item sits on consumables, not materials', () => {
    const save = { ...emptySave(), consumables: { strongAle: 1 } };
    expect(itemRows(rowsOn(save, 'consumables'))).toContain('w:strongAle');
    expect(itemRows(rowsOn(save, 'materials'))).not.toContain('w:strongAle');
  });

  it('relics and manuals both go to treasures', () => {
    const save = {
      ...emptySave(),
      relics: [{ uid: 'r1', relicId: 'rustedSaintsBuckler' }],
      manuals: { common: 1 },
    };
    const treasures = itemRows(rowsOn(save, 'treasures'));
    expect(treasures).toEqual(expect.arrayContaining(['r:r1', 'manual:common']));
    expect(inventoryPages(save, NOW).find((page) => page.id === 'treasures')?.count).toBe(2);
  });

  it('a save holding nothing shows only materials, with no rows', () => {
    expect(inventoryPages(emptySave(), NOW)).toEqual([{ id: 'materials', count: 0 }]);
  });

  it('every held item appears on exactly one page', () => {
    const save: SaveData = {
      ...tutorialDone(),
      materials: { wood: 3, hide: 1 },
      gear: [{ uid: '1', itemId: 'sword1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 }],
      consumables: { ...createInitialSave().consumables, strongAle: 1 },
      relics: [{ uid: 'r1', relicId: 'rustedSaintsBuckler' }],
      manuals: { common: 2 },
      sigils: [1, 1],
      treasureMaps: [{ id: 'map1', tier: 1, rarity: 'common', expiresAt: NOW + 3_600_000, location: null }],
      lures: 2,
      tools: ['ironPickaxe'],
      ruinsProgress: 2,
      keyFragments: 5,
    };
    const rows = inventoryRows(save, NOW);
    const pages = inventoryPages(save, NOW);
    expect(pages.reduce((sum, page) => sum + page.count, 0)).toBe(rows.length);
    expect(rows.filter((row) => row.page === 'secrets')).toEqual([]);
  });
});
