import { useEffect, useState } from 'react';

import { rainingAt } from '@/game/generation/ambience';

const read = () => {
  const now = new Date();
  return { hour: now.getHours() + now.getMinutes() / 60, raining: rainingAt(now.getTime()) };
};

/** The local hour (fractional) and whether it's raining, checked once a minute. */
export function useAmbience() {
  const [ambience, setAmbience] = useState(read);

  useEffect(() => {
    const timer = setInterval(() => setAmbience(read()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return ambience;
}
