import { navigationRules } from '@/content/navigation';

/**
 * An in-progress navigation. `target`/`until` is the per-target tap lock;
 * while `pending` is set, every navigate is ignored — any target — until the
 * real stack shows the pending target on top, or the safety timeout runs out.
 *
 * The safety deadline is not set at the tap: it stays `null` until the first
 * frame after the tap (`armPending`), so a blocked JS thread — where no frame
 * runs, however long the block — holds the lock, and the taps queued during
 * the block can do nothing when they finally run.
 */
export type NavLock = {
  target: string | null;
  until: number;
  pending: { target: string; until: number | null } | null;
};

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
function lockAfter(path: string, now: number, lockMs: number): NavLock {
  return {
    target: path,
    until: now + lockMs,
    // The safety deadline is armed later, by the first frame after the tap.
    pending: { target: path, until: null },
  };
}

/** Whether the stack shows the pending navigation's target focused on top. */
export function showsTargetOnTop(stack: string[], target: string): boolean {
  const top = stack.length > 0 ? stack[stack.length - 1] : null;
  return top !== null && routeMatches(top, target);
}

/**
 * Arms the pending lock's safety timeout: called after the first frame
 * following the tap. Only if a navigation truly failed does this deadline
 * matter — no frame ever showed the target on top, so the lock opens here
 * anyway once the time passes.
 */
export function armPending(lock: NavLock, at: number, pendingMaxMs: number = navigationRules.pendingMaxMs): NavLock {
  if (lock.pending === null || lock.pending.until !== null) return lock;
  return { ...lock, pending: { ...lock.pending, until: at + pendingMaxMs } };
}

/**
 * What one tap should do, given the stack's route names (bottom first): nothing
 * when the screen is already on top or a navigation is still waiting for its
 * screen; back (dismiss to it) when it is lower in the stack; push otherwise.
 * The pending lock is released only by the real stack showing its target on
 * top, or by its safety timeout — armed after the first frame — so a blocked
 * thread full of queued taps can't stack screens, however long the block.
 */
export function planNavigation(
  stack: string[],
  href: string,
  now: number,
  lock: NavLock,
  lockMs: number = navigationRules.tapLockMs,
): NavPlan {
  if (lock.pending) {
    if (!showsTargetOnTop(stack, lock.pending.target)) {
      if (lock.pending.until === null || now < lock.pending.until) return { action: 'none', lock };
    }
    lock = { ...lock, pending: null };
  }
  if (lock.target === hrefPath(href) && now < lock.until) return { action: 'none', lock };
  const top = stack.length > 0 ? stack[stack.length - 1] : null;
  if (top !== null && routeMatches(top, hrefPath(href))) return { action: 'none', lock };
  const index = stack.findLastIndex((name) => routeMatches(name, hrefPath(href)));
  if (index >= 0) return { action: 'back', lock: lockAfter(hrefPath(href), now, lockMs) };
  return { action: 'push', lock: lockAfter(hrefPath(href), now, lockMs) };
}
