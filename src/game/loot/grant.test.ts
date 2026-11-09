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

  it('keeps every looted piece: the gear inventory has no cap', () => {
    // Five tiers of looted gear and trinkets for a regular player who never salvages: about 45 a week.
    const pieces = Array.from({ length: 300 }, (_, i) => ({ uid: '' as const, itemId: i % 2 ? 'sword3' : 'greatHelm3', rarity: 'common' as const }));
    const start = createInitialSave();
    const save = grantLoot(start, [], { ...emptyLoot(), gear: pieces }, NOW);
    expect(save.gear.length).toBe(start.gear.length + 300);
    expect(new Set(save.gear.map((g) => g.uid)).size).toBe(save.gear.length);
  });

  /** A save whose heroes wear a weapon with the given affix, by hero id. */
  const wornAffix = (affixId: string, values: Record<string, number>): SaveData => {
    const base = createInitialSave();
    const gear = base.heroes
      .filter((hero) => values[hero.id] !== undefined)
      .map((hero) => ({ uid: `gA-${hero.id}`, itemId: 'sword1', rarity: 'common' as const, roll: 8, affixes: [{ id: affixId, value: values[hero.id] }], rerolls: 0 }));
    return {
      ...base,
      gear: [...base.gear, ...gear],
      heroes: base.heroes.map((hero) =>
        values[hero.id] !== undefined ? { ...hero, equipment: { ...hero.equipment, weapon: `gA-${hero.id}` } } : hero,
      ),
    };
  };

  it("counts the party's best Plunderer once on the gold, ignoring heroes outside it", () => {
    // Bram +10%, Mira +20% (counted once at the best value); Lyra +15% is out of the party.
    const save = wornAffix('plunderer', { bram: 10, mira: 20, lyra: 15 });
    expect(grantLoot(save, ['bram', 'mira'], { ...emptyLoot(), gold: 100 }, NOW).gold).toBe(120);
  });

  it("adds a hero's worn Veteran to their own XP only", () => {
    const save = wornAffix('veteran', { bram: 25 });
    const after = grantLoot(save, ['bram', 'mira'], { ...emptyLoot(), xp: 20 }, NOW);
    const total = (h: { level: number; xp: number }) => h.xp + (h.level - 1) * xpToNextLevel(1);
    expect(total(after.heroes.find((h) => h.id === 'bram')!)).toBe(25);
    // Mira's quick learner still applies; the Veteran is Bram's alone.
    expect(total(after.heroes.find((h) => h.id === 'mira')!)).toBe(24);
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
    const after = grantLoot(save, [], { ...emptyLoot(), gear: [{ uid: '', itemId: 'sword1', rarity: 'rare' as const }] }, NOW);
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
        gear: [{ uid: '', itemId: 'sword1', rarity: 'common' as const }],
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
