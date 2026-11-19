import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { offsetPosition } from '@/game/generation/geo';
import type { PlaceSpawn } from '@/game/places/generate';
import { placeStock, stockLeft } from '@/game/places/shops';
import { createInitialSave, type SaveData } from '@/game/save';
import { makeOrder } from '@/game/supply/orders';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';

import { LootGrid } from '../LootGrid';
import { PartyDialog } from '../PartyDialog';
import { ItemSlot } from '../ui';
import { PlaceSheet } from './PlaceSheet';
import { stockLook } from './placeText';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));

const NBSP = '\u00a0';
const origin = { latitude: -41.2865, longitude: 174.7762 };
const now = Date.now();
const near = offsetPosition(origin, 10, 0);
const far = offsetPosition(origin, 320, 0);

const spawn = (kind: PlaceSpawn['kind'], id = `${kind}-1`): PlaceSpawn => ({
  id,
  kind,
  group: 'g',
  tile: 't',
  position: origin,
  startsAt: now - 3_600_000,
  expiresAt: now + 2 * 3_600_000,
  roll: 0.3,
});

let renderer: ReactTestRenderer | null = null;
const render = (place: PlaceSpawn, player = near) =>
  act(() => {
    renderer = create(<PlaceSheet place={place} player={player} now={now} onClose={() => {}} />);
  });
const pressables = () => renderer!.root.findAll((node) => typeof node.props.title === 'string' && typeof node.props.onPress === 'function');
const titles = () => pressables().map((node) => node.props.title as string);
const button = (title: string) => pressables().find((node) => node.props.title === title)!;
const press = (title: string) =>
  act(() => {
    button(title).props.onPress();
  });
const tabLabels = () =>
  renderer!.root
    .findAll((node) => node.props.accessibilityRole === 'tab' && typeof node.props.onPress === 'function' && typeof node.props.accessibilityLabel === 'string')
    .map((node) => node.props.accessibilityLabel as string)
    .filter((label, i, all) => all.indexOf(label) === i);
const tiles = () => renderer!.root.findAllByType(ItemSlot).filter((node) => typeof node.props.onPress === 'function');
const setSave = (save: SaveData) =>
  act(() => {
    useGameStore.setState({ save });
  });

describe('place sheets on the template', () => {
  beforeEach(() => setSave({ ...createInitialSave(), gold: 5000 }));
  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = null;
  });

  it('Buy in the peek opens the shop; a picked one-off buys from the footer, with no quantity', () => {
    const smithy = spawn('smithy');
    const stock = placeStock(useGameStore.getState().save, smithy, now);
    const gear = stock.find((line) => line.kind === 'gear')!;
    render(smithy);
    press('Buy');
    expect(titles()).toContain('Pick something to buy');
    act(() => {
      tiles().find((node) => node.props.accessibilityLabel.startsWith(stockLook(gear).name))!.props.onPress();
    });
    const label = titles().find((title) => title.startsWith(`Buy ${stockLook(gear).name}`))!;
    expect(label).toContain('gold');
    expect(titles()).not.toContain('+');
    const before = useGameStore.getState().save.gold;
    press(label);
    expect(useGameStore.getState().save.gold).toBe(before - gear.price);
    expect(stockLeft(useGameStore.getState().save, smithy, gear)).toBe(0);
  });

  it('a stack asks for a quantity: + raises it, the footer says how many and the total', () => {
    const market = spawn('market');
    const stock = placeStock(useGameStore.getState().save, market, now);
    const stack = stock.find((line) => line.kind === 'material' && line.amount > 1)!;
    render(market);
    press('Buy');
    act(() => {
      tiles().find((node) => node.props.accessibilityLabel.startsWith(stockLook(stack).name))!.props.onPress();
    });
    press('+');
    const label = `Buy 2 × ${stockLook(stack).name} · ${stack.price * 2} gold`;
    expect(titles()).toContain(label);
    press(label);
    expect(stockLeft(useGameStore.getState().save, market, stack)).toBe(stack.amount - 2);
  });

  it('Sell beside Buy opens the sell side of the shop', () => {
    setSave({ ...createInitialSave(), gold: 5000, materials: { wood: 12 } });
    render(spawn('market'));
    press('Sell');
    expect(titles()).toContain('Pick something to sell');
    act(() => {
      tiles()[0].props.onPress();
    });
    expect(titles().some((title) => title.startsWith('Sell Wood'))).toBe(true);
  });

  it('far, the walk centres the map on the place and the sheet stays a peek', () => {
    const smithy = spawn('smithy');
    render(smithy, far);
    act(() => {
      useWorldStore.getState().set({ focusPlace: null });
    });
    press(`Walk 320${NBSP}m to trade`);
    expect(useWorldStore.getState().focusPlace).toEqual(origin);
    expect(titles()).toContain('More');
  });

  it('the order is a tab of its own, after the shop, with its progress in its label', () => {
    const smithy = spawn('smithy');
    const base = createInitialSave();
    setSave({
      ...base,
      gold: 5000,
      supply: { ...base.supply, debugUnlocked: true, discovered: { [smithy.id]: smithy.expiresAt }, orders: { [smithy.id]: makeOrder(base, smithy, now) } },
    });
    render(smithy);
    press('More');
    expect(tabLabels()).toEqual(['Buy · Sell', 'Order · 0%', 'Details']);
  });

  it('the heist picks its one hero in the party dialog', () => {
    render(spawn('thievesGuild'));
    press('Send a heist');
    const dialog = renderer!.root.findByType(PartyDialog);
    expect(dialog.props.slots).toBe(1);
    expect(dialog.props.briefing.threats).toHaveLength(1);
  });

  it('a dig shows what it found in the loot grid, and the button then says the ruin is dug', () => {
    render(spawn('ruins'));
    press('Dig');
    expect(renderer!.root.findAllByType(LootGrid)).toHaveLength(1);
    expect(titles()).toContain('Already dug here');
  });

  it('the library trains the hero picked in its Train tab', () => {
    const save = useGameStore.getState().save;
    const hero = save.heroes[0];
    render(spawn('library'));
    press('Train');
    expect(titles()).toContain('Pick a hero to train');
    act(() => {
      renderer!.root.findAll((node) => node.props.accessibilityRole === 'radio' && typeof node.props.onPress === 'function')[0].props.onPress();
    });
    const label = titles().find((title) => title.startsWith(`Train ${hero.name}`))!;
    press(label);
    expect(useGameStore.getState().save.heroes[0].xp).not.toBe(hero.xp);
  });
});
