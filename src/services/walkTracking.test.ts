import * as Location from 'expo-location';

import { getAutoGatherPermission, requestAutoGatherPermission } from './walkTracking';

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  getBackgroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
}));
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('./notifications', () => ({ deviceNotifications: { send: jest.fn() } }));
jest.mock('./pedometer', () => ({ isCountingSteps: jest.fn(() => false) }));

const grant = { granted: true, canAskAgain: true, status: 'granted', expires: 'never', platform: 'android' } as const;
const refuse = { granted: false, canAskAgain: false, status: 'denied', expires: 'never', platform: 'android' } as const;

const foregroundGet = Location.getForegroundPermissionsAsync as jest.Mock;
const backgroundGet = Location.getBackgroundPermissionsAsync as jest.Mock;
const foregroundAsk = Location.requestForegroundPermissionsAsync as jest.Mock;
const backgroundAsk = Location.requestBackgroundPermissionsAsync as jest.Mock;

describe('checking the auto-gather permission', () => {
  it('returns background when both foreground and background are granted', async () => {
    foregroundGet.mockResolvedValue(grant);
    backgroundGet.mockResolvedValue(grant);
    await expect(getAutoGatherPermission()).resolves.toBe('background');
  });

  it('returns foreground, not denied, when the background check throws', async () => {
    foregroundGet.mockResolvedValue(grant);
    backgroundGet.mockRejectedValue(new Error('ACCESS_BACKGROUND_LOCATION missing'));
    await expect(getAutoGatherPermission()).resolves.toBe('foreground');
  });

  it('returns foreground when only while-using is granted', async () => {
    foregroundGet.mockResolvedValue(grant);
    backgroundGet.mockResolvedValue(refuse);
    await expect(getAutoGatherPermission()).resolves.toBe('foreground');
  });

  it('returns denied when the foreground permission is refused', async () => {
    foregroundGet.mockResolvedValue(refuse);
    await expect(getAutoGatherPermission()).resolves.toBe('denied');
  });
});

describe('requesting the auto-gather permission', () => {
  it('returns background when both requests are granted', async () => {
    foregroundAsk.mockResolvedValue(grant);
    backgroundAsk.mockResolvedValue(grant);
    await expect(requestAutoGatherPermission()).resolves.toBe('background');
  });

  it('returns foreground, not denied, when the background request throws', async () => {
    foregroundAsk.mockResolvedValue(grant);
    backgroundAsk.mockRejectedValue(new Error('ACCESS_BACKGROUND_LOCATION missing'));
    await expect(requestAutoGatherPermission()).resolves.toBe('foreground');
  });

  it('returns denied when the foreground request is refused', async () => {
    foregroundAsk.mockResolvedValue(refuse);
    await expect(requestAutoGatherPermission()).resolves.toBe('denied');
  });
});
