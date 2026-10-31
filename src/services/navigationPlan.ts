import { navigationRules } from '@/content/navigation';

/**
 * An in-progress navigation. `target`/`until` is the per-target tap lock; while
 * `pending` is set, every navigate is ignored — any target — until the stack
 * shows the pending target on top, `pending.until` passes, or the navigation
 * never landed and the safety timeout runs out.
 */
export type NavLock = { target: string | null; until: number; pending: { target: string; until: number } | null };

export const noLock: NavLock = { target: null, until: 0, pending: null };

/** An href as a path without the leading slash ('/team/abc' → 'team/abc', '/' → 'index'). */
export function hrefPath(href: string): string {
  const path = href.replace(/^\//, '');
  return path === '' ? 'index' : path;
}

/**
 * Whether a stack route name matches a path: 'team/index' matches '/team',
 * 'team/[heroId]' matches '/team/<any id>'.
 */
export function routeMatches(routeName: string, path: string): boolean {
  const name = routeName.endsWith('/index') ? routeName.slice(0, -'/index'.length) : routeName;
  if (name === path) return true;
  const pattern = name
    .split('/')
    .map((segment) => (segment.startsWith('[') && segment.endsWith(']') ? '[^/]+' : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/');
  return new RegExp(`^${pattern}$`).test(path);
}

export type NavPlan = { action: 'none' | 'push' | 'back'; lock: NavLock };

/** The lock a real navigation leaves behind: the tap lock, plus the global pending lock. */
function lockAfter(path: string, now: number, lockMs: number, pendingMaxMs: number): NavLock {
  return {
    target: path,
    until: now + lockMs,
    // The pending lock lasts at least the tap lock.
    pending: { target: path, until: now + Math.max(lockMs, pendingMaxMs) },
  };
}

/**
 * What one tap should do, given the stack's route names (bottom first): nothing
 * when the screen is already on top or a navigation to it is still locked; back
 * (dismiss to it) when it is lower in the stack; push otherwise. After a real
 * push or back, every further navigate is ignored — any target — until the
 * stack shows the target of the navigation in progress on top or the pending
 * lock times out, so a blocked thread full of queued taps can't stack screens.
 */
export function planNavigation(
  stack: string[],
  href: string,
  now: number,
  lock: NavLock,
  lockMs: number = navigationRules.tapLockMs,
  pendingMaxMs: number = navigationRules.pendingMaxMs,
): NavPlan {
  const path = hrefPath(href);
  if (lock.pending) {
    if (now < lock.pending.until) {
      // The navigation landed: the stack shows its target on top, so the pending gate opens.
      const top = stack.length > 0 ? stack[stack.length - 1] : null;
      if (top === null || !routeMatches(top, lock.pending.target)) return { action: 'none', lock };
    }
    // Timed out: the safety timeout opens the gate even if the stack never showed the target.
    lock = { ...lock, pending: null };
  }
  if (lock.target === path && now < lock.until) return { action: 'none', lock };
  const top = stack.length > 0 ? stack[stack.length - 1] : null;
  if (top !== null && routeMatches(top, path)) return { action: 'none', lock };
  const index = stack.findLastIndex((name) => routeMatches(name, path));
  if (index >= 0) return { action: 'back', lock: lockAfter(path, now, lockMs, pendingMaxMs) };
  return { action: 'push', lock: lockAfter(path, now, lockMs, pendingMaxMs) };
}
