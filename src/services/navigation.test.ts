import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { router } from 'expo-router';

import { navigationRules } from '@/content/navigation';

import { navigate } from './navigation';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('@/services/timings', () => ({ markTap: jest.fn() }));

const pushMock = router.push as jest.Mock;

/**
 * The clock the tests drive, so the tap lock sees exactly the times we choose.
 * Each test starts long after the previous one, so the lock's module state
 * (the last tap's target and time) never reaches across tests.
 */
let now = 0;
beforeEach(() => {
  now += navigationRules.tapLockMs * 10;
  pushMock.mockClear();
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('navigate', () => {
  it('pushes with singular options so the navigator keeps one copy per screen', () => {
    navigate('/forge');
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith('/forge', { dangerouslySingular: true });
  });

  it('ignores a second tap for the same href within the tap window', () => {
    navigate('/forge');
    now += navigationRules.tapLockMs - 1;
    navigate('/forge');
    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  it('lets a second tap for the same href through once the tap window has passed', () => {
    navigate('/forge');
    now += navigationRules.tapLockMs + 100;
    navigate('/forge');
    expect(pushMock).toHaveBeenCalledTimes(2);
  });

  it('never stays locked: after any sequence of calls, a later call always reaches the router', () => {
    // A burst of taps, same and different hrefs, inside the tap windows.
    navigate('/forge');
    navigate('/forge');
    now += 100;
    navigate('/team');
    now += 100;
    navigate('/forge');
    navigate('/team/classes');
    expect(pushMock).toHaveBeenCalledTimes(4);
    // Once the tap window has passed after the last call, nothing can keep the router closed.
    now += navigationRules.tapLockMs + 600;
    navigate('/forge');
    expect(pushMock).toHaveBeenCalledTimes(5);
    now += navigationRules.tapLockMs + 600;
    navigate('/team');
    expect(pushMock).toHaveBeenCalledTimes(6);
  });

  it('does not swallow a different href within the tap window', () => {
    navigate('/forge');
    now += 1;
    navigate('/inventory');
    expect(pushMock).toHaveBeenCalledTimes(2);
  });

  it('treats the root href as its own target', () => {
    navigate('/');
    now += 1;
    navigate('/');
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith('/', { dangerouslySingular: true });
  });
});

describe('the layout', () => {
  it('declares every stack screen singular', () => {
    const layout = readFileSync(join(__dirname, '../app/_layout.tsx'), 'utf8');
    const screens = [...layout.matchAll(/<Stack\.Screen name="([^"]+)"(.*?)\/>/g)];
    expect(screens.length).toBeGreaterThanOrEqual(14);
    for (const [, name, props] of screens) {
      expect(name).toBeTruthy();
      expect(props).toContain('dangerouslySingular');
    }
  });
});
