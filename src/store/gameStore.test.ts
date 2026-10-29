import AsyncStorage from '@react-native-async-storage/async-storage';

import { useGameStore } from './gameStore';

describe('gameStore', () => {
  beforeEach(() => {
    useGameStore.getState().resetSave();
  });

  it('persists save data to storage', async () => {
    useGameStore.getState().addGold(25);

    const raw = await AsyncStorage.getItem('pocket-quartermaster-save');
    expect(JSON.parse(raw ?? '{}')).toMatchObject({ state: { save: { gold: 25 } }, version: 19 });
  });

  it('resets save data', () => {
    useGameStore.getState().addGold(10);
    useGameStore.getState().resetSave();

    expect(useGameStore.getState().save.gold).toBe(0);
  });

  it('spends a pending approach pick', () => {
    const { debugSetHeroLevel, pickApproach } = useGameStore.getState();
    const hero = useGameStore.getState().save.heroes[0];
    debugSetHeroLevel(hero.id, 5);
    pickApproach(hero.id, 'might');

    const updated = useGameStore.getState().save.heroes.find((h) => h.id === hero.id)!;
    expect(updated.level).toBe(5);
    expect(updated.xp).toBe(0);
    expect(updated.approachPicks).toEqual(['might']);
  });

  it('clamps the debug hero level between 1 and 15', () => {
    const { debugSetHeroLevel } = useGameStore.getState();
    const hero = useGameStore.getState().save.heroes[0];
    debugSetHeroLevel(hero.id, 99);

    expect(useGameStore.getState().save.heroes.find((h) => h.id === hero.id)!.level).toBe(15);

    debugSetHeroLevel(hero.id, 0);
    expect(useGameStore.getState().save.heroes.find((h) => h.id === hero.id)!.level).toBe(1);
  });
});
