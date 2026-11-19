/**
 * Map UI pass, prompt 1 step 6: how long the fight, secret, traveller and hall
 * sheets take to open, the peek and then the full sheet on its first tab, cold
 * (first mount in a fresh module registry) and warm (a second mount), as in
 * src/perf/placeSheetFirstOpen.test.tsx. Logged, not asserted beyond "it
 * rendered": the numbers move with the machine. Phone estimate: ×4.
 */
import type { ReactElement } from 'react';
import type { ReactTestRenderer } from 'react-test-renderer';

import { sanctums } from '@/content/sanctums';
import { cellAt } from '@/game/discovery/cells';
import type { PatrolSpawn } from '@/game/patrols/generate';
import type { PlaceSpawn } from '@/game/places/generate';
import { createInitialSave, type SaveData } from '@/game/save';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));
jest.mock('@/hooks/useCellTerrains', () => ({ useCellTerrains: (cells: string[]) => Object.fromEntries(cells.map((cell) => [cell, 'green' as const])) }));
jest.mock('@/services/mapTiles', () => ({ walkableTiles: { load: () => Promise.resolve(null) } }));

const PHONE_FACTOR = 4;
const POSITION = { latitude: -41.2865, longitude: 174.7762 };

const walker = (kind: PatrolSpawn['kind'], now: number): PatrolSpawn => ({
  id: `patrol:${kind}:perf`,
  tile: 'tile',
  window: 0,
  kind,
  difficulty: kind === 'trader' ? null : 'medium',
  tier: 1,
  path: { waypoints: [POSITION], loopMs: 3_600_000, phaseMs: 0 },
  startsAt: now - 600_000,
  endsAt: now + 3_600_000,
});
const place = (kind: PlaceSpawn['kind'], now: number, id = `${kind}-perf`): PlaceSpawn => ({
  id,
  kind,
  group: 'g',
  tile: 't',
  position: POSITION,
  startsAt: now - 3_600_000,
  expiresAt: now + 2 * 3_600_000,
  roll: 0.3,
});

function save(now: number): SaveData {
  const base = createInitialSave();
  return {
    ...base,
    gold: 2500,
    sigils: [1, 2],
    secretTips: [{ id: 'blackMarket|perf', secret: 'blackMarket', source: 'traveller', sourceId: 'perf', anchor: POSITION, foundAt: 0, expiresAt: now + 3_600_000 }],
  };
}

const SHEETS = ['patrol', 'place fight', 'sanctum', 'traveller (trader)', 'secret place', 'hall'] as const;
type Row = { sheet: string; peek: number; full: number | null; warm: number };

describe('the first opening of each fight, secret, traveller and hall sheet', () => {
  it('times each sheet cold and warm, peek then full', () => {
    const rows: Row[] = [];
    for (const sheet of SHEETS) {
      jest.isolateModules(() => {
        /* eslint-disable @typescript-eslint/no-require-imports */
        const React = require('react') as typeof import('react');
        const renderer = require('react-test-renderer') as typeof import('react-test-renderer');
        const { useGameStore } = require('@/store/gameStore') as typeof import('@/store/gameStore');
        const { PatrolSheet } = require('@/components/fights/PatrolSheet') as typeof import('@/components/fights/PatrolSheet');
        const { PlaceFightSheet } = require('@/components/fights/PlaceFightSheet') as typeof import('@/components/fights/PlaceFightSheet');
        const { SanctumSheet } = require('@/components/fights/SanctumSheet') as typeof import('@/components/fights/SanctumSheet');
        const { TravellerSheet } = require('@/components/fights/TravellerSheet') as typeof import('@/components/fights/TravellerSheet');
        const { SecretSheet } = require('@/components/places/SecretSheet') as typeof import('@/components/places/SecretSheet');
        const { HallSheet } = require('@/components/HallSheet') as typeof import('@/components/HallSheet');
        /* eslint-enable @typescript-eslint/no-require-imports */
        const now = Date.now();
        renderer.act(() => {
          useGameStore.setState({ save: save(now) });
        });
        const common = { player: POSITION, now, onClose: () => {} };
        const element = (): ReactElement => {
          switch (sheet) {
            case 'patrol':
              return React.createElement(PatrolSheet, { ...common, spawn: walker('goblins', now) });
            case 'place fight':
              return React.createElement(PlaceFightSheet, { ...common, place: place('banditCamp', now) });
            case 'sanctum':
              return React.createElement(SanctumSheet, { ...common, spawn: { id: 'sanctum:perf', sanctumId: sanctums[0].id, position: POSITION, expiresAt: now + 3_600_000 } });
            case 'traveller (trader)':
              return React.createElement(TravellerSheet, { ...common, spawn: walker('trader', now) });
            case 'secret place':
              return React.createElement(SecretSheet, { ...common, place: place('blackMarket', now, 'secret:blackMarket|perf') });
            case 'hall':
              return React.createElement(HallSheet, { cell: cellAt(POSITION), player: POSITION, onClose: () => {} });
          }
        };
        const open = () => {
          let tree: ReactTestRenderer | null = null;
          const start = performance.now();
          renderer.act(() => {
            tree = renderer.create(element());
          });
          const peek = performance.now() - start;
          const more = tree!.root.findAll((node) => node.props.title === 'More' && typeof node.props.onPress === 'function')[0];
          let full: number | null = null;
          if (more) {
            const fullStart = performance.now();
            renderer.act(() => {
              more.props.onPress();
            });
            full = performance.now() - fullStart;
          }
          expect(tree!.toJSON()).not.toBeNull();
          renderer.act(() => tree!.unmount());
          return { peek, full };
        };
        const cold = open();
        const warm = open();
        rows.push({ sheet, peek: cold.peek, full: cold.full, warm: warm.peek + (warm.full ?? 0) });
      });
    }
    const ms = (value: number) => `${Math.round(value)} ms`;
    console.log(
      [
        '| Sheet | Peek, cold | Full, cold | Peek + full, warm | Peek + full, phone (×4, cold) |',
        '|---|---|---|---|---|',
        ...rows.map(
          (row) =>
            `| ${row.sheet} | ${ms(row.peek)} | ${row.full === null ? 'no tabs' : ms(row.full)} | ${ms(row.warm)} | ${ms((row.peek + (row.full ?? 0)) * PHONE_FACTOR)} |`,
        ),
      ].join('\n'),
    );
  });
});
