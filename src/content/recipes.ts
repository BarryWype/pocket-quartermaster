import type { MaterialStack, RecipeDef } from '@/game/types';

const inputs = (counts: Record<string, number>): MaterialStack[] =>
  Object.entries(counts).map(([materialId, amount]) => ({ materialId, amount }));

const forge = (itemId: string, counts: Record<string, number>, unlockedByDefault = true): RecipeDef => ({
  id: itemId,
  station: 'forge',
  itemId,
  inputs: inputs(counts),
  unlockedByDefault,
});

// Tier gear is known from the start and gated by materials: each material
// needs the pickaxe of the tier below. Pickaxe blueprints from copper up are
// first-clear rewards of the first three dungeons.
export const recipes: RecipeDef[] = [
  // Wood
  forge('woodPickaxe', { wood: 1 }),
  forge('woodSword', { wood: 3 }),
  forge('woodBow', { wood: 3, hide: 1 }),
  forge('woodWand', { wood: 2, herb: 1 }),
  forge('woodArmor', { wood: 4, hide: 1 }),

  // Stone
  forge('stonePickaxe', { stone: 3, wood: 2 }),
  forge('stoneSword', { stone: 4, wood: 1 }),
  forge('stoneBow', { wood: 3, stone: 2, hide: 1 }),
  forge('stoneWand', { stone: 3, wood: 1, herb: 1 }),
  forge('stoneArmor', { stone: 4, hide: 2 }),

  // Copper
  forge('copperPickaxe', { copperOre: 4, wood: 2 }, false),
  forge('copperSword', { copperOre: 5, wood: 1 }),
  forge('copperBow', { wood: 3, copperOre: 3, hide: 1 }),
  forge('copperWand', { copperOre: 3, wood: 2 }),
  forge('copperArmor', { copperOre: 6, hide: 2 }),

  // Iron
  forge('ironPickaxe', { ironOre: 5, wood: 2 }, false),
  forge('ironSword', { ironOre: 6, hide: 1 }),
  forge('ironBow', { ironOre: 4, wood: 3, bone: 1 }),
  forge('ironWand', { ironOre: 4, crystal: 1 }),
  forge('ironArmor', { ironOre: 8, hide: 3 }),

  // Steel: iron forged with coal
  forge('steelPickaxe', { ironOre: 5, coal: 4, wood: 2 }, false),
  forge('steelSword', { ironOre: 6, coal: 4, hide: 1 }),
  forge('steelBow', { ironOre: 4, coal: 3, wood: 3, bone: 2 }),
  forge('steelWand', { ironOre: 3, coal: 3, crystal: 2 }),
  forge('steelArmor', { ironOre: 8, coal: 5, hide: 3 }),

  // Legendary
  forge('starforgedBlade', { starMetal: 1, ironOre: 6, coal: 4 }, false),
  forge('moonweaveCloak', { moonpetal: 1, hide: 4, crystal: 2 }, false),

  // Alchemy
  {
    id: 'healingPotion',
    station: 'alchemy',
    itemId: 'healingPotion',
    inputs: inputs({ herb: 2, berries: 1 }),
    unlockedByDefault: true,
  },
  {
    id: 'ration',
    station: 'alchemy',
    itemId: 'ration',
    inputs: inputs({ meat: 2, berries: 1 }),
    unlockedByDefault: true,
  },
  {
    id: 'fireResistanceElixir',
    station: 'alchemy',
    itemId: 'fireResistanceElixir',
    inputs: inputs({ mushroom: 2, herb: 1, crystal: 1 }),
    unlockedByDefault: false,
  },
];
