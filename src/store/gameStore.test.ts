import AsyncStorage from '@react-native-async-storage/async-storage';

import { useGameStore } from './gameStore';

describe('gameStore', () => {
  beforeEach(() => {
    useGameStore.getState().resetSave();
  });

  it('persists save data to storage', async () => {
    useGameStore.getState().addGold(25);

    const raw = await AsyncStorage.getItem('pocket-quartermaster-save');
    expect(JSON.parse(raw ?? '{}')).toMatchObject({ state: { save: { gold: 25 } }, version: 8 });
  });

  it('resets save data', () => {
    useGameStore.getState().addGold(10);
    useGameStore.getState().resetSave();

    expect(useGameStore.getState().save.gold).toBe(0);
  });
});
