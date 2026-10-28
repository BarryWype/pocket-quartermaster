import { Pedometer } from 'expo-sensors';
import { Platform } from 'react-native';

export type PedometerService = {
  /** False when the device has no step counter or permission was refused. */
  requestPermission: () => Promise<boolean>;
  /** Steps since local midnight where the OS keeps history (iOS); null elsewhere. */
  getStepsToday: () => Promise<number | null>;
  /** Steps between two moments where the OS keeps history (iOS); null elsewhere. */
  getStepsBetween: (start: number, end: number) => Promise<number | null>;
  /** Calls back with the steps taken since the previous callback. Returns a stop function. */
  watch: (onNewSteps: (steps: number) => void) => () => void;
};

let watching = 0;

/**
 * Whether the app's step watch is running in this JS runtime. On Android the
 * step counter keeps its starting point while the app is in the background,
 * so the watch credits those steps when the app comes back.
 */
export const isCountingSteps = () => watching > 0;

export const devicePedometer: PedometerService = {
  requestPermission: async () => {
    if (!(await Pedometer.isAvailableAsync())) return false;
    return (await Pedometer.requestPermissionsAsync()).granted;
  },
  getStepsToday: async () => {
    if (Platform.OS !== 'ios') return null;
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return (await Pedometer.getStepCountAsync(midnight, new Date())).steps;
  },
  getStepsBetween: async (start, end) => {
    if (Platform.OS !== 'ios' || !(await Pedometer.isAvailableAsync())) return null;
    return (await Pedometer.getStepCountAsync(new Date(start), new Date(end))).steps;
  },
  watch: (onNewSteps) => {
    let last = 0;
    const subscription = Pedometer.watchStepCount(({ steps }) => {
      if (steps > last) onNewSteps(steps - last);
      last = steps;
    });
    watching++;
    return () => {
      watching--;
      subscription.remove();
    };
  },
};
