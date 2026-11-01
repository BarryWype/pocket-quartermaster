/**
 * The background ticks (patrols every 5 s, auto-gather every 10 s, upkeep on
 * return to the app) write the store only when the save object changes. With
 * nothing due they must hand back the very same object, or every component
 * subscribed to the whole save (the map and every open screen) re-renders on
 * every tick.
 */
import { resolvePatrolFights } from '@/game/patrols/fight';
import { addPatrolsToWalks } from '@/game/patrols/walkPatrols';
import { resolvePlaceFights } from '@/game/places/fights';
import { resolveHeists } from '@/game/places/heists';
import { createInitialSave } from '@/game/save';
import { refreshAutoGather } from '@/hooks/useAutoGather';
import { useGameStore } from '@/store/gameStore';

jest.mock('@/services/walkTracking', () => ({
  readBuffer: jest.fn(() => Promise.resolve({ fixes: [], autoStopped: false })),
  updateBuffer: () => Promise.resolve(),
  updateBackground: (change: (state: null) => unknown) => Promise.resolve(change(null)),
  isTracking: () => Promise.resolve(false),
  getAutoGatherPermission: () => Promise.resolve('denied'),
  stopTracking: () => Promise.resolve(),
}));

const NOW = Date.UTC(2026, 10, 1, 12);

describe('a background tick with nothing due', () => {
  it('leaves the save object as it was, in each rule behind it', () => {
    const save = createInitialSave();
    expect(resolvePatrolFights(save, NOW).save).toBe(save);
    expect(addPatrolsToWalks(save, { fights: [], escortHp: null, travellers: [], gold: 0, xp: 0, materials: [] }, NOW)).toBe(save);
    expect(resolvePlaceFights(save, NOW).save).toBe(save);
    expect(resolveHeists(save, NOW).save).toBe(save);
  });

  it('leaves the store save as it was: patrols, places and auto-gather', async () => {
    useGameStore.getState().resetSave();
    const save = useGameStore.getState().save;
    useGameStore.getState().resolvePatrolFights();
    useGameStore.getState().resolvePlaces();
    await refreshAutoGather(false);
    expect(jest.requireMock('@/services/walkTracking').readBuffer).toHaveBeenCalled();
    expect(useGameStore.getState().save).toBe(save);
  });
});
