import { router, type Href } from 'expo-router';

import { hrefPath, noLock, planNavigation, routeMatches, type NavLock } from './navigationPlan';

/**
 * The stack's route names (bottom first), as this helper sees them: updated
 * optimistically on its own pushes and backs, and replaced by the root layout
 * with the real stack whenever that arrives. A stale real stack (fed after the
 * new screen renders) would otherwise reopen the pending lock for taps that
 * were queued while the thread was blocked.
 */
let stack: string[] = [];
let lock: NavLock = noLock;

/** Called from the root layout with the current stack's route names. */
export function setNavigationStack(routeNames: string[]) {
  stack = routeNames;
}

/**
 * The one way the app navigates: one screen at a time. A screen already on
 * top of the stack does nothing; one lower in the stack is gone back to
 * (dismissed to) instead of pushed again; and a navigation already in progress
 * ignores further taps — any target — until the stack shows the screen or the
 * pending lock times out, so a blocked thread full of queued taps can't stack
 * copies of a screen. Hardware back and swipe back are untouched.
 */
export function navigate(href: Href) {
  const path = typeof href === 'string' ? href : (href.pathname ?? '');
  const route = hrefPath(path);
  const plan = planNavigation(stack, route, Date.now(), lock);
  lock = plan.lock;
  if (plan.action === 'push') {
    stack = [...stack, route];
    router.push(href);
  } else if (plan.action === 'back') {
    const index = stack.findLastIndex((name) => routeMatches(name, route));
    if (index >= 0) stack = stack.slice(0, index + 1);
    router.dismissTo(href);
  }
}
