import * as Location from 'expo-location';

import type { GpsFix } from '@/game/gathering/locationFilter';

export type PlayerLocation = GpsFix;

export type LocationService = {
  requestPermission: () => Promise<boolean>;
  getCurrent: () => Promise<PlayerLocation>;
  /** Resolves to a function that stops watching. */
  watch: (onUpdate: (location: PlayerLocation) => void) => Promise<() => void>;
};

function toPlayerLocation(location: Location.LocationObject): PlayerLocation {
  const { latitude, longitude, accuracy, speed } = location.coords;
  // Android reports 0 or negative speed when it has no estimate.
  const knownSpeed = speed !== null && speed > 0 ? speed : null;
  return { position: { latitude, longitude }, accuracy, speed: knownSpeed, timestamp: location.timestamp };
}

export const deviceLocation: LocationService = {
  requestPermission: async () => {
    const { granted } = await Location.requestForegroundPermissionsAsync();
    return granted;
  },
  getCurrent: async () =>
    toPlayerLocation(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })),
  watch: async (onUpdate) => {
    const subscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 3, timeInterval: 2000 },
      (location) => onUpdate(toPlayerLocation(location)),
    );
    return () => subscription.remove();
  },
};
