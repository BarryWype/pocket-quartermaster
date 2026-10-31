import { navigationRules } from '@/content/navigation';

/** An in-progress navigation: further taps on the same target are ignored until `until`. */
export type NavLock = { target: string | null; until: number };

export const noLock: NavLock = { target: null, until: 0 };

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

/**
 * What one tap should do, given the stack's route names (bottom first): nothing
 * when the screen is already on top or a navigation to it is still locked;
 * back (dismiss to it) when it is lower in the stack; push otherwise. Every
 * real navigation sets the lock, so repeated taps while it is in progress do
 * nothing.
 */
export function planNavigation(stack: string[], href: string, now: number, lock: NavLock, lockMs: number = navigationRules.tapLockMs): NavPlan {
  const path = hrefPath(href);
  if (lock.target === path && now < lock.until) return { action: 'none', lock };
  const top = stack.length > 0 ? stack[stack.length - 1] : null;
  if (top !== null && routeMatches(top, path)) return { action: 'none', lock };
  const index = stack.findLastIndex((name) => routeMatches(name, path));
  if (index >= 0) return { action: 'back', lock: { target: path, until: now + lockMs } };
  return { action: 'push', lock: { target: path, until: now + lockMs } };
}
