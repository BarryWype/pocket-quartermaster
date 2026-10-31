import { router, type Href } from 'expo-router';

import { navigationRules } from '@/content/navigation';

import { armPending, hrefPath, planNavigation, showsTargetOnTop, type NavLock } from './navigationPlan';
import { markTap } from './timings';

/**
 * The stack's route names (bottom first) as the app really shows them, fed
 * from the root layout. There is no optimistic copy any more: the pending lock
 * holds every further tap until this, the real stack, shows the target of the
 * navigation in progress focused on top — so a stack from before the
 * navigation (which is what the layout reports while the new screen renders)
 * opens nothing, however late the queued taps run.
 */
let stack: string[] = [];
let lock: NavLock = { target: null, until: 0, pending: null };

/** The frame callback that arms the pending lock's safety deadline, cancelled when the lock clears. */
let armFrame: number | null = null;

type NavigationListener = () => void;
const listeners = new Set<NavigationListener>();

function notify() {
  for (const listener of listeners) listener();
}

const sameNames = (a: string[], b: string[]) => a.length === b.length && a.every((name, i) => name === b[i]);

function clearPending() {
  if (lock.pending) {
    lock = { ...lock, pending: null };
    if (armFrame !== null) cancelAnimationFrame(armFrame);
    armFrame = null;
    notify();
  }
}

/** Called from the root layout with the current stack's route names, only when they change by value. */
export function setNavigationStack(routeNames: string[]) {
  if (sameNames(routeNames, stack)) {
    // Nothing changed on the real stack; if it finally shows the pending target, that still lands the navigation.
    if (lock.pending && showsTargetOnTop(routeNames, lock.pending.target)) clearPending();
    return;
  }
  stack = routeNames;
  if (lock.pending && showsTargetOnTop(routeNames, lock.pending.target)) clearPending();
  else notify();
}

/** Whether a navigation is still waiting for its screen: menu buttons disable while it holds. */
export function navigationPending(): boolean {
  return lock.pending !== null;
}

/** Notified whenever the stack or the pending navigation changes. */
export function onNavigationChange(listener: NavigationListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The one way the app navigates: one screen at a time. A screen already on
 * top of the stack does nothing; one lower in the stack is gone back to
 * (dismissed to) instead of pushed again; and a navigation already in progress
 * ignores further taps — any target — until the real stack shows its target
 * on top, or the safety timeout (armed by the first frame after the tap)
 * runs out. A blocked JS thread runs no frames, so the lock holds through the
 * block and the taps queued behind it can stack nothing. Hardware back and
 * swipe back are untouched.
 */
export function navigate(href: Href) {
  const path = typeof href === 'string' ? href : (href.pathname ?? '');
  const route = hrefPath(path);
  const plan = planNavigation(stack, route, Date.now(), lock);
  lock = plan.lock;
  if (plan.action === 'push') {
    markTap(route);
    router.push(href);
  } else if (plan.action === 'back') {
    markTap(route);
    router.dismissTo(href);
  } else {
    return;
  }
  // The safety deadline starts at the first frame after the tap, not at the
  // tap: while the thread is frozen no frame runs, and the lock holds.
  if (armFrame !== null) cancelAnimationFrame(armFrame);
  armFrame = requestAnimationFrame(() => {
    armFrame = null;
    lock = armPending(lock, Date.now(), navigationRules.pendingMaxMs);
    notify();
  });
  notify();
}
