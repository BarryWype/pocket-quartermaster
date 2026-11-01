import { Profiler } from 'react';
import { Keyboard } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { router } from 'expo-router';

import { dungeons } from '@/content/dungeons';
import { newHero } from '@/content/heroes';
import { items } from '@/content/items';
import { materials } from '@/content/materials';
import { recipes } from '@/content/recipes';
import type { Quest } from '@/game/quests/types';
import { createInitialSave, type SaveData } from '@/game/save';
import { equip } from '@/game/team/team';
import { t } from '@/i18n';
import { useGameStore } from '@/store/gameStore';
import type { GearInstance, Quality } from '@/game/types';

import { IslandMenu } from './IslandMenu';

jest.mock('expo-router', () => ({
  usePathname: () => '/forge',
  router: { push: jest.fn(), replace: jest.fn() },
}));

const pushMock = router.push as jest.Mock;
const replaceMock = router.replace as jest.Mock;

// The keyboard events the tests fire, by name, as IslandMenu registered them.
const keyboardEvents: Record<string, () => void> = {};

beforeAll(() => {
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, handler: () => void) => {
    keyboardEvents[event] = handler;
    return { remove: () => { delete keyboardEvents[event]; } };
  }) as typeof Keyboard.addListener);
});

beforeEach(() => {
  pushMock.mockClear();
  replaceMock.mockClear();
});

const QUALITIES: Quality[] = ['crappy', 'normal', 'uncommon', 'rare'];

/** Tiers 1 and 2 cleared, tier 3 half way: six heroes at level 9, ~40 gear pieces, a full storeroom. */
function midGameSave(): SaveData {
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

/** Mounts the menu under a render-counting Profiler and returns the count's reader. */
function mountMenu(): { tree: ReactTestRenderer; renders: () => number } {
  let renders = 0;
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 800 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <Profiler id="menu" onRender={() => { renders += 1; }}>
          <IslandMenu />
        </Profiler>
      </SafeAreaProvider>,
    );
  });
  return { tree, renders: () => renders };
}

/** A save write the way the game makes one: a new save object into the store. */
function writeSave(change: (save: SaveData) => SaveData) {
  act(() => {
    useGameStore.setState((state) => ({ save: change(state.save) }));
  });
}

describe('IslandMenu', () => {
  it('re-renders only when a badge or the tutorial target changes', () => {
    useGameStore.setState({ save: midGameSave() });
    const { tree, renders } = mountMenu();
    expect(renders()).toBe(1);

    // Gold, a material count and a new gear piece feed no badge.
    writeSave((save) => ({ ...save, gold: save.gold + 10 }));
    writeSave((save) => {
      const first = Object.keys(save.materials)[0];
      return { ...save, materials: { ...save.materials, [first]: save.materials[first] + 1 } };
    });
    writeSave((save) => ({ ...save, gear: [...save.gear, { uid: 'extra', itemId: save.gear[0].itemId, quality: 'normal' }] }));
    expect(renders()).toBe(1);

    // An unseen quest lights the quests badge: exactly one re-render.
    const quest: Quest = {
      id: 'q1',
      objective: 'visit',
      band: 'short',
      arrivedAt: 0,
      expiresAt: 1,
      acceptedAt: null,
      amount: 1,
      progress: 0,
      target: null,
      doneAt: null,
      seen: false,
    };
    writeSave((save) => ({ ...save, quests: { ...save.quests, list: [...save.quests.list, quest] } }));
    expect(renders()).toBe(2);
    act(() => tree.unmount());
  });

  it('hides while the keyboard is open, without unmounting', () => {
    useGameStore.setState({ save: midGameSave() });
    const { tree } = mountMenu();
    act(() => {
      keyboardEvents.keyboardDidShow();
    });
    const styles = tree.root
      .findAll((node) => Array.isArray(node.props.style))
      .flatMap((node) => node.props.style as unknown[]);
    expect(styles).toContainEqual({ display: 'none' });
    // Hidden, not unmounted: the menu's own node is still in the tree.
    expect(tree.root.findAllByType(IslandMenu)).toHaveLength(1);
    expect(tree.toJSON()).not.toBeNull();
    act(() => tree.unmount());
  });

  it('ignores a tap on the current screen, and replaces towards the others', () => {
    useGameStore.setState({ save: midGameSave() });
    const { tree } = mountMenu();

    // Open the craft dropdown: the diamond items style their rows as a function.
    act(() => {
      tree.root.findByProps({ accessibilityLabel: t('menu.craftClosed') }).props.onPress();
    });
    const dropdownItems = tree.root.findAll((node) => typeof node.props.onPress === 'function' && typeof node.props.style === 'function');
    // The dropdown opens with Forge, the screen the menu is on: nothing to navigate.
    act(() => {
      dropdownItems[0].props.onPress();
    });
    expect(pushMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();

    // Team from any non-map screen replaces, so Back returns to the map.
    act(() => {
      tree.root.findByProps({ accessibilityLabel: t('screens.team') }).props.onPress();
    });
    expect(pushMock).not.toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith('/team', { dangerouslySingular: true });
    act(() => tree.unmount());
  });
});
