import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, AppState, Linking, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Button } from '@/components/Button';
import { SectionTitle } from '@/components/Row';
import { Text } from '@/components/Text';
import { frNotificationCategories, frNotificationGroups } from '@/content/fr/notifications';
import { notificationCategories, notificationGroups } from '@/content/notifications';
import type { NotificationCategory, NotificationGroup } from '@/game/notifications/types';
import { useLanguage } from '@/hooks/useLanguage';
import { syncPlan } from '@/hooks/useNotifications';
import { localized, t } from '@/i18n';
import { deviceNotifications, type NotificationPermission } from '@/services/notifications';
import { debugEnabled, useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { type LanguageSetting, useSettingsStore } from '@/store/settingsStore';
import { colors, pixel } from '@/theme';

const DAY_MINUTES = 24 * 60;
const QUIET_STEP = 30;
const LANGUAGES: { id: LanguageSetting; label: () => string }[] = [
  { id: 'system', label: () => t('settings.languageSystem') },
  { id: 'en', label: () => 'English' },
  { id: 'fr', label: () => 'Français' },
];

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
  useLanguage();
  const { language, notifications, updateNotifications, setCategory, setQuietHours, set } = useSettingsStore();
  const groupTexts = localized({ en: notificationGroups, fr: frNotificationGroups });
  const categoryTexts = localized({ en: notificationCategories, fr: frNotificationCategories });
  const resetSave = useGameStore((state) => state.resetSave);
  const debugOn = useDebugStore(debugEnabled);
  const setDebugEnabled = useDebugStore((state) => state.setEnabled);
  const toggleDebug = (on: boolean) => {
    if (!on) return setDebugEnabled(false);
    Alert.alert(t('settings.debugConfirmTitle'), t('settings.debugConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.debugConfirmOk'), onPress: () => setDebugEnabled(true) },
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
    Alert.alert(t('settings.resetConfirmTitle'), t('settings.resetConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.resetConfirmOk'), style: 'destructive', onPress: resetSave },
    ]);

  const off = !notifications.enabled;
  const groups = Object.keys(notificationGroups) as NotificationGroup[];
  const categories = Object.keys(notificationCategories) as NotificationCategory[];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('settings.language')}</Text>
      <View style={styles.languages}>
        {LANGUAGES.map(({ id, label }) => (
          <Button key={id} title={label()} color={language === id ? colors.woodDark : colors.muted} onPress={() => set({ language: id })} />
        ))}
      </View>

      <Text style={styles.title}>{t('settings.notifications')}</Text>
      {permission && !permission.granted && (
        <View style={styles.warning}>
          <Text>
            {permission.canAskAgain ? t('settings.notAllowed') : t('settings.blocked')}
          </Text>
          <Button title={permission.canAskAgain ? t('settings.allow') : t('settings.openSettings')} onPress={askPermission} />
        </View>
      )}
      <SwitchRow
        title={t('settings.allNotifications')}
        value={notifications.enabled}
        onChange={(enabled) => updateNotifications({ enabled })}
      />

      {groups.map((group) => (
        <View key={group} style={styles.section}>
          <SectionTitle>{groupTexts[group].title}</SectionTitle>
          {categories
            .filter((category) => notificationCategories[category].group === group)
            .map((category) => (
              <SwitchRow
                key={category}
                title={categoryTexts[category].title}
                description={categoryTexts[category].description}
                value={notifications.categories[category]}
                disabled={off}
                onChange={(on) => setCategory(category, on)}
              />
            ))}
        </View>
      ))}

      <View style={styles.section}>
        <SectionTitle>{t('settings.quietHours')}</SectionTitle>
        <SwitchRow
          title={t('settings.quietHours')}
          description={t('settings.quietHoursHint')}
          value={notifications.quietHours.enabled}
          disabled={off}
          onChange={(enabled) => setQuietHours({ enabled })}
        />
        {notifications.quietHours.enabled && (
          <>
            <TimeStepper
              label={t('settings.start')}
              value={notifications.quietHours.start}
              onChange={(start) => setQuietHours({ start })}
            />
            <TimeStepper label={t('settings.end')} value={notifications.quietHours.end} onChange={(end) => setQuietHours({ end })} />
            <SwitchRow
              title={t('settings.allowResults')}
              value={notifications.allowResultsInQuietHours}
              disabled={off}
              onChange={(allowResultsInQuietHours) => updateNotifications({ allowResultsInQuietHours })}
            />
          </>
        )}
      </View>

      <View style={styles.section}>
        <SectionTitle>{t('settings.developer')}</SectionTitle>
        <SwitchRow
          title={t('settings.debugTools')}
          description={__DEV__ ? t('settings.debugAlwaysOn') : t('settings.debugHint')}
          value={debugOn}
          disabled={__DEV__}
          onChange={toggleDebug}
        />
      </View>

      <View style={styles.section}>
        <SectionTitle>{t('settings.progression')}</SectionTitle>
        <Text style={styles.hint}>{t('settings.resetHint')}</Text>
        <Button title={t('settings.reset')} color={colors.danger} onPress={confirmReset} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12, padding: 24 },
  title: { fontSize: 28 },
  languages: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  section: { gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: { flex: 1 },
  rowTitle: { fontSize: 21 },
  hint: { color: colors.muted, fontSize: 18 },
  disabled: { opacity: 0.5 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  time: { fontSize: 21, minWidth: 52, textAlign: 'center' },
  warning: {
    gap: 8,
    padding: 12,
    borderWidth: pixel.outline,
    borderColor: colors.danger,
    backgroundColor: colors.parchmentDark,
  },
});
