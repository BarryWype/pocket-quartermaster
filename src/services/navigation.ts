import { router, type Href } from 'expo-router';

import { noLock, planNavigation, type NavLock } from './navigationPlan';

/** The root stack's route names (bottom first), fed by the root layout; empty until it loads. */
let stack: string[] = [];
let lock: NavLock = noLock;

/** Called from the root layout with the current stack's route names. */
export function setNavigationStack(routeNames: string[]) {
  stack = routeNames;
}

/**
 * The one way the app navigates: one screen at a time. A screen already on
 * top of the stack does nothing; one lower in the stack is gone back to
 * (dismissed to) instead of pushed again; and a navigation already in
 * progress ignores further taps for `navigationRules.tapLockMs`, so lag can't
 * stack copies of a screen. Hardware back and swipe back are untouched.
 */
export function navigate(href: Href) {
  const path = typeof href === 'string' ? href : (href.pathname ?? '');
  const plan = planNavigation(stack, path, Date.now(), lock);
  lock = plan.lock;
  if (plan.action === 'push') router.push(href);
  else if (plan.action === 'back') router.dismissTo(href);
}
