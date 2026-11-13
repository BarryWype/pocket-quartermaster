import { createInitialSave, type SaveData } from '../save';
import type { ExpeditionReport } from '../types';
import { grantLoot, withGrantedUids } from './grant';
import { reportTiles, lootTiles } from './tiles';
import { emptyLoot, type Loot } from './types';

const NOW = 1_000_000;

/** One of everything a roll can give, out of grid order. */
const everything = (): Loot => ({
  ...emptyLoot(),
  gold: 40,
  xp: 25,
  lures: 2,
  keyFragments: 1,
  manuals: ['rare'],
  treasureMaps: [{ rarity: 'common', tier: 2 }],
  relics: ['poachersLongbow'],
  recipeIds: ['axe1'],
  gear: [
    { uid: '', itemId: 'sword2', rarity: 'legendary' },
    { uid: '', itemId: 'axe1', rarity: 'common' },
    { uid: '', itemId: 'bountyToken', rarity: 'common' },
    { uid: '', itemId: 'bow1', rarity: 'rare' },
  ],
  consumables: [{ itemId: 'healingPotion', amount: 2 }],
  materials: [
    { materialId: 'wood', amount: 3 },
    { materialId: 'feather', amount: 1 },
    { materialId: 'wood', amount: 2 },
  ],
});

describe('loot tiles', () => {
  it('turns every find into a tile, in grid order: gold and XP, materials, consumables, gear by rarity, blueprints, relics, one-offs', () => {
    const tiles = lootTiles(everything());
    expect(tiles.map((tile) => [tile.kind, tile.label])).toEqual([
      ['gold', '40'],
      ['xp', '25 XP'],
      ['material', '×5'],
      ['material', '×1'],
      ['consumable', '×2'],
      ['gear', 'Common'],
      ['gear', 'Trinket'],
      ['gear', 'Rare'],
      ['gear', 'Legendary'],
      ['blueprint', 'Blueprint'],
      ['relic', 'Relic'],
      ['map', 'Map T2'],
      ['manual', 'Manual'],
      ['keyFragment', 'Key fragment'],
      ['lure', '2 lures'],
    ]);
    expect(tiles.find((tile) => tile.kind === 'material')!.itemRef).toEqual({ kind: 'material', id: 'wood' });
    expect(tiles.find((tile) => tile.rarity === 'legendary')!.itemRef).toEqual({ kind: 'gear', itemId: 'sword2', rarity: 'legendary' });
  });

  it('marks the two best finds: the rarest gear, then blueprints and relics', () => {
    expect(lootTiles(everything()).filter((tile) => tile.best).map((tile) => tile.rarity)).toEqual(['rare', 'legendary']);
    const plain = { ...everything(), gear: [] };
    expect(lootTiles(plain).filter((tile) => tile.best).map((tile) => tile.kind)).toEqual(['blueprint', 'relic']);
    expect(lootTiles({ ...emptyLoot(), gold: 5, materials: [{ materialId: 'wood', amount: 1 }] }).some((tile) => tile.best)).toBe(false);
  });

  it('leaves XP out when asked', () => {
    expect(lootTiles(everything(), { xp: false }).some((tile) => tile.kind === 'xp')).toBe(false);
  });

  it('marks what the save had never found as new: blueprints, monster parts, gear types, trinkets and relics', () => {
    const fresh = lootTiles(everything(), { before: createInitialSave() });
    expect(fresh.filter((tile) => tile.isNew).map((tile) => tile.key).sort()).toEqual(['b:axe1', 'g:0', 'g:1', 'g:2', 'g:3', 'm:feather', 'r:0'].sort());
    // Once granted, nothing of it is new any more.
    const after = grantLoot(createInitialSave(), [], everything(), NOW);
    expect(lootTiles(everything(), { before: after }).some((tile) => tile.isNew)).toBe(false);
    // Without the save from before, no tile claims to be new.
    expect(lootTiles(everything()).some((tile) => tile.isNew)).toBe(false);
  });

  it('remembers a gear type found and since salvaged', () => {
    const after = grantLoot(createInitialSave(), [], { ...emptyLoot(), gear: [{ uid: '', itemId: 'bow1', rarity: 'common' }] }, NOW);
    const salvaged: SaveData = { ...after, gear: [] };
    expect(lootTiles({ ...emptyLoot(), gear: [{ uid: '', itemId: 'bow3', rarity: 'rare' }] }, { before: salvaged })[0].isNew).toBe(false);
  });

  it('carries the uid each piece was granted with', () => {
    const before = createInitialSave();
    const loot = everything();
    const granted = withGrantedUids(loot, before, grantLoot(before, [], loot, NOW));
    const uids = granted.gear.map((g) => g.uid);
    expect(new Set(uids).size).toBe(4);
    const after = grantLoot(before, [], loot, NOW);
    granted.gear.forEach((piece) => expect(after.gear.find((g) => g.uid === piece.uid)).toMatchObject({ itemId: piece.itemId, rarity: piece.rarity }));
  });

  it('shows a report’s Sigil and its shards, and its XP on the hero plates instead', () => {
    const report = { loot: everything(), sigil: 2, sigilShards: { element: 'fire', amount: 4 } } as unknown as ExpeditionReport;
    const tiles = reportTiles(report);
    expect(tiles.some((tile) => tile.kind === 'xp')).toBe(false);
    expect(tiles.at(-1)).toMatchObject({ kind: 'sigil', label: 'Sigil T2' });
    expect(tiles.find((tile) => tile.key === 'm:fireShard')).toMatchObject({ label: '×4' });
  });
});
