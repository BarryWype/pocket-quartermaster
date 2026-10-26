import { startingHeroes } from '@/content/heroes';
import { items } from '@/content/items';
import { dungeonById } from '@/content/lookup';

import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import { resolveExpedition, startExpedition } from './expeditions';
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
    consumables: { healingPotion: 3 },
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
});
