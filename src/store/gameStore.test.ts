import AsyncStorage from '@react-native-async-storage/async-storage';

import { useGameStore } from './gameStore';

describe('gameStore', () => {
  beforeEach(() => {
    useGameStore.getState().resetSave();
  });

  it('persists save data to storage', async () => {
    useGameStore.getState().addGold(25);

    const raw = await AsyncStorage.getItem('pocket-quartermaster-save');
    expect(JSON.parse(raw ?? '{}')).toMatchObject({ state: { save: { gold: 25 } }, version: useGameStore.persist.getOptions().version });
  });

  it('queues the tip of an item kind as soon as one is held', () => {
    const { save } = useGameStore.getState();
    useGameStore.setState({ save: { ...save, keyFragments: 1 } });

    expect(useGameStore.getState().save.tips.pending).toEqual(['keyFragments']);
  });

  it('ignores using an item that is no longer in stock', () => {
    const { save } = useGameStore.getState();
    useGameStore.setState({ save: { ...save, manuals: { ...save.manuals, common: 1 } } });
    const heroId = save.heroes[0].id;
    useGameStore.getState().readManual(heroId, 'common');
    const after = useGameStore.getState().save;

    expect(() => useGameStore.getState().readManual(heroId, 'common')).not.toThrow();
    expect(() => useGameStore.getState().startWalkEffect('foragersTonic', { latitude: 0, longitude: 0 })).not.toThrow();
    expect(() => useGameStore.getState().activateLure({ latitude: 0, longitude: 0 })).not.toThrow();
    expect(() => useGameStore.getState().readTreasureMap('gone', { latitude: 0, longitude: 0 })).not.toThrow();
    expect(() => useGameStore.getState().drinkPotion(heroId)).not.toThrow();
    expect(() => useGameStore.getState().giveHomeCare(heroId, 'herbalPoultice')).not.toThrow();
    expect(useGameStore.getState().save).toBe(after);
  });

  it('assigns a hero to a job, recalls them and collects the output', () => {
    const { save } = useGameStore.getState();
    const heroId = save.heroes[0].id;
    const otherId = save.heroes[1].id;
    const woodBefore = save.materials.wood ?? 0;
    useGameStore.getState().assignJob(heroId, 'woodcutter');

    expect(useGameStore.getState().save.heroes.find((h) => h.id === heroId)!.job).toMatchObject({ jobId: 'woodcutter' });
    expect(useGameStore.getState().save.jobOutput).toMatchObject({ woodcutter: { amount: 0 } });
    // A taken station and a working hero are refused silently.
    useGameStore.getState().assignJob(otherId, 'woodcutter');
    expect(useGameStore.getState().save.heroes.find((h) => h.id === otherId)!.job).toBeNull();
    const assigned = useGameStore.getState().save;
    useGameStore.getState().assignJob(heroId, 'woodcutter');
    expect(useGameStore.getState().save).toBe(assigned);

    // With less than a whole unit waiting, collecting changes nothing.
    useGameStore.setState({ save: { ...assigned, jobOutput: { woodcutter: { amount: 0.5, since: Date.now() } } } });
    useGameStore.getState().collectJob('woodcutter');
    expect(useGameStore.getState().save.materials.wood ?? 0).toBe(woodBefore);

    useGameStore.setState({ save: { ...useGameStore.getState().save, jobOutput: { woodcutter: { amount: 2.5, since: Date.now() } } } });
    useGameStore.getState().collectJob('woodcutter');
    expect(useGameStore.getState().save.materials.wood).toBe(woodBefore + 2);
    expect(useGameStore.getState().save.jobOutput.woodcutter.amount).toBeCloseTo(0.5, 9);

    useGameStore.getState().recallFromJob(heroId);
    expect(useGameStore.getState().save.heroes.find((h) => h.id === heroId)!.job).toBeNull();
    // Recalling a hero without a job changes nothing.
    const recalled = useGameStore.getState().save;
    useGameStore.getState().recallFromJob(heroId);
    expect(useGameStore.getState().save).toBe(recalled);
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
