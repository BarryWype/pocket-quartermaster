import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import type { Rarity } from '@/content/gear';
import type { MapRarity } from '@/game/loot/types';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * What the player feels at each moment of play. Components call `feel`, never
 * the haptics library, so a moment's haptic and (later) its sound are set here
 * once.
 */
type Haptic = 'tap' | 'light' | 'confirm' | 'toggleOn' | 'toggleOff';

export type FeelMoment = 'press' | 'toggle' | 'reward' | 'equip' | 'forge';

export type FeelOptions = {
  /** A reward's rarity: the rarest finds land harder. */
  rarity?: Rarity | MapRarity;
  /** A toggle's new state. */
  on?: boolean;
};

type MomentFeel = {
  haptic: (options: FeelOptions) => Haptic | null;
  /** The sound slot, filled by a later pass. */
  sound: string | null;
};

const MOMENTS: Record<FeelMoment, MomentFeel> = {
  press: { haptic: () => 'tap', sound: null },
  toggle: { haptic: ({ on }) => (on ? 'toggleOn' : 'toggleOff'), sound: null },
  reward: { haptic: ({ rarity }) => (rarity === 'legendary' ? 'confirm' : 'light'), sound: null },
  equip: { haptic: () => 'light', sound: null },
  forge: { haptic: () => 'confirm', sound: null },
};

/** Android's own haptic constants feel like iOS's and need no vibrate permission. */
const ANDROID: Record<Haptic, Haptics.AndroidHaptics> = {
  tap: Haptics.AndroidHaptics.Virtual_Key,
  light: Haptics.AndroidHaptics.Context_Click,
  confirm: Haptics.AndroidHaptics.Confirm,
  toggleOn: Haptics.AndroidHaptics.Toggle_On,
  toggleOff: Haptics.AndroidHaptics.Toggle_Off,
};

const IOS: Record<Haptic, () => Promise<void>> = {
  tap: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft),
  light: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  confirm: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  toggleOn: () => Haptics.selectionAsync(),
  toggleOff: () => Haptics.selectionAsync(),
};

/** The haptic a moment plays, or null; exported for tests. */
export const hapticOf = (moment: FeelMoment, options: FeelOptions = {}) => MOMENTS[moment].haptic(options);

export function feel(moment: FeelMoment, options: FeelOptions = {}) {
  if (!useSettingsStore.getState().haptics) return;
  const haptic = hapticOf(moment, options);
  if (!haptic) return;
  const played = Platform.OS === 'android' ? Haptics.performAndroidHapticsAsync(ANDROID[haptic]) : IOS[haptic]();
  played.catch(() => {});
}
