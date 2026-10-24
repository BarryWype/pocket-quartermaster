import { Pedometer } from 'expo-sensors';
import { Platform } from 'react-native';

export type PedometerService = {
  /** False when the device has no step counter or permission was refused. */
  requestPermission: () => Promise<boolean>;
  /** Steps since local midnight where the OS keeps history (iOS); null elsewhere. */
  getStepsToday: () => Promise<number | null>;
  /** Calls back with the steps taken since the previous callback. Returns a stop function. */
  watch: (onNewSteps: (steps: number) => void) => () => void;
};

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
  watch: (onNewSteps) => {
    let last = 0;
    const subscription = Pedometer.watchStepCount(({ steps }) => {
      if (steps > last) onNewSteps(steps - last);
      last = steps;
    });
    return () => subscription.remove();
  },
};
