import { navigationRules } from '@/content/navigation';

import { hrefPath, noLock, planNavigation, routeMatches } from './navigationPlan';

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
    expect(plan.lock.pending).toEqual({ target: 'forge', until: 1000 + pendingMax });
  });

  it('pushes a screen that is not in the stack', () => {
    const plan = planNavigation(['index'], '/quests', 1000, noLock, lockMs);
    expect(plan.action).toBe('push');
    expect(plan.lock.target).toBe('quests');
    expect(plan.lock.until).toBe(1000 + lockMs);
    expect(plan.lock.pending).toEqual({ target: 'quests', until: 1000 + pendingMax });
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

  it('releases the pending lock when the real stack shows the target on top', () => {
    const first = planNavigation(['index'], '/quests', 1000, noLock, lockMs);
    expect(first.action).toBe('push');
    const after = planNavigation(['index', 'quests'], '/forge', 2000, first.lock, lockMs);
    expect(after.action).toBe('push');
    expect(after.lock.pending).toEqual({ target: 'forge', until: 2000 + pendingMax });
  });

  it('releases the pending lock after the timeout, stack updated or not', () => {
    const first = planNavigation(['index'], '/quests', 1000, noLock, lockMs);
    const late = planNavigation(['index'], '/forge', 1000 + pendingMax, first.lock, lockMs);
    expect(late.action).toBe('push');
  });

  it('navigates again once the lock has expired and the screen opened', () => {
    const first = planNavigation(['index'], '/quests', 1000, noLock, lockMs);
    const after = planNavigation(['index', 'quests'], '/quests', 1000 + lockMs, first.lock, lockMs);
    expect(after.action).toBe('none'); // already on top now
    const elsewhere = planNavigation(['index', 'quests'], '/forge', 1000 + lockMs + 1, first.lock, lockMs);
    expect(elsewhere.action).toBe('push');
  });

  it('matches dynamic routes: a hero screen lower in the stack is gone back to', () => {
    const plan = planNavigation(['index', 'team/index', 'team/[heroId]'], '/team/bram', 1000, noLock, lockMs);
    expect(plan.action).toBe('none'); // same screen on top
    const lower = planNavigation(['index', 'team/[heroId]', 'forge'], '/team/bram', 1000, noLock, lockMs);
    expect(lower.action).toBe('back');
  });
});
