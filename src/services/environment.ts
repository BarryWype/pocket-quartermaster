import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import type { PocketPlatform } from '@/game/patrols/pocketPermission';

/** Whether the app runs in Expo Go, where background location is not available. */
export const isExpoGo = () => Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/** The platform whose settings steps Pocket mode should quote. */
export const pocketPlatform = (): PocketPlatform =>
  Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'other';
