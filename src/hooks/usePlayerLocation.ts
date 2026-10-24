import { useEffect, useState } from 'react';

import { acceptFix } from '@/game/gathering/locationFilter';
import { deviceLocation, type PlayerLocation } from '@/services/location';
import { useDebugStore } from '@/store/debugStore';

export type PlayerLocationState =
  | { status: 'pending' }
  | { status: 'denied' }
  | { status: 'ready'; location: PlayerLocation; mocked: boolean };

/** The player's location: the debug mock when set, otherwise the device GPS. */
export function usePlayerLocation(): PlayerLocationState {
  const mockLocation = useDebugStore((state) => state.mockLocation);
  const [device, setDevice] = useState<PlayerLocationState>({ status: 'pending' });

  useEffect(() => {
    if (mockLocation) return;
    let stop: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      if (!(await deviceLocation.requestPermission())) {
        setDevice({ status: 'denied' });
        return;
      }
      let lastAccepted: PlayerLocation | null = null;
      const unsubscribe = await deviceLocation.watch((reading) => {
        const location = acceptFix(lastAccepted, reading);
        if (!location) return;
        lastAccepted = location;
        setDevice({ status: 'ready', location, mocked: false });
      });
      if (cancelled) unsubscribe();
      else stop = unsubscribe;
    })();

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [mockLocation]);

  if (mockLocation) {
    return {
      status: 'ready',
      mocked: true,
      location: { position: mockLocation, accuracy: 5, speed: 0, timestamp: Date.now() },
    };
  }
  return device;
}
