import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

/**
 * False while the app is in the background, the screen is not shown, or the
 * player asked the OS to reduce motion. Animations pause to save battery.
 */
export function useAnimationsEnabled() {
  const focused = useIsFocused();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const appState = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion, () => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      appState.remove();
      motion.remove();
    };
  }, []);

  return focused && active && !reduceMotion;
}

/** A frame counter that ticks `fps` times a second while animations are enabled. */
export function useAnimationFrame(fps: number) {
  const enabled = useAnimationsEnabled();
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setFrame((f) => f + 1), 1000 / fps);
    return () => clearInterval(timer);
  }, [enabled, fps]);

  return frame;
}
