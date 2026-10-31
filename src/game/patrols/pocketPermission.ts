/**
 * Pocket mode's permission states and what the switch should do about them.
 * Pure logic: the app feeds it the phone's answer and the environment, and
 * gets back the behaviour (enable fully, enable limited with an explanation,
 * ask once, or explain without asking again).
 */

/** The phone's location permission for the app, in Pocket mode's terms. */
export type LocationPermissionState =
  /** No location at all: the app may ask. */
  | 'none'
  /** "While using the app" only: Pocket mode works while the app is open (limited). */
  | 'whileUsing'
  /** "Always" / "Allow all the time": full background Pocket mode. */
  | 'always';

export type PocketPlatform = 'ios' | 'android' | 'other';

/** Where the app runs: Expo Go can't do background location at all. */
export type PocketEnvironment = { expoGo: boolean; platform: PocketPlatform };

export type PocketTurnOnPlan =
  | { kind: 'enable'; mode: 'on' }
  | {
      kind: 'enable';
      mode: 'limited';
      /** How to get full Pocket mode: platform steps plus the app's settings. */
      upgrade: { settingsButton: true; stepsKey: 'autoGather.upgradeStepsIos' | 'autoGather.upgradeStepsAndroid' };
    }
  /** Show the system's own permission prompt once; re-plan with the answer. */
  | { kind: 'ask' }
  | {
      kind: 'explain';
      reason: 'noLocation' | 'expoGo';
      /** The app's settings can help (noLocation); Expo Go can't. */
      settingsButton: boolean;
      /** Never ask again after a refusal: the switch explains instead. */
      askAgain: false;
    };

/** Maps the raw foreground/background grants to the three states. */
export function locationPermissionState(foregroundGranted: boolean, backgroundGranted: boolean): LocationPermissionState {
  if (!foregroundGranted) return 'none';
  return backgroundGranted ? 'always' : 'whileUsing';
}

/** Whether the phone's answer clears an earlier refusal: any location at all and the player is not stuck. */
export function clearsRefusal(permission: LocationPermissionState): boolean {
  return permission !== 'none';
}

/**
 * What tapping Enable should do. Expo Go wins over everything: Pocket mode
 * needs the installed app, so it explains and never asks. "While using only"
 * turns Pocket mode on in limited mode and explains the upgrade. No location
 * asks the system once; after a refusal it only explains, with the settings.
 */
export function planPocketTurnOn(
  permission: LocationPermissionState,
  environment: PocketEnvironment,
  alreadyRefused: boolean,
): PocketTurnOnPlan {
  if (environment.expoGo) return { kind: 'explain', reason: 'expoGo', settingsButton: false, askAgain: false };
  switch (permission) {
    case 'always':
      return { kind: 'enable', mode: 'on' };
    case 'whileUsing':
      return {
        kind: 'enable',
        mode: 'limited',
        upgrade: {
          settingsButton: true,
          stepsKey: environment.platform === 'android' ? 'autoGather.upgradeStepsAndroid' : 'autoGather.upgradeStepsIos',
        },
      };
    case 'none':
      if (alreadyRefused) return { kind: 'explain', reason: 'noLocation', settingsButton: true, askAgain: false };
      return { kind: 'ask' };
  }
}
