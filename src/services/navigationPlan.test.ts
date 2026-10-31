import { router } from 'expo-router';

import { navigationRules } from '@/content/navigation';

import * as navigation from './navigation';
import { armPending, hrefPath, noLock, planNavigation, routeMatches, showsTargetOnTop } from './navigationPlan';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), dismissTo: jest.fn() } }));
jest.mock('@/services/timings', () => ({ markTap: () => {} }));

describe('route matching', () => {
  it('matches plain routes, index routes, dynamic routes and the root', () => {
    expect(routeMatches('forge', hrefPath('/forge'))).toBe(true);
    expect(routeMatches('team/index', hrefPath('/team'))).toBe(true);
    expect(routeMatches('team/[heroId]', hrefPath('/team/abc123'))).toBe(true);
    expect(routeMatches('index', hrefPath('/'))).toBe(true);
    expect(routeMatches('forge', hrefPath('/team'))).toBe(false);
    expect(routeMatches('team/[heroId]', hrefPath('/team'))).toBe(false);
    expect(routeMatches('team/classes', hrefPath('/team/abc'))).toBe(false);
  });
});

describe('planning one navigation', () => {
  const lockMs = navigationRules.tapLockMs;
  const pendingMax = navigationRules.pendingMaxMs;

  it('does nothing when the screen is already on top of the stack', () => {
    const plan = planNavigation(['index', 'forge'], '/forge', 1000, noLock, lockMs);
    expect(plan.action).toBe('none');
    expect(plan.lock).toBe(noLock);
  });

  it('goes back to a screen lower in the stack instead of pushing a copy', () => {
    const plan = planNavigation(['index', 'forge', 'team/index'], '/forge', 1000, noLock, lockMs);
    expect(plan.action).toBe('back');
    expect(plan.lock.target).toBe('forge');
    expect(plan.lock.until).toBe(1000 + lockMs);
    // The safety deadline waits for the first frame after the tap.
    expect(plan.lock.pending).toEqual({ target: 'forge', until: null });
  });

  it('pushes a screen that is not in the stack', () => {
    const plan = planNavigation(['index'], '/quests', 1000, noLock, lockMs);
    expect(plan.action).toBe('push');
    expect(plan.lock.target).toBe('quests');
    expect(plan.lock.until).toBe(1000 + lockMs);
    expect(plan.lock.pending).toEqual({ target: 'quests', until: null });
  });

  it('ignores a second tap while a navigation to that screen is in progress', () => {
    const first = planNavigation(['index'], '/quests', 1000, noLock, lockMs);
    expect(first.action).toBe('push');
    const second = planNavigation(['index'], '/quests', 1000 + lockMs - 1, first.lock, lockMs);
    expect(second.action).toBe('none');
    expect(second.lock).toBe(first.lock);
  });

  it('ignores a tap of a different screen while the pending lock holds and the stack has not updated', () => {
    const first = planNavigation(['index'], '/quests', 1000, noLock, lockMs);
    expect(first.action).toBe('push');
    // 1 s later the stack still shows only the home screen.
    const same = planNavigation(['index'], '/quests', 2000, first.lock, lockMs);
    expect(same.action).toBe('none');
    const other = planNavigation(['index'], '/guild', 2000, first.lock, lockMs);
    expect(other.action).toBe('none');
  });

  it('ignores taps queued through a block: no frame ran, so the safety deadline never started', () => {
    const first = planNavigation(['index'], '/expeditions', 1000, noLock, lockMs);
    expect(first.action).toBe('push');
    expect(first.lock.pending).toEqual({ target: 'expeditions', until: null }); // no frame, no deadline
    const queued = planNavigation(['index'], '/expeditions', 5000, first.lock, lockMs);
    expect(queued.action).toBe('none');
    const queuedOther = planNavigation(['index'], '/guild', 5000, first.lock, lockMs);
    expect(queuedOther.action).toBe('none');
    // Had a frame run at 1500, the deadline would exist — but the taps above came before any frame.
    expect(armPending(first.lock, 1500).pending).toEqual({ target: 'expeditions', until: 1500 + pendingMax });
  });

  it('releases the pending lock when the real stack shows the target on top', () => {
    const first = planNavigation(['index'], '/quests', 1000, noLock, lockMs);
    expect(first.action).toBe('push');
    expect(showsTargetOnTop(['index', 'quests'], 'quests')).toBe(true);
    const after = planNavigation(['index', 'quests'], '/forge', 2000, first.lock, lockMs);
    expect(after.action).toBe('push');
    expect(after.lock.pending).toEqual({ target: 'forge', until: null });
  });

  it('releases the pending lock after the safety timeout, armed at the first frame after the tap', () => {
    const first = planNavigation(['index'], '/quests', 1000, noLock, lockMs);
    // The first frame runs half a second later: the deadline starts then, not at the tap.
    const armed = armPending(first.lock, 1500);
    expect(armed.pending).toEqual({ target: 'quests', until: 1500 + pendingMax });
    // Before the deadline the lock still holds with the stack stale.
    expect(planNavigation(['index'], '/forge', 1500 + pendingMax - 1, armed, lockMs).action).toBe('none');
    // The navigation truly failed: the deadline opens the gate even though the stack never showed the target.
    const late = planNavigation(['index'], '/forge', 1500 + pendingMax, armed, lockMs);
    expect(late.action).toBe('push');
  });

  it('navigates again once the lock has expired and the screen opened', () => {
    const first = planNavigation(['index'], '/quests', 1000, noLock, lockMs);
    const after = planNavigation(['index', 'quests'], '/quests', 1000 + lockMs, first.lock, lockMs);
    expect(after.action).toBe('none'); // already on top now
    const elsewhere = planNavigation(['index', 'quests'], '/forge', 1000 + lockMs + 1, after.lock, lockMs);
    expect(elsewhere.action).toBe('push');
  });

  it('matches dynamic routes: a hero screen lower in the stack is gone back to', () => {
    const plan = planNavigation(['index', 'team/index', 'team/[heroId]'], '/team/bram', 1000, noLock, lockMs);
    expect(plan.action).toBe('none'); // same screen on top
    const lower = planNavigation(['index', 'team/[heroId]', 'forge'], '/team/bram', 1000, noLock, lockMs);
    expect(lower.action).toBe('back');
  });
});

describe('the navigation service', () => {
  const { push } = router as unknown as { push: jest.Mock };
  const frames: ((time: number) => void)[] = [];

  beforeAll(() => {
    jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      frames.push((time: number) => callback(time));
      return frames.length;
    });
    jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  beforeEach(() => {
    navigation.setNavigationStack(['index']);
  });

  afterEach(() => {
    frames.length = 0;
    push.mockClear();
  });

  it('holds the pending lock until the real stack shows the target, ignoring reports from before the navigation', () => {
    const { navigate, navigationPending, setNavigationStack } = navigation;
    expect(navigationPending()).toBe(false);
    navigate('/expeditions');
    expect(push).toHaveBeenCalledTimes(1);
    expect(navigationPending()).toBe(true);
    // The real stack is still stale (from before the navigation): it changes nothing.
    setNavigationStack(['index']);
    expect(navigationPending()).toBe(true);
    // The screen landed: the real stack shows the target on top, and the lock opens.
    setNavigationStack(['index', 'expeditions']);
    expect(navigationPending()).toBe(false);
  });

  it('ignores taps queued through a block: no frame ran, so the safety deadline never started', () => {
    const { navigate, navigationPending, setNavigationStack } = navigation;
    navigate('/guild');
    // 4 s of frozen thread later, the queued taps run: no frame ever ran, the
    // stack is still the stale real one, and the lock holds — nothing stacks.
    navigate('/guild');
    navigate('/expeditions');
    expect(push).toHaveBeenCalledTimes(1);
    expect(navigationPending()).toBe(true);
    setNavigationStack(['index', 'guild']);
    expect(navigationPending()).toBe(false);
    // Now the queued taps would work again (the plan part above covers the rules).
  });

  it('arms the safety deadline at the first frame after the tap, and tells the listeners', () => {
    const { navigate, navigationPending, onNavigationChange, setNavigationStack } = navigation;
    const changes: boolean[] = [];
    const unsubscribe = onNavigationChange(() => changes.push(navigationPending()));
    navigate('/quests');
    expect(navigationPending()).toBe(true);
    // The first frame following the tap runs: the deadline is armed from now, not from the tap.
    frames.splice(0).forEach((frame) => frame(2000));
    expect(navigationPending()).toBe(true); // still waiting for the stack, but the timeout is ticking now
    setNavigationStack(['index', 'quests']);
    expect(navigationPending()).toBe(false);
    unsubscribe();
    expect(changes).toEqual([true, true, false]);
  });
});
