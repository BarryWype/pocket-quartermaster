import * as Haptics from 'expo-haptics';

import { useSettingsStore } from '@/store/settingsStore';

import { feel, hapticOf } from './feel';

jest.mock('expo-haptics', () => ({
  ...jest.requireActual('expo-haptics'),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
}));

const played = () =>
  [Haptics.impactAsync, Haptics.notificationAsync, Haptics.selectionAsync, Haptics.performAndroidHapticsAsync].reduce(
    (count, fn) => count + (fn as jest.Mock).mock.calls.length,
    0,
  );

beforeEach(() => jest.clearAllMocks());
afterEach(() => useSettingsStore.setState({ haptics: true }));

test('each moment has its haptic', () => {
  expect(hapticOf('press')).toBe('tap');
  expect(hapticOf('toggle', { on: true })).toBe('toggleOn');
  expect(hapticOf('toggle', { on: false })).toBe('toggleOff');
  expect(hapticOf('reward', { rarity: 'rare' })).toBe('light');
  expect(hapticOf('reward', { rarity: 'legendary' })).toBe('confirm');
  expect(hapticOf('forge')).toBe('confirm');
});

test('plays one haptic per moment', () => {
  feel('press');
  feel('reward', { rarity: 'legendary' });
  expect(played()).toBe(2);
});

test('the Haptics setting silences every moment', () => {
  useSettingsStore.setState({ haptics: false });
  feel('press');
  feel('forge');
  expect(played()).toBe(0);
});
