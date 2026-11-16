import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { cellAt } from '@/game/discovery/cells';
import { offsetPosition } from '@/game/generation/geo';
import { tileCenter } from '@/game/generation/tiles';
import { periodAt } from '@/game/supply/period';
import { cellRichness } from '@/game/supply/richness';
import type { Camp } from '@/game/supply/types';
import { createInitialSave, type SaveData } from '@/game/save';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';

import { SupplyCampPanel } from './SupplyCampPanel';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));

const origin = { latitude: -41.2865, longitude: 174.7762 };

/** A green cell whose timber richness rolls to 1 in the current period. */
const richnessOneCell = (): string => {
  const period = periodAt(Date.now());
  for (let i = 0; i < 5000; i++) {
    const cell = cellAt(offsetPosition(origin, i * 40, i * 7));
    if (cellRichness(cell, period, 'green', 'timber') === 1) return cell;
  }
  throw new Error('No richness 1 cell found');
};

const campIn = (cell: string, extra: Partial<Camp> = {}): Camp => ({
  id: 'c1',
  kind: 'timber',
  cell,
  terrain: 'green',
  foundedAt: Date.now(),
  heroId: null,
  postedAt: null,
  stock: {},
  progress: 0,
  made: 0,
  settledAt: Date.now(),
  inspectedUntil: 0,
  closedUntil: 0,
  ...extra,
});

const saveWithCamp = (camp: Camp): SaveData => {
  const base = createInitialSave();
  return {
    ...base,
    heroes: base.heroes.map((h) => (h.id === 'bram' ? { ...h, trade: { id: 'woodcutter', hours: 40 } } : h)),
    supply: { ...base.supply, camps: [camp] },
  };
};

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

describe('the camp sheet', () => {
  afterEach(() => {
    useSettingsStore.setState({ supplyLines: false });
    act(() => renderer?.unmount());
  });
  let renderer: ReactTestRenderer | null = null;

  it('shows a posted camp: the hero, Recall, and the rate line with the trade bonus', () => {
    useSettingsStore.setState({ supplyLines: true });
    const cell = richnessOneCell();
    act(() => {
      useGameStore.setState({ save: saveWithCamp(campIn(cell, { heroId: 'bram', postedAt: Date.now() })) });
    });
    act(() => {
      renderer = create(<SupplyCampPanel id="c1" player={tileCenter(cell)} onClose={() => {}} />);
    });
    const sheet = text(renderer!);
    expect(sheet).toContain('Bram is posted');
    expect(sheet).toContain('Recall');
    // Richness 1 at the full rate with a level 2 Woodcutter: 1.5 wood an hour, +50%.
    expect(sheet).toContain('1.5 wood an hour');
    expect(sheet).toContain('Woodcutter level 2: +50%');
    expect(sheet).toContain('0 / 12');
  });

  it('shows an empty camp with the heroes free to post', () => {
    useSettingsStore.setState({ supplyLines: true });
    const cell = richnessOneCell();
    act(() => {
      useGameStore.setState({ save: saveWithCamp(campIn(cell)) });
    });
    act(() => {
      renderer = create(<SupplyCampPanel id="c1" player={tileCenter(cell)} onClose={() => {}} />);
    });
    const sheet = text(renderer!);
    expect(sheet).toContain('Worked by locals (40%)');
    expect(sheet).toContain('Post a hero');
    for (const name of ['Bram', 'Lyra', 'Mira']) expect(sheet).toContain(name);
    // The player stands at the camp, but nothing has been made yet.
    expect(sheet).toContain('Nothing to collect yet');
    expect(sheet).not.toContain('Recall');
  });
});
