import { dungeons } from '@/content/dungeons';
import { heroClasses } from '@/content/heroes';
import { itemById, monsterPartById, materialById } from '@/content/lookup';
import { shopStock } from '@/content/shops';
import { valuables } from '@/content/loot/valuables';
import { lootConfig } from '@/content/loot/config';

import { recipes } from '@/content/recipes';
import { createInitialSave, type SaveData } from '../save';
import type { LatLng } from '../generation/types';
import type { PlaceSpawn } from './generate';
import { placeStock, gearSellPrice, materialSellPrice } from './shops';
import { blackMarketGoods } from '../secrets/places';
import { tavernOffers } from '../taverns/taverns';
import { valuableSellPrice } from '../loot/valuables';
import { apothecaryCarePrice, trainPrice } from './services';
import { forgedItem } from '../crafting/crafting';

const position: LatLng = { latitude: -41.2865, longitude: 174.7762 };
const now = 0;

const spawnOf = (kind: PlaceSpawn['kind'], suffix: string): PlaceSpawn => ({
  id: `place:${kind}:tile:${suffix}`,
  kind,
  group: kind,
  tile: 'tile',
  position,
  startsAt: 0,
  expiresAt: 1e15,
  roll: 0,
});

/** A save whose player has reached `tier`, knows every recipe and has one hero of every class. */
function saveAtTier(tier: number): SaveData {
  const save = createInitialSave();
  const bossIds = dungeons.filter((d) => d.isBoss && d.tier < tier).map((d) => d.id);
  const template = save.heroes[0]!;
  const heroes = (Object.keys(heroClasses) as (keyof typeof heroClasses)[]).map((classId, i) => ({
    ...template,
    id: `hero:${classId}`,
    classId,
    name: `Hero ${i}`,
  }));
  return {
    ...save,
    heroes,
    clearedDungeons: bossIds,
    knownRecipes: recipes.map((r) => r.id),
    gold: 1_000_000,
  };
}

const finite = (value: number | undefined, what: string) => {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${what} has no usable price: ${String(value)}`);
  }
};

const TIERS = [1, 2, 3, 4, 5];

describe('every shop price is finite and positive at every tier', () => {
  it.each(TIERS)('stock lines at tier %i', (tier) => {
    const save = saveAtTier(tier);
    const kinds = [
      ...(Object.keys(shopStock) as PlaceSpawn['kind'][]),
      'smithy',
      'library',
      'market',
      'tavern',
      'huntingLodge',
      'apothecary',
    ] as PlaceSpawn['kind'][];
    for (const kind of kinds) {
      for (let i = 1; i <= 25; i++) {
        for (const line of placeStock(save, spawnOf(kind, `0:${i}`), now)) {
          finite(line.price, `${kind} stock line ${line.key} (tier ${tier})`);
        }
      }
    }
  });

  it.each(TIERS)('buy prices at tier %i', (tier) => {
    const save = saveAtTier(tier);
    // Tavern recruits and emergency supply
    for (let i = 1; i <= 10; i++) {
      for (const offer of tavernOffers(save, `place:tavern:tile:0:${i}`, now)) {
        finite(offer.price, `tavern offer ${offer.id}`);
      }
    }
    // Black market goods
    for (let i = 1; i <= 10; i++) {
      for (const line of blackMarketGoods(save, spawnOf('blackMarket', `0:${i}`))) {
        finite(line.price, `black market line ${line.key}`);
      }
    }
    // Services
    finite(apothecaryCarePrice(save, 'heal'), 'apothecary heal');
    finite(apothecaryCarePrice(save, 'rest'), 'apothecary rest');
    finite(trainPrice(save), 'library training');
  });

  it.each(TIERS)('sell prices at tier %i', () => {
    for (const [id, def] of Object.entries(materialById)) {
      const price = materialSellPrice(id, 'market');
      if (def && price !== 0) finite(price, `market sell price of ${id}`);
    }
    for (const [id, part] of Object.entries(monsterPartById)) {
      if (!part) continue;
      for (const kind of ['huntingLodge', 'apothecary'] as const) {
        const price = materialSellPrice(id, kind);
        if (price !== 0) finite(price, `${kind} price of monster part ${id}`);
      }
    }
    for (const valuable of valuables) {
      for (const tier2 of TIERS) {
        for (const buyer of lootConfig.valuables.buyers) {
          const price = valuableSellPrice(valuable.id, tier2, buyer);
          if (price !== 0) finite(price, `${buyer} price of ${valuable.id} tier ${tier2}`);
        }
      }
    }
    for (const recipe of recipes) {
      const item = forgedItem(recipe);
      if (!item) continue;
      for (const quality of ['crappy', 'normal', 'uncommon', 'rare', 'legendary'] as const) {
        finite(
          gearSellPrice({ uid: 'u', itemId: item.id, quality, roll: 1 }),
          `smithy price of ${item.id} (${quality})`,
        );
      }
    }
    // Every item any shop stocks exists in the catalogue
    for (const line of Object.values(shopStock).flat()) {
      const ids = line.pool ?? [line.id!];
      for (const id of ids) {
        if (line.kind === 'material') expect(materialById[id]).toBeDefined();
        else expect(itemById[id]).toBeDefined();
      }
    }
  });
});
