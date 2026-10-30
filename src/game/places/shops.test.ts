import { itemById, monsterPartById, recipeById } from '@/content/lookup';
import { secretRules } from '@/content/secrets';
import { materialPrices, shopRules } from '@/content/shops';

import { forgedItem, isKnown } from '../crafting/crafting';
import { rollTip } from '../secrets/tips';
import { valuableSellPrice, todaysCollector } from '../loot/valuables';
import { createInitialSave, type SaveData } from '../save';
import type { GearDef, GearInstance } from '../types';
import type { LatLng } from '../generation/types';
import type { PlaceSpawn } from './generate';
import {
  buy,
  buyProblem,
  gearSellPrice,
  isSoldOut,
  materialSellPrice,
  placeStock,
  sellGear,
  sellGearProblem,
  placeValuablePrice,
  sellMaterial,
  sellMaterialProblem,
  sellValuable,
  sellValuableProblem,
  stockLeft,
} from './shops';

const position: LatLng = { latitude: -41.2865, longitude: 174.7762 };
const far: LatLng = { latitude: -41.29, longitude: 174.7762 };
const now = 0;

const spawnOf = (kind: PlaceSpawn['kind'], suffix = '0:1'): PlaceSpawn => ({
  id: `place:${kind}:tile:${suffix}`,
  kind,
  group: kind,
  tile: 'tile',
  position,
  startsAt: 0,
  expiresAt: 1e15,
  roll: 0,
});

const withGold = (gold: number, extra: Partial<SaveData> = {}): SaveData => ({
  ...createInitialSave(),
  gold,
  ...extra,
});

describe('placeStock', () => {
  it('is deterministic for the same spawn, and rotates for a new place id', () => {
    const save = withGold(100);
    const spawn = spawnOf('sawmill');
    expect(placeStock(save, spawn, now)).toEqual(placeStock(save, spawn, now));
    const fresh = placeStock(save, spawnOf('sawmill', '0:2'), now);
    expect(fresh[0].key).toBe('material:wood');
  });

  it('stocks the sawmill with wood at the config price', () => {
    const line = placeStock(withGold(100), spawnOf('sawmill'), now)[0];
    expect(line.kind).toBe('material');
    expect(line.id).toBe('wood');
    expect(line.amount).toBeGreaterThanOrEqual(5);
    expect(line.amount).toBeLessThanOrEqual(10);
    expect(line.price).toBe(materialPrices.wood);
  });

  it('sells only gear within the unlocked tier at the smithy, and only unknown recipes', () => {
    const save = withGold(1000);
    const lines = placeStock(save, spawnOf('smithy'), now);
    const gearLines = lines.filter((l) => l.kind === 'gear');
    expect(gearLines.length).toBeGreaterThanOrEqual(shopRules.smithy.gearLines[0]);
    expect(gearLines.length).toBeLessThanOrEqual(shopRules.smithy.gearLines[1]);
    for (const line of gearLines) {
      const item = itemById[line.id] as GearDef;
      expect(item.tier).toBeLessThanOrEqual(1);
      expect(line.price).toBe(Math.round(shopRules.gearPrice[0] * shopRules.qualityPrice[line.gear!.quality]));
      expect(line.gear!.roll).toBe(1);
    }
    const recipeLines = lines.filter((l) => l.kind === 'recipe');
    expect(recipeLines.length).toBeLessThanOrEqual(1);
    for (const line of recipeLines) {
      expect(isKnown(save, recipeById[line.id])).toBe(false);
    }
  });

  it('never offers a known blueprint at the smithy or the library, whatever the place', () => {
    const tier1 = Object.values(recipeById).filter((r) => forgedItem(r)?.tier === 1);
    const unknown = tier1.find((r) => r.id === 'axe1')!;
    const save = withGold(1000, { knownRecipes: [...createInitialSave().knownRecipes, ...tier1.filter((r) => r !== unknown).map((r) => r.id)] });
    for (let i = 0; i < 40; i++) {
      for (const kind of ['smithy', 'library'] as const) {
        for (const line of placeStock(save, spawnOf(kind, `${i}:1`), now).filter((l) => l.kind === 'recipe')) {
          expect(isKnown(save, recipeById[line.id])).toBe(false);
        }
      }
    }
  });
});

describe('buy', () => {
  it('deducts gold, adds the material and reduces the stock left', () => {
    const spawn = spawnOf('sawmill');
    const save = withGold(100);
    const line = placeStock(save, spawn, now)[0];
    const next = buy(save, spawn, line.key, 3, position, now);
    expect(next.gold).toBe(100 - materialPrices.wood * 3);
    expect(next.materials.wood).toBe(3);
    expect(stockLeft(next, spawn, line)).toBe(line.amount - 3);
    expect(next.placePurchases[spawn.id]).toEqual({ expiresAt: spawn.expiresAt, bought: { [line.key]: 3 } });
  });

  it('refuses the same problems the other place actions have', () => {
    const spawn = spawnOf('sawmill');
    const save = withGold(100);
    const line = placeStock(save, spawn, now)[0];
    expect(buyProblem(save, spawn, line.key, 1, far, now)).toBe('tooFar');
    expect(buyProblem(withGold(0), spawn, line.key, 1, position, now)).toBe('gold');
    expect(buyProblem(save, spawn, line.key, line.amount + 1, position, now)).toBe('soldOut');
    expect(buyProblem(save, spawn, 'material:none', 1, position, now)).toBe('gone');
    // A mine above the pickaxe tier never opens its shop.
    const mine = spawnOf('copperMine');
    const copper = placeStock(save, mine, now)[0];
    expect(buyProblem(save, mine, copper.key, 1, position, now)).toBe('locked');
  });

  it('marks the place used once the last unit is bought', () => {
    const spawn = spawnOf('sawmill');
    const save = withGold(100);
    const line = placeStock(save, spawn, now)[0];
    const next = buy(save, spawn, line.key, line.amount, position, now);
    expect(isSoldOut(next, spawn, now)).toBe(true);
    expect(next.usedPlaces[spawn.id]).toBe(spawn.expiresAt);
    expect(buyProblem(next, spawn, line.key, 1, position, now)).toBe('gone');
  });

  it('teaches a bought recipe, and refuses a second buy of it', () => {
    const spawn = spawnOf('smithy');
    const save = withGold(1000);
    const line = placeStock(save, spawn, now).find((l) => l.kind === 'recipe')!;
    const next = buy(save, spawn, line.key, 1, position, now);
    expect(isKnown(next, recipeById[line.id])).toBe(true);
    expect(buyProblem(next, spawn, line.key, 1, position, now)).toBe('known');
  });
  it('sells the wanted poster at the tavern once tier 1 is unlocked', () => {
    const spawn = spawnOf('tavern');
    const lines = placeStock(withGold(100), spawn, now);
    expect(lines).toEqual([{ key: 'item:wantedPoster', kind: 'item', id: 'wantedPoster', amount: 1, price: 15 }]);

    const next = buy(withGold(100), spawn, 'item:wantedPoster', 1, position, now);
    expect(next.consumables.wantedPoster).toBe(1);
    expect(next.gold).toBe(85);
    expect(buyProblem(next, spawn, 'item:wantedPoster', 1, position, now)).toBe('soldOut');
    // A tavern with only a weakness line is never sold out, so it stays usable.
    expect(isSoldOut(next, spawn, now)).toBe(false);
    expect(next.usedPlaces).toEqual({});
  });

  it('sells the healing potion of the player’s tier at the apothecary, or the one below', () => {
    const potionsSold = (clearedDungeons: string[]) =>
      new Set(
        Array.from({ length: 40 }, (_, i) => placeStock(withGold(100, { clearedDungeons }), spawnOf('apothecary', `0:${i}`), now)[0].id),
      );
    expect(potionsSold([])).toEqual(new Set(['healingPotion']));
    expect(potionsSold(['banditStockade', 'ogreQuarry'])).toEqual(new Set(['standardHealingPotion', 'healingPotion']));
    expect(potionsSold(['banditStockade', 'ogreQuarry', 'drownedCrypt', 'giantsHall'])).toEqual(
      new Set(['greaterHealingPotion', 'standardHealingPotion']),
    );
  });

  it('sells the decoy hoard only once tier 5 is unlocked', () => {
    const market = spawnOf('market');
    const fresh = placeStock(withGold(1000), market, now);
    expect(fresh.map((l) => l.id)).not.toContain('decoyHoard');

    const save = withGold(1000, { clearedDungeons: ['banditStockade', 'ogreQuarry', 'drownedCrypt', 'giantsHall'] });
    const lines = placeStock(save, market, now);
    expect(lines[lines.length - 1]).toEqual({ key: 'item:decoyHoard', kind: 'item', id: 'decoyHoard', amount: 1, price: 300 });
    // The normal market lines stay exactly what they were before the unlock.
    expect(lines.slice(0, -1)).toEqual(placeStock(withGold(1000), market, now));
  });

  it('leaves the chapel empty until the lich’s tier opens, and keeps it usable', () => {
    const chapel = spawnOf('chapel');
    expect(placeStock(withGold(100), chapel, now)).toEqual([]);
    const save = withGold(100, { clearedDungeons: ['banditStockade', 'ogreQuarry'] });
    const next = buy(save, chapel, 'item:fontWater', 1, position, now);
    expect(next.consumables.fontWater).toBe(1);
    expect(isSoldOut(next, chapel, now)).toBe(false);
    expect(next.usedPlaces).toEqual({});
  });

  it('appends the weakness line after the apothecary’s normal stock', () => {
    const save = withGold(1000, { clearedDungeons: ['banditStockade', 'ogreQuarry', 'drownedCrypt'] });
    const lines = placeStock(save, spawnOf('apothecary'), now);
    expect(lines.map((l) => l.id).lastIndexOf('sleepingDraught')).toBe(lines.length - 1);
    expect(lines[lines.length - 1].price).toBe(120);
    expect(lines.length).toBe(4);
  });
});

describe('the library ledger', () => {
  const spawnWithTip = (rolls: boolean) => {
    for (let i = 0; i < 200; i++) {
      const spawn = spawnOf('library', `${i}:1`);
      if (rollTip('library', spawn.id) === rolls) return spawn;
    }
    throw new Error(`No library ${rolls ? 'rolling' : 'not rolling'} a tip`);
  };

  it('sells the ledger naming a hidden den only where the roll tips one, at the tier price', () => {
    const save = withGold(1000);
    expect(placeStock(save, spawnWithTip(true), now)).toContainEqual({
      key: 'tip:hiddenDen',
      kind: 'tip',
      id: 'hiddenDen',
      amount: 1,
      price: secretRules.ledgerPrice[0],
    });
    expect(placeStock(save, spawnWithTip(false), now).map((l) => l.key)).not.toContain('tip:hiddenDen');
  });

  it('hides the ledger while a hidden den tip is live', () => {
    const save = withGold(1000, {
      secretTips: [{ id: 'hiddenDen|x', secret: 'hiddenDen', source: 'traveller', sourceId: 'x', anchor: position, foundAt: 0, expiresAt: now + 3_600_000 }],
    });
    expect(placeStock(save, spawnWithTip(true), now).map((l) => l.key)).not.toContain('tip:hiddenDen');
  });

  it('buying the ledger grants the hidden den tip and charges the price', () => {
    const spawn = spawnWithTip(true);
    const next = buy(withGold(1000), spawn, 'tip:hiddenDen', 1, position, now);
    expect(next.gold).toBe(1000 - secretRules.ledgerPrice[0]);
    expect(next.secretTips).toHaveLength(1);
    expect(next.secretTips[0]).toMatchObject({ secret: 'hiddenDen', source: 'library', sourceId: spawn.id });
  });
});

describe('selling', () => {
  const gear: GearInstance = { uid: 'g9', itemId: 'sword1', quality: 'normal' };
  const smithy = spawnOf('smithy');

  it('refuses worn gear and pays the share for the rest', () => {
    const worn = withGold(0, { gear: [gear], heroes: createInitialSave().heroes.map((h) => (h.id === 'bram' ? { ...h, equipment: { ...h.equipment, weapon: 'g9' } } : h)) });
    expect(sellGearProblem(worn, smithy, gear.uid, position, now)).toBe('worn');
    expect(() => sellGear(worn, smithy, gear.uid, position, now)).toThrow();

    const spare = withGold(0, { gear: [gear] });
    expect(sellGearProblem(spare, smithy, gear.uid, position, now)).toBe(null);
    const sold = sellGear(spare, smithy, gear.uid, position, now);
    expect(sold.gold).toBe(gearSellPrice(gear));
    expect(sold.gear).toEqual([]);
    expect(gearSellPrice(gear)).toBe(Math.round(shopRules.gearPrice[0] * shopRules.qualityPrice.normal * shopRules.gearSellShare));
    expect(sellGearProblem(withGold(0), spawnOf('market'), gear.uid, position, now)).toBe('notSmithy');
  });

  it('buys surplus materials at the market and refuses unknown ones', () => {
    const market = spawnOf('market');
    const save = withGold(0, { materials: { wood: 10 } });
    expect(materialSellPrice('wood')).toBe(Math.max(1, Math.floor(materialPrices.wood * shopRules.materialSellShare)));
    expect(materialSellPrice('steel')).toBe(0);
    expect(sellMaterialProblem(save, market, 'steel', 1, position, now)).toBe('unsellable');
    expect(sellMaterialProblem(save, market, 'wood', 11, position, now)).toBe('notEnough');
    expect(sellMaterialProblem(save, spawnOf('sawmill'), 'wood', 1, position, now)).toBe('notMarket');
    // The hunting lodge and apothecary buy monster parts only, at the part's price.
    const parts = { ...save, materials: { ...save.materials, goblinEar: 2 } };
    for (const kind of ['huntingLodge', 'apothecary'] as const) {
      expect(materialSellPrice('goblinEar', kind)).toBe(monsterPartById.goblinEar.sellPrice);
      expect(sellMaterialProblem(parts, spawnOf(kind), 'wood', 1, position, now)).toBe('unsellable');
      expect(sellMaterial(parts, spawnOf(kind), 'goblinEar', 2, position, now).gold).toBe(parts.gold + monsterPartById.goblinEar.sellPrice * 2);
    }
    expect(materialSellPrice('goblinEar')).toBe(0);

    const next = sellMaterial(save, market, 'wood', 4, position, now);
    expect(next.gold).toBe(materialSellPrice('wood') * 4);
    expect(next.materials.wood).toBe(6);
    expect(() => sellMaterial(save, market, 'wood', 11, position, now)).toThrow();
  });

  it('buys valuables at the collector price, full price elsewhere and refuses non-buyers', () => {
    const market = spawnOf('market');
    const save = withGold(0, { valuables: { 'oldCoins:2': 2, 'jadeIdol:2': 2 } });
    const wanted = todaysCollector(save, market.id, now);
    const key = wanted === 'oldCoins' ? 'oldCoins:2' : 'jadeIdol:2';
    const other = wanted === 'oldCoins' ? 'jadeIdol:2' : 'oldCoins:2';
    expect(placeValuablePrice(save, market, key, now)).toBe(
      valuableSellPrice(key.slice(0, key.lastIndexOf(':')), 2, 'market', wanted),
    );
    expect(placeValuablePrice(save, market, other, now)).toBe(valuableSellPrice(other.slice(0, other.lastIndexOf(':')), 2, 'market'));

    const next = sellValuable(save, market, key, 1, position, now);
    expect(next.gold).toBe(placeValuablePrice(save, market, key, now));
    expect(next.valuables[key]).toBe(1);
    const last = sellValuable(next, market, other, 2, position, now);
    expect(last.valuables[other]).toBeUndefined();
    expect(() => sellValuable(last, market, other, 1, position, now)).toThrow();

    const chapel = spawnOf('chapel');
    expect(sellValuableProblem(save, chapel, 'oldCoins:2', 1, position, now)).toBe('notBuyer');
    expect(() => sellValuable(save, chapel, 'oldCoins:2', 1, position, now)).toThrow();
    expect(sellValuableProblem(save, spawnOf('sawmill'), 'oldCoins:2', 1, position, now)).toBe('notBuyer');
    expect(sellValuableProblem(save, market, 'oldCoins:2', 4, position, now)).toBe('notEnough');

    const smithy = spawnOf('smithy');
    expect(placeValuablePrice(save, smithy, 'oldCoins:2', now)).toBe(Math.round(valuableSellPrice('oldCoins', 2, 'market') * 0.5));
    expect(placeValuablePrice(save, market, 'oldCoins:2', now)).toBe(
      wanted === 'oldCoins' ? valuableSellPrice('oldCoins', 2, 'market') * 2 : valuableSellPrice('oldCoins', 2, 'market'),
    );
  });
});
