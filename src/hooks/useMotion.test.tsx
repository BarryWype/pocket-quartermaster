import AsyncStorage from '@react-native-async-storage/async-storage';

import { useSettingsStore } from '@/store/settingsStore';

import { motionLevelOf } from './useMotion';

test("the phone's reduce-motion setting lowers Full to Reduced, never raises Off", () => {
  expect(motionLevelOf('full', false)).toBe('full');
  expect(motionLevelOf('full', true)).toBe('reduced');
  expect(motionLevelOf('reduced', true)).toBe('reduced');
  expect(motionLevelOf('off', true)).toBe('off');
});

test('settings saved before Animations and Haptics existed get Full and on', async () => {
  await AsyncStorage.setItem(
    'pocket-quartermaster-settings',
    JSON.stringify({ state: { language: 'fr', sightRange: 2 }, version: 3 }),
  );
  await useSettingsStore.persist.rehydrate();
  const state = useSettingsStore.getState();
  expect(state.language).toBe('fr');
  expect(state.sightRange).toBe(2);
  expect(state.animations).toBe('full');
  expect(state.haptics).toBe(true);
});
