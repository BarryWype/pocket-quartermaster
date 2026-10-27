import { startingHeroes } from '@/content/heroes';
import { items } from '@/content/items';
import { dungeonById } from '@/content/lookup';

import { createInitialSave, type SaveData } from '../save';
import { setHeroHp } from '../team/health';
import { equip } from '../team/team';
import { resolveExpedition, startExpedition, type Loadout } from './expeditions';
import { estimateOdds } from './odds';

const ALL = startingHeroes.map((h) => h.id);
const WEAPONS = ['Sword', 'Bow', 'Wand'];

/** The starting heroes at a level, in a tier's weapons and armour (Normal), each with a healing potion. */
function team(tier: number, level: number): SaveData {
  const material = items.find((i) => i.slot === 'armor' && i.tier === tier)!.id.replace('Armour', '');
  let save: SaveData = {
    ...createInitialSave(),
    tutorial: { step: 'done', woodSpot: null },
    clearedDungeons: ['banditStockade', 'ogreQuarry', 'drownedCrypt', 'giantsHall'],
    heroes: createInitialSave().heroes.map((h) => ({ ...h, level })),
    consumables: { ...createInitialSave().consumables, healingPotion: 3 },
    gear: ALL.flatMap((_, i) => [
      { uid: `w${i}`, itemId: `${material}${WEAPONS[i]}`, quality: 'normal' as const },
      { uid: `a${i}`, itemId: `${material}Armour`, quality: 'normal' as const },
    ]),
  };
  ALL.forEach((id, i) => {
    save = equip(equip(equip(save, id, 'weapon', `w${i}`), id, 'armor', `a${i}`), id, 'consumable', 'healingPotion');
  });
  return save;
}

describe('odds preview', () => {
  const N = 1000;
  const cases: [string, number, number][] = [
    ['ratCellar', 1, 1],
    ['ogreQuarry', 2, 3],
    ['wolfDen', 2, 3],
    ['drownedCrypt', 3, 5],
  ];
  for (const [dungeonId, tier, level] of cases) {
    it(`matches the real resolution of ${dungeonId} within 5 points`, () => {
      const save = team(tier, level);
      const estimate = estimateOdds(save, ALL, dungeonById[dungeonId], N).success;
      let wins = 0;
      for (let i = 0; i < N; i++) {
        const started = startExpedition({ ...save, nextUid: 10_000 + i }, dungeonId, ALL, i * 1000);
        if (resolveExpedition(started, started.expeditions[0]).report.success) wins++;
      }
      expect(Math.abs(estimate - wins / N)).toBeLessThan(0.05);
    });
  }

  /** The same check with hurt heroes, short supply, a meal, a kit and a charm. */
  const prepared = (): SaveData => {
    let save = team(2, 3);
    save = setHeroHp(save, 'bram', 0.5, 0);
    save = setHeroHp(save, 'mira', 0.7, 0);
    save = { ...save, consumables: { ...save.consumables, trailMix: 1, huntersStew: N, ropeAndPitons: N, wardBone: 1 } };
    save = equip(equip(save, 'lyra', 'consumable', 'wardBone'), 'mira', 'consumable', 'healingPotion');
    return save;
  };
  const loadouts: [string, string, Loadout][] = [
    ['ogreQuarry', 'Hunter’s stew', { mealId: 'huntersStew' }],
    ['millRuins', 'rope and pitons', { kitId: 'ropeAndPitons' }],
  ];
  for (const [dungeonId, what, loadout] of loadouts) {
    it(`matches the real resolution of ${dungeonId} with hurt, underfed heroes and ${what} within 5 points`, () => {
      const save = { ...prepared(), clearedDungeons: ['banditStockade'] };
      const estimate = estimateOdds(save, ALL, dungeonById[dungeonId], N, { now: 0, loadout }).success;
      let wins = 0;
      for (let i = 0; i < N; i++) {
        const started = startExpedition({ ...save, nextUid: 10_000 + i }, dungeonId, ALL, 0, 1, undefined, loadout);
        expect(started.expeditions[0].hunger).toBe('underfed');
        if (resolveExpedition(started, started.expeditions[0]).report.success) wins++;
      }
      expect(Math.abs(estimate - wins / N)).toBeLessThan(0.05);
    });
  }

  it('uses current HP, and shows the odds at full HP for comparison', () => {
    const save = { ...prepared(), clearedDungeons: ['banditStockade'] };
    const now = estimateOdds(save, ALL, dungeonById.ogreQuarry, 300, { now: 0 }).success;
    const full = estimateOdds(save, ALL, dungeonById.ogreQuarry, 300, { now: 0, fullHp: true }).success;
    const later = estimateOdds(save, ALL, dungeonById.ogreQuarry, 300, { now: 3_600_000 }).success;
    expect(full).toBeGreaterThan(now);
    expect(later).toBeGreaterThan(now);
  });

  it('includes the supply status', () => {
    const save = team(2, 3);
    const fed = estimateOdds(save, ALL, dungeonById.ogreQuarry, 300).success;
    const starving = estimateOdds({ ...save, consumables: { healingPotion: 3 } }, ALL, dungeonById.ogreQuarry, 300).success;
    expect(starving).toBeLessThan(fed - 0.05);
  });
});
