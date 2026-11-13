import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { Easing, ReduceMotion, type WithSpringConfig, type WithTimingConfig } from 'react-native-reanimated';

import { motion, type MotionDuration, type MotionEasing, type MotionLevel, type MotionSpring } from '@/content/motion';
import { useSettingsStore } from '@/store/settingsStore';

/** The phone's reduce-motion setting, read once and followed by one listener for the whole app. */
let systemReduced = false;
let listening = false;
const listeners = new Set<() => void>();

function setSystemReduced(reduced: boolean) {
  if (reduced === systemReduced) return;
  systemReduced = reduced;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!listening) {
    listening = true;
    AccessibilityInfo.isReduceMotionEnabled().then(setSystemReduced, () => {});
    AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduced);
  }
  return () => {
    listeners.delete(listener);
  };
}

const readSystemReduced = () => systemReduced;

/** The player's level, lowered to Reduced when the phone asks to reduce motion. */
export function motionLevelOf(setting: MotionLevel, phoneReduced: boolean): MotionLevel {
  return phoneReduced && setting === 'full' ? 'reduced' : setting;
}

/**
 * How much the interface may move, and the one config every animation reads.
 * Components never read the Animations setting themselves.
 */
export function useMotion() {
  const setting = useSettingsStore((state) => state.animations);
  const phoneReduced = useSyncExternalStore(subscribe, readSystemReduced);
  return { level: motionLevelOf(setting, phoneReduced), phoneReduced, config: motion };
}

/** The level right now, for what is set once when it opens (a modal's native fade); components use `useMotion`. */
export const currentMotionLevel = () => motionLevelOf(useSettingsStore.getState().animations, systemReduced);

const curves = Object.fromEntries(
  Object.entries(motion.easing).map(([name, [x1, y1, x2, y2]]) => [name, Easing.bezier(x1, y1, x2, y2)]),
) as Record<MotionEasing, ReturnType<typeof Easing.bezier>>;

/**
 * A timing from the config. The level already decides what moves, so the
 * library's own reduce-motion check is turned off (it would skip the fades).
 */
export function timing(duration: MotionDuration, easing: MotionEasing = 'out'): WithTimingConfig {
  return { duration: motion.duration[duration], easing: curves[easing], reduceMotion: ReduceMotion.Never };
}

/** A spring from the config; only the Full level uses springs. */
export function spring(name: MotionSpring): WithSpringConfig {
  return { ...motion.spring[name], reduceMotion: ReduceMotion.Never };
}
