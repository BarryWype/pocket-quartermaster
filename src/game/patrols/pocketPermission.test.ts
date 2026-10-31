import { clearsRefusal, locationPermissionState, planPocketTurnOn } from './pocketPermission';

describe('location permission states', () => {
  it('maps the raw grants to none / whileUsing / always', () => {
    expect(locationPermissionState(false, false)).toBe('none');
    expect(locationPermissionState(false, true)).toBe('none');
    expect(locationPermissionState(true, false)).toBe('whileUsing');
    expect(locationPermissionState(true, true)).toBe('always');
  });
});

describe('planning a tap on Enable', () => {
  const env = { expoGo: false, platform: 'ios' as const };

  it('enables full Pocket mode when location is always allowed', () => {
    expect(planPocketTurnOn('always', env, false)).toEqual({ kind: 'enable', mode: 'on' });
    expect(planPocketTurnOn('always', env, true)).toEqual({ kind: 'enable', mode: 'on' });
  });

  it('enables limited mode with the upgrade steps and a settings button when only while-using is allowed', () => {
    const plan = planPocketTurnOn('whileUsing', env, false);
    expect(plan).toEqual({
      kind: 'enable',
      mode: 'limited',
      upgrade: { settingsButton: true, stepsKey: 'autoGather.upgradeStepsIos' },
    });
    expect(planPocketTurnOn('whileUsing', { expoGo: false, platform: 'android' }, false)).toMatchObject({
      upgrade: { stepsKey: 'autoGather.upgradeStepsAndroid' },
    });
  });

  it('asks the system once when nothing is allowed, and only explains after a refusal', () => {
    expect(planPocketTurnOn('none', env, false)).toEqual({ kind: 'ask' });
    expect(planPocketTurnOn('none', env, true)).toEqual({ kind: 'explain', reason: 'noLocation', settingsButton: true, askAgain: false });
  });

  it('in Expo Go explains that the installed app is needed and never asks, whatever the permission', () => {
    for (const permission of ['none', 'whileUsing', 'always'] as const) {
      expect(planPocketTurnOn(permission, { expoGo: true, platform: 'ios' }, false)).toEqual({
        kind: 'explain',
        reason: 'expoGo',
        settingsButton: false,
        askAgain: false,
      });
    }
  });
});

describe('clearing a refusal', () => {
  it('clears the refusal whenever the phone reports foreground location granted', () => {
    expect(clearsRefusal('whileUsing')).toBe(true);
    expect(clearsRefusal('always')).toBe(true);
  });

  it('keeps the refusal when there is no location at all', () => {
    expect(clearsRefusal('none')).toBe(false);
  });
});
