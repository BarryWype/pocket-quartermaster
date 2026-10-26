import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, AppState, Linking, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/Button';
import { SectionTitle } from '@/components/Row';
import { Text } from '@/components/Text';
import { notificationCategories, notificationGroups } from '@/content/notifications';
import type { NotificationCategory, NotificationGroup } from '@/game/notifications/types';
import { syncPlan } from '@/hooks/useNotifications';
import { deviceNotifications, type NotificationPermission } from '@/services/notifications';
import { debugEnabled, useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { colors } from '@/theme';

const DAY_MINUTES = 24 * 60;
const QUIET_STEP = 30;

const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

function SwitchRow({
  title,
  description,
  value,
  disabled,
  onChange,
}: {
  title: string;
  description?: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      <View style={styles.label}>
        <Text style={styles.rowTitle}>{title}</Text>
        {description && <Text style={styles.hint}>{description}</Text>}
      </View>
      <Switch value={value} disabled={disabled} onValueChange={onChange} />
    </View>
  );
}

function TimeStepper({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const shift = (by: number) => onChange((value + by + DAY_MINUTES) % DAY_MINUTES);
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>{label}</Text>
      <View style={styles.stepper}>
        <Button title="−" onPress={() => shift(-QUIET_STEP)} />
        <Text style={styles.time}>{clock(value)}</Text>
        <Button title="+" onPress={() => shift(QUIET_STEP)} />
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const { notifications, updateNotifications, setCategory, setQuietHours } = useSettingsStore();
  const resetSave = useGameStore((state) => state.resetSave);
  const debugOn = useDebugStore(debugEnabled);
  const setDebugEnabled = useDebugStore((state) => state.setEnabled);
  const toggleDebug = (on: boolean) => {
    if (!on) return setDebugEnabled(false);
    Alert.alert('Turn on debug tools?', 'The 🐞 button on the map can change your save: gold, gear, heroes, timers and more.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Turn on', onPress: () => setDebugEnabled(true) },
    ]);
  };
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  useFocusEffect(
    useCallback(() => {
      const check = () => deviceNotifications.getPermission().then(setPermission, () => setPermission(null));
      check();
      // Coming back from system settings.
      const appState = AppState.addEventListener('change', (state) => state === 'active' && check());
      return () => appState.remove();
    }, []),
  );

  const askPermission = async () => {
    if (permission?.canAskAgain) await deviceNotifications.requestPermission().catch(() => false);
    else await Linking.openSettings();
    setPermission(await deviceNotifications.getPermission());
    syncPlan();
  };

  const confirmReset = () =>
    Alert.alert('Reset progression?', 'Heroes, gear, inventory, gold, expeditions and chests go back to the start.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: resetSave },
    ]);

  const off = !notifications.enabled;
  const groups = Object.keys(notificationGroups) as NotificationGroup[];
  const categories = Object.keys(notificationCategories) as NotificationCategory[];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Notifications</Text>
      {permission && !permission.granted && (
        <View style={styles.warning}>
          <Text>
            {permission.canAskAgain
              ? 'Notifications are not allowed yet.'
              : 'Notifications are blocked in your system settings.'}
          </Text>
          <Button title={permission.canAskAgain ? 'Allow notifications' : 'Open settings'} onPress={askPermission} />
        </View>
      )}
      <SwitchRow
        title="All notifications"
        value={notifications.enabled}
        onChange={(enabled) => updateNotifications({ enabled })}
      />

      {groups.map((group) => (
        <View key={group} style={styles.section}>
          <SectionTitle>{notificationGroups[group].title}</SectionTitle>
          {categories
            .filter((category) => notificationCategories[category].group === group)
            .map((category) => (
              <SwitchRow
                key={category}
                title={notificationCategories[category].title}
                description={notificationCategories[category].description}
                value={notifications.categories[category]}
                disabled={off}
                onChange={(on) => setCategory(category, on)}
              />
            ))}
        </View>
      ))}

      <View style={styles.section}>
        <SectionTitle>{'Quiet hours'}</SectionTitle>
        <SwitchRow
          title="Quiet hours"
          description="Notifications wait until quiet hours end."
          value={notifications.quietHours.enabled}
          disabled={off}
          onChange={(enabled) => setQuietHours({ enabled })}
        />
        {notifications.quietHours.enabled && (
          <>
            <TimeStepper
              label="Start"
              value={notifications.quietHours.start}
              onChange={(start) => setQuietHours({ start })}
            />
            <TimeStepper label="End" value={notifications.quietHours.end} onChange={(end) => setQuietHours({ end })} />
            <SwitchRow
              title="Allow expedition results during quiet hours"
              value={notifications.allowResultsInQuietHours}
              disabled={off}
              onChange={(allowResultsInQuietHours) => updateNotifications({ allowResultsInQuietHours })}
            />
          </>
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle>Developer</SectionTitle>
        <SwitchRow
          title="Debug tools"
          description={
            __DEV__
              ? 'Always on in development builds.'
              : 'Shows the 🐞 button on the map. Turning it off resets every debug option.'
          }
          value={debugOn}
          disabled={__DEV__}
          onChange={toggleDebug}
        />
      </View>

      <View style={styles.section}>
        <SectionTitle>Progression</SectionTitle>
        <Text style={styles.hint}>Start the game over from the tutorial. This cannot be undone.</Text>
        <Button title="Reset progression" color={colors.danger} onPress={confirmReset} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, padding: 24 },
  title: { fontSize: 24 },
  section: { gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: { flex: 1 },
  rowTitle: { fontSize: 17 },
  hint: { color: colors.muted, fontSize: 14 },
  disabled: { opacity: 0.5 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  time: { fontSize: 17, minWidth: 52, textAlign: 'center' },
  warning: {
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.danger,
    backgroundColor: colors.parchmentDark,
  },
});
