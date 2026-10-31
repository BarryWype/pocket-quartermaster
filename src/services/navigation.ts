import { router, type Href } from 'expo-router';

import { navigationRules } from '@/content/navigation';

import { markTap } from './timings';

/** The route name of the last navigation, and when it started; the tap lock is just this. */
let lastTap: { target: string; at: number } | null = null;

/**
 * The one way the app navigates. Repeated taps on the same screen within
 * tapLockMs are ignored — a pure timestamp comparison, so nothing can stay
 * locked. Everything else is left to the navigator: every screen is singular
 * (dangerouslySingular in the layout and in the push options), so the
 * navigator's own state reducer guarantees one copy per screen, and a push
 * to a screen lower in the stack filters it out of the history instead of
 * stacking a second copy. Hardware back and swipe back are untouched.
 */
export function navigate(href: Href) {
  const path = typeof href === 'string' ? href : (href.pathname ?? '');
  const target = path.replace(/^\//, '') || 'index';
  const now = Date.now();
  if (lastTap !== null && lastTap.target === target && now < lastTap.at + navigationRules.tapLockMs) return;
  lastTap = { target, at: now };
  markTap(target);
  router.push(href, { dangerouslySingular: true });
}
