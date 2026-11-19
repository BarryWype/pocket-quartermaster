/**
 * Map UI pass, prompt 1 step 5: how long each place sheet takes to open, the
 * peek and then the full sheet on its first tab, cold (first mount in a fresh
 * module registry, modules loaded before the timing) and warm (a second mount
 * in that registry), on a save with a full storeroom and ~40 gear pieces. Logged, not
 * asserted beyond "it rendered": the numbers move with the machine.
 * Phone estimate: ×4, as in src/perf/menuFirstOpen.test.tsx.
 */
import type { ReactTestRenderer } from 'react-test-renderer';

import { items } from '@/content/items';
import { materials } from '@/content/materials';
import type { PlaceSpawn } from '@/game/places/generate';
import { createInitialSave, type SaveData } from '@/game/save';
import type { GearInstance } from '@/game/types';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));

const PHONE_FACTOR = 4;
const POSITION = { latitude: -41.2865, longitude: 174.7762 };
const KINDS: PlaceSpawn['kind'][] = ['smithy', 'market', 'apothecary', 'chapel', 'library', 'ruins', 'fishingDock', 'thievesGuild', 'tavern'];

const spawn = (kind: PlaceSpawn['kind'], now: number): PlaceSpawn & { name: string } => ({
  id: `${kind}-perf`,
  kind,
  group: 'g',
  tile: 't',
  position: POSITION,
  startsAt: now - 3_600_000,
  expiresAt: now + 2 * 3_600_000,
  roll: 0.3,
  name: 'The Crooked Mug',
});

/** A full storeroom and ~40 gear pieces, so the Sell side has tiles to draw (the menu timings' save, lighter). */
function stockedSave(): SaveData {
  const base = createInitialSave();
  const gearItems = items.filter((i) => (i.slot === 'weapon' || i.slot === 'armor' || i.slot === 'offhand') && i.tier <= 3);
  const gear: GearInstance[] = Array.from({ length: 40 }, (_, i) => ({
    uid: `g${i}`,
    itemId: gearItems[(i * 7) % gearItems.length].id,
    rarity: i % 4 === 3 ? 'rare' : 'common',
    roll: 8,
    affixes: [],
    rerolls: 0,
  }));
  return { ...base, gold: 2500, gear, materials: Object.fromEntries(materials.map((m) => [m.id, 25])) };
}

type Row = { kind: string; peek: number; full: number; warm: number };

describe('the first opening of each place sheet', () => {
  it('times each sheet cold and warm, peek then full', () => {
    const rows: Row[] = [];
    for (const kind of KINDS) {
      jest.isolateModules(() => {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const React = require('react') as typeof import('react');
        const renderer = require('react-test-renderer') as typeof import('react-test-renderer');
        const { useGameStore } = require('@/store/gameStore') as typeof import('@/store/gameStore');
        const { PlaceSheet } = require('@/components/places/PlaceSheet') as typeof import('@/components/places/PlaceSheet');
        const { TavernSheet } = require('@/components/places/TavernSheet') as typeof import('@/components/places/TavernSheet');
        /* eslint-enable @typescript-eslint/no-require-imports */
        const now = Date.now();
        const place = spawn(kind, now);
        renderer.act(() => {
          useGameStore.setState({ save: stockedSave() });
        });
        const element = () =>
          kind === 'tavern'
            ? React.createElement(TavernSheet, { tavern: place, player: POSITION, now, onClose: () => {} })
            : React.createElement(PlaceSheet, { place, player: POSITION, now, onClose: () => {} });
        const open = () => {
          let tree: ReactTestRenderer | null = null;
          const start = performance.now();
          renderer.act(() => {
            tree = renderer.create(element());
          });
          const peek = performance.now() - start;
          const more = tree!.root.findAll((node) => node.props.title === 'More' && typeof node.props.onPress === 'function')[0];
          const fullStart = performance.now();
          renderer.act(() => {
            more.props.onPress();
          });
          const full = performance.now() - fullStart;
          expect(tree!.toJSON()).not.toBeNull();
          renderer.act(() => tree!.unmount());
          return { peek, full };
        };
        const cold = open();
        const warm = open();
        rows.push({ kind, peek: cold.peek, full: cold.full, warm: warm.peek + warm.full });
      });
    }
    const ms = (value: number) => `${Math.round(value)} ms`;
    console.log(
      [
        '| Sheet | Peek, cold | Full, cold | Peek + full, warm | Peek + full, phone (×4, cold) |',
        '|---|---|---|---|---|',
        ...rows.map((row) => `| ${row.kind} | ${ms(row.peek)} | ${ms(row.full)} | ${ms(row.warm)} | ${ms((row.peek + row.full) * PHONE_FACTOR)} |`),
      ].join('\n'),
    );
  });
});
