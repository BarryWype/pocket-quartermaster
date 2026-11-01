/**
 * Issue 18: how long each menu screen's first render takes.
 *
 * Every screen the bottom menu and the hero list open is mounted with
 * react-test-renderer on a mid-game save (three tiers unlocked, six heroes,
 * ~40 gear pieces, every material and consumable in stock), cold (first mount
 * in a fresh module registry, `jest.isolateModules`, modules loaded before the
 * timing) and warm (a second mount in that registry). `dailyRotation` cold has
 * its own row, since Expeditions pays it inside its first render. The table is
 * logged, not asserted: it is a measurement, and the numbers move with the
 * machine.
 *
 * Phone estimate: ×4, the same assumption as issue 17's measurement
 * (src/perf/expeditionsFirstOpen.test.ts).
 */
import type { ComponentType } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

import { dungeons } from '@/content/dungeons';
import { newHero } from '@/content/heroes';
import { items } from '@/content/items';
import { materials } from '@/content/materials';
import { recipes } from '@/content/recipes';
import { rotationDay } from '@/game/dungeons/rotation';
import { createInitialSave, type SaveData } from '@/game/save';
import { equip } from '@/game/team/team';
import type { GearInstance, Quality } from '@/game/types';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useFocusEffect: () => {},
  usePathname: () => '/',
  useLocalSearchParams: () => ({ heroId: 'bram' }),
  router: { push: () => {}, back: () => {}, replace: () => {}, navigate: () => {} },
  Stack: { Screen: () => null },
}));

// Screens ask for permissions in effects; the test answers "not granted".
jest.mock('expo-location', () => {
  const denied = () => Promise.resolve({ granted: false, status: 'denied', canAskAgain: true });
  return {
    ...jest.requireActual('expo-location'),
    requestForegroundPermissionsAsync: denied,
    getForegroundPermissionsAsync: denied,
    requestBackgroundPermissionsAsync: denied,
    getBackgroundPermissionsAsync: denied,
    hasStartedLocationUpdatesAsync: () => Promise.resolve(false),
  };
});

const PHONE_FACTOR = 4;

/** The screens the bottom menu and the hero list open, by route module. */
const SCREENS: [name: string, path: string][] = [
  ['expeditions', '@/app/expeditions'],
  ['forge', '@/app/forge'],
  ['infuse', '@/app/infuse'],
  ['provisions', '@/app/provisions'],
  ['inventory', '@/app/inventory'],
  ['team', '@/app/team/index'],
  ['hero', '@/app/team/[heroId]'],
  ['quests', '@/app/quests'],
  ['guild', '@/app/guild'],
  ['settings', '@/app/settings'],
  ['tips', '@/app/tips'],
];

const QUALITIES: Quality[] = ['crappy', 'normal', 'uncommon', 'rare'];

/** Tiers 1 and 2 cleared, tier 3 half way: six heroes at level 9, ~40 gear pieces, a full storeroom. */
export function midGameSave(): SaveData {
  const base = createInitialSave();
  const heroes = [
    ...base.heroes,
    newHero('kara', 'Kara', 'barbarian', 'none', 9),
    newHero('tobin', 'Tobin', 'thief', 'none', 9),
    newHero('wren', 'Wren', 'frostMage', 'none', 9),
  ].map((h) => ({ ...h, level: 9 }));
  const gearItems = items.filter((i) => (i.slot === 'weapon' || i.slot === 'armor' || i.slot === 'offhand') && i.tier <= 3);
  const gear: GearInstance[] = Array.from({ length: 40 }, (_, i) => ({
    uid: `g${i}`,
    itemId: gearItems[(i * 7) % gearItems.length].id,
    quality: QUALITIES[i % QUALITIES.length],
  }));
  let save: SaveData = {
    ...base,
    revealAll: true,
    tutorial: { ...base.tutorial, step: 'done' },
    heroes,
    gold: 2500,
    clearedDungeons: dungeons.filter((d) => d.tier < 3 || (d.tier === 3 && (d.chainIndex ?? 9) < 3)).map((d) => d.id),
    gear,
    tools: ['woodPickaxe', 'stonePickaxe', 'copperPickaxe'],
    knownRecipes: recipes.map((r) => r.id),
    materials: Object.fromEntries(materials.map((m) => [m.id, 25])),
    consumables: Object.fromEntries(items.filter((i) => i.slot === 'consumable').map((i) => [i.id, 3])),
  };
  heroes.slice(0, 6).forEach((hero, i) => {
    const weapon = gear.find((g, j) => j % 6 === i && items.find((it) => it.id === g.itemId)?.slot === 'weapon');
    if (weapon) save = equip(save, hero.id, 'weapon', weapon.uid);
  });
  return save;
}

const ms = (value: number) => `${Math.round(value)} ms`;

describe('the first opening of each menu screen', () => {
  it('times each screen cold and warm', () => {
    const save = midGameSave();
    const rows: { name: string; cold: number; warm: number }[] = [];

    jest.isolateModules(() => {
      const rotation = jest.requireActual<typeof import('@/game/dungeons/rotation')>('@/game/dungeons/rotation');
      const start = performance.now();
      rotation.dailyRotation(rotationDay(Date.now()));
      const cold = performance.now() - start;
      const again = performance.now();
      rotation.dailyRotation(rotationDay(Date.now()));
      rows.push({ name: 'dailyRotation(today)', cold, warm: performance.now() - again });
    });

    for (const [name, path] of SCREENS) {
      jest.isolateModules(() => {
        jest.requireActual<typeof import('@/store/gameStore')>('@/store/gameStore').useGameStore.setState({ save });
        // The renderer and React come from the same fresh registry as the screen.
        const { act, create } = jest.requireActual<typeof import('react-test-renderer')>('react-test-renderer');
        const react = jest.requireActual<typeof import('react')>('react');
        const Screen = jest.requireActual<{ default: ComponentType }>(path).default;
        const mount = () => {
          let renderer: ReactTestRenderer | undefined;
          const start = performance.now();
          act(() => {
            renderer = create(react.createElement(Screen));
          });
          const took = performance.now() - start;
          act(() => renderer!.unmount());
          return took;
        };
        const cold = mount();
        rows.push({ name: `screen: ${name}`, cold, warm: mount() });
      });
    }

    const lines = [
      '| item (dev machine) | cold | warm | phone cold (×4) |',
      '| --- | --- | --- | --- |',
      ...rows.map((r) => `| ${r.name} | ${ms(r.cold)} | ${ms(r.warm)} | ${ms(r.cold * PHONE_FACTOR)} |`),
    ];
    console.log(lines.join('\n'));
    expect(rows).toHaveLength(SCREENS.length + 1);
  });
});
