import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useMotion } from './useMotion';

/**
 * False while the app is in the background, the screen is not shown, or the
 * Animations level is below Full (the phone's reduce-motion setting lowers it).
 * Ambient animations pause to save battery.
 */
export function useAnimationsEnabled() {
  const focused = useIsFocused();
  const { level } = useMotion();
  const [active, setActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const appState = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => appState.remove();
  }, []);

  return focused && active && level === 'full';
}

/** A frame counter that ticks `fps` times a second while animations are enabled and `active`. */
export function useAnimationFrame(fps: number, active = true) {
  const enabled = useAnimationsEnabled() && active;
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setFrame((f) => f + 1), 1000 / fps);
    return () => clearInterval(timer);
  }, [enabled, fps]);

  return frame;
}
