import { lootConfig } from '@/content/loot/config';
import { xpToNextLevel } from '@/content/heroes';

import { shardId, stoneId } from '../elements';
import { createInitialSave, type SaveData } from '../save';
import { emptyLoot } from './types';
import { grantLoot } from './grant';

const NOW = 1_000_000;

describe('grantLoot', () => {
  it('pays gold', () => {
    const save = grantLoot(createInitialSave(), [], { ...emptyLoot(), gold: 25 }, NOW);
    expect(save.gold).toBe(25);
  });

  it('pays XP to each hero of the party only, with the trait and Guild Hall bonuses', () => {
    const save: SaveData = { ...createInitialSave(), guild: { heroXp: 2 } };
    const after = grantLoot(save, ['bram', 'mira'], { ...emptyLoot(), xp: 20 }, NOW);
    // Mira is a quick learner: +20%, and the Guild Hall adds another +20%.
    const total = (h: { level: number; xp: number }) => h.xp + (h.level - 1) * xpToNextLevel(1);
    expect(total(after.heroes.find((h) => h.id === 'bram')!)).toBe(Math.round(20 * 1.2));
    expect(total(after.heroes.find((h) => h.id === 'mira')!)).toBe(Math.round(20 * 1.2 * 1.2));
    expect(after.heroes.find((h) => h.id === 'lyra')!.xp).toBe(0);
  });

  it('pays materials, converting shard stacks into stones', () => {
    const shardsPerStone = 10;
    const save = grantLoot(
      createInitialSave(),
      [],
      { ...emptyLoot(), materials: [{ materialId: 'wood', amount: 3 }, { materialId: shardId('fire'), amount: shardsPerStone * 2 }] },
      NOW,
    );
    expect(save.materials.wood).toBe(3);
    expect(save.materials[stoneId('fire')]).toBe(2);
    expect(save.materials[shardId('fire')]).toBeUndefined();
  });

  it('pays consumables and lures', () => {
    const save = grantLoot(
      createInitialSave(),
      [],
      { ...emptyLoot(), consumables: [{ itemId: 'healingPotion', amount: 2 }], lures: 3 },
      NOW,
    );
    expect(save.consumables.healingPotion).toBe(2);
    expect(save.lures).toBe(3);
  });

  it('pays gear with fresh uids, advancing nextUid', () => {
    const save = createInitialSave();
    const after = grantLoot(save, [], { ...emptyLoot(), gear: [{ uid: '', itemId: 'sword1', quality: 'rare', roll: 1 }] }, NOW);
    expect(after.gear.at(-1)).toMatchObject({ uid: `g${save.nextUid}`, itemId: 'sword1' });
    expect(after.nextUid).toBe(save.nextUid + 1);
  });

  it('teaches blueprints', () => {
    const save = grantLoot(createInitialSave(), [], { ...emptyLoot(), recipeIds: ['axe1'] }, NOW);
    expect(save.knownRecipes).toContain('axe1');
    expect(grantLoot(save, [], { ...emptyLoot(), recipeIds: ['axe1'] }, NOW).knownRecipes).toBe(save.knownRecipes);
  });

  it('pays key fragments', () => {
    expect(grantLoot(createInitialSave(), [], { ...emptyLoot(), keyFragments: 2 }, NOW).keyFragments).toBe(2);
  });

  it('pays treasure maps of a rarity, unread and expiring 48 hours later', () => {
    const save = grantLoot(createInitialSave(), [], { ...emptyLoot(), treasureMaps: [{ rarity: 'rare', tier: 2 }] }, NOW);
    const [map] = save.treasureMaps;
    expect(map).toMatchObject({ rarity: 'rare', tier: 2, location: null });
    expect(map.expiresAt).toBe(NOW + lootConfig.treasureMapHours * 3_600_000);
  });

  it('pays manuals by rarity', () => {
    const save = grantLoot(createInitialSave(), [], { ...emptyLoot(), manuals: ['common', 'common', 'legendary'] }, NOW);
    expect(save.manuals).toEqual({ common: 2, legendary: 1 });
  });

  it('pays valuables keyed by id and tier', () => {
    const save = grantLoot(createInitialSave(), [], { ...emptyLoot(), valuables: [{ valuableId: 'goblet', tier: 2, amount: 3 }] }, NOW);
    expect(save.valuables['goblet:2']).toBe(3);
  });

  it('pays relics with uids', () => {
    const save = createInitialSave();
    const after = grantLoot(save, [], { ...emptyLoot(), relics: ['rustyCoin'] }, NOW);
    expect(after.relics).toEqual([{ uid: `r${save.nextUid}`, relicId: 'rustyCoin' }]);
    expect(after.nextUid).toBe(save.nextUid + 1);
  });

  it('hands out fresh uids to everything in one grant', () => {
    const save = createInitialSave();
    const after = grantLoot(
      save,
      [],
      {
        ...emptyLoot(),
        gear: [{ uid: '', itemId: 'sword1', quality: 'normal', roll: 1 }],
        treasureMaps: [{ rarity: 'common', tier: 1 }],
        relics: ['rustyCoin', 'oldBoot'],
      },
      NOW,
    );
    expect([after.gear.at(-1)!.uid, ...after.treasureMaps.map((m) => m.id), ...after.relics.map((r) => r.uid)]).toEqual(
      [`g${save.nextUid}`, `map${save.nextUid + 1}`, `r${save.nextUid + 2}`, `r${save.nextUid + 3}`],
    );
    expect(after.nextUid).toBe(save.nextUid + 4);
  });
});
