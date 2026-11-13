import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, AppState, Linking, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { PressScale } from '@/components/motion';
import PagerView from 'react-native-pager-view';
import Constants from 'expo-constants';

import { useAutoGatherToggle, WalkStats } from '@/components/AutoGather';
import { Button } from '@/components/Button';
import { AlertForPicker, POCKET_CATEGORIES, PocketNotificationRows, PocketOptionRow, PocketOptionsHint } from '@/components/PocketModePanel';
import { Text } from '@/components/Text';
import { frNotificationCategories, frNotificationGroups } from '@/content/fr/notifications';
import { gatheringConfig } from '@/content/gatheringConfig';
import { sightRules } from '@/content/map';
import { MOTION_LEVELS, type MotionLevel } from '@/content/motion';
import { notificationCategories, notificationGroups } from '@/content/notifications';
import type { NotificationCategory, NotificationGroup } from '@/game/notifications/types';
import { useLanguage } from '@/hooks/useLanguage';
import { useMotion } from '@/hooks/useMotion';
import { syncPlan } from '@/hooks/useNotifications';
import { localized, t } from '@/i18n';
import { navigate } from '@/services/navigation';
import { deviceNotifications, type NotificationPermission } from '@/services/notifications';
import { updateBuffer } from '@/services/walkTracking';
import { debugEnabled, useDebugStore } from '@/store/debugStore';
import { useGameStore } from '@/store/gameStore';
import { type LanguageSetting, useSettingsStore } from '@/store/settingsStore';
import { fonts, ui } from '@/theme';

import { Deferred, DiamondRail, EmberButton, GhostScreen, ParchmentCard, PixelSwitch, WoodButton, useLazyPages, type RailItem } from '@/components/ui';
import { timed } from '@/components/timed';

const DAY_MINUTES = 24 * 60;
const QUIET_STEP = 30;
const LANGUAGES: { id: LanguageSetting; label: () => string }[] = [
  { id: 'system', label: () => t('settings.languageSystem') },
  { id: 'en', label: () => 'English' },
  { id: 'fr', label: () => 'Français' },
];
const SIGHT_LABELS: Record<number, () => string> = {
  1: () => t('settings.sight.1'),
  2: () => t('settings.sight.2'),
  3: () => t('settings.sight.3'),
};

const MOTION_LABELS: Record<MotionLevel, () => string> = {
  full: () => t('settings.motion.full'),
  reduced: () => t('settings.motion.reduced'),
  off: () => t('settings.motion.off'),
};

const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** A setting with a switch: its title, an optional one-line hint, and a pixel switch. */
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
      <PixelSwitch value={value} accessibilityLabel={title} disabled={disabled} onValueChange={onChange} />
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

/** One of a setting's fixed choices, brass when it is the picked one. */
function SelectButton({
  label,
  selected,
  onPress,
  style,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <PressScale
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceOn, style]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextOn]}>{label}</Text>
    </PressScale>
  );
}

type SectionId = 'game' | 'language' | 'alerts' | 'about';

/** The four rail sections, their labels also used by the ghost's rail on the first frame. */
const SECTION_META: { id: SectionId; icon: string; label: () => string }[] = [
  { id: 'game', icon: '🎲', label: () => t('settings.section.game') },
  { id: 'language', icon: '🌍', label: () => t('settings.section.language') },
  { id: 'alerts', icon: '🔔', label: () => t('settings.section.alerts') },
  { id: 'about', icon: 'ℹ️', label: () => t('settings.section.about') },
];

/** The settings sections as rail items, and the section the screen opens on; the ghost's rail shows the same ones. */
export function useSettingsRail(): { items: RailItem[]; selected: SectionId } {
  return { items: SECTION_META.map(({ id, icon, label }) => ({ key: id, label: label(), emoji: icon })), selected: 'game' };
}

/**
 * The four settings sections on a rail: Game, Language, Alerts, About. Each
 * entry renders its own scrolling page of parchment cards, so a new setting
 * lands in a section's cards, and a whole new page is one more entry here.
 */
function SettingsScreen() {
  const rail = useSettingsRail();
  return (
    <Deferred
      name="settings"
      ghost={<GhostScreen variant="cards" rail={<DiamondRail items={rail.items} selected={rail.selected} onSelect={() => {}} />} />}
    >
      <SettingsContent />
    </Deferred>
  );
}

function SettingsContent() {
  useLanguage();
  const { language, notifications, updateNotifications, setCategory, setQuietHours, set, sightRange, pocketMode, setPocketMode, animations, haptics } = useSettingsStore();
  const { phoneReduced } = useMotion();
  const autoToggle = useAutoGatherToggle();
  const walks = useGameStore((state) => state.save.autoGather.history);
  const tipsSeen = useGameStore((state) => state.save.tips.seen.length);
  const setAutoStop = (autoStopMinutes: number) => {
    setPocketMode({ autoStopMinutes });
    updateBuffer((buffer) => ({ ...buffer, autoStopMinutes })).catch(() => {});
  };
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
  const rail = useSettingsRail();
  const [page, setPage] = useState<SectionId>('game');
  const pager = useRef<PagerView>(null);

  const renderGame = () => (
    <>
      <ParchmentCard title={t('autoGather.label')} contentStyle={styles.card}>
        <SwitchRow
          title={t('autoGather.label')}
          description={
            !autoToggle.available
              ? t('autoGather.afterTutorial')
              : autoToggle.enabled && autoToggle.mode === 'limited'
                ? t('autoGather.limitedHint')
                : t('autoGather.hint', { radius: gatheringConfig.autoGather.radiusMeters })
          }
          value={autoToggle.enabled}
          disabled={!autoToggle.available}
          onChange={autoToggle.toggle}
        />
        <PocketOptionRow option="autoGather" />
        <PocketOptionRow option="patrolAlerts" />
        <AlertForPicker />
        <PocketOptionRow option="escort" />
        <PocketOptionsHint />
        <PocketNotificationRows />
        <View style={styles.actions}>
          <WoodButton title={t('autoGather.info')} compact onPress={autoToggle.showInfo} />
          {autoToggle.enabled && autoToggle.mode === 'limited' && (
            <WoodButton title={t('autoGather.openSettings')} compact onPress={() => Linking.openSettings()} />
          )}
        </View>
        <Text style={styles.rowTitle}>{t('autoGather.autoStopDelay')}</Text>
        <Text style={styles.hint}>{t('settings.autoStopHint')}</Text>
        <View style={styles.choiceFrame}>
          {gatheringConfig.autoGather.autoStopChoices.map((minutes) => (
            <SelectButton
              key={minutes}
              label={t('autoGather.minutes', { count: minutes })}
              selected={pocketMode.autoStopMinutes === minutes}
              onPress={() => setAutoStop(minutes)}
              style={styles.choiceGrow}
            />
          ))}
        </View>
      </ParchmentCard>
      <ParchmentCard title={t('settings.sightRange')} contentStyle={styles.card}>
        <Text style={styles.hint}>{t('settings.sightRangeHint')}</Text>
        <View style={styles.choiceFrame}>
          {sightRules.choices.map((choice) => (
            <SelectButton
              key={choice}
              label={SIGHT_LABELS[choice]()}
              selected={sightRange === choice}
              onPress={() => set({ sightRange: choice })}
              style={styles.choiceGrow}
            />
          ))}
        </View>
      </ParchmentCard>
      <ParchmentCard title={t('settings.animations')} contentStyle={styles.card}>
        <Text style={styles.hint}>{t('settings.animationsHint')}</Text>
        <View style={styles.choiceFrame}>
          {MOTION_LEVELS.map((level) => (
            <SelectButton
              key={level}
              label={MOTION_LABELS[level]()}
              selected={animations === level}
              onPress={() => set({ animations: level })}
              style={styles.choiceGrow}
            />
          ))}
        </View>
        {phoneReduced && animations === 'full' && <Text style={styles.hint}>{t('settings.motionPhoneReduced')}</Text>}
        <SwitchRow title={t('settings.haptics')} description={t('settings.hapticsHint')} value={haptics} onChange={(on) => set({ haptics: on })} />
      </ParchmentCard>
      <ParchmentCard title={t('autoGather.history')} contentStyle={styles.card}>
        {walks.length === 0 && <Text style={styles.hint}>{t('autoGather.noHistory')}</Text>}
        {walks.map((walk) => (
          <View key={`${walk.startedAt}-${walk.endedAt}`} style={styles.walk}>
            <Text style={styles.hint}>{new Date(walk.endedAt || walk.startedAt).toLocaleString()}</Text>
            <WalkStats walk={walk} />
          </View>
        ))}
      </ParchmentCard>
      <ParchmentCard title={t('settings.fieldNotes')} contentStyle={styles.card}>
        <Text style={styles.hint}>{t('settings.fieldNotesHint', { count: tipsSeen })}</Text>
        <WoodButton title={t('settings.tips')} compact onPress={() => navigate('/tips')} />
      </ParchmentCard>
      <ParchmentCard title={t('settings.progression')} contentStyle={styles.card}>
        <Text style={styles.hint}>{t('settings.resetHint')}</Text>
        <View style={styles.dangerBox}>
          <EmberButton title={t('settings.reset')} compact onPress={confirmReset} />
        </View>
      </ParchmentCard>
    </>
  );

  const renderLanguage = () => (
    <ParchmentCard title={t('settings.language')} contentStyle={styles.card}>
      <View style={styles.choices}>
        {LANGUAGES.map(({ id, label }) => (
          <SelectButton key={id} label={label()} selected={language === id} onPress={() => set({ language: id })} style={styles.langChoice} />
        ))}
      </View>
    </ParchmentCard>
  );

  const renderAlerts = () => (
    <>
      {permission && !permission.granted && (
        <View style={styles.warning}>
          <Text style={styles.hint}>{permission.canAskAgain ? t('settings.notAllowed') : t('settings.blocked')}</Text>
          <WoodButton
            title={permission.canAskAgain ? t('settings.allow') : t('settings.openSettings')}
            compact
            onPress={askPermission}
          />
        </View>
      )}
      <ParchmentCard title={t('settings.notifications')} contentStyle={styles.card}>
        <SwitchRow
          title={t('settings.allNotifications')}
          value={notifications.enabled}
          onChange={(enabled) => updateNotifications({ enabled })}
        />
        {groups.map((group) => {
          const shown = categories.filter(
            (category) => notificationCategories[category].group === group && !POCKET_CATEGORIES.includes(category),
          );
          if (shown.length === 0) return null;
          return (
            <View key={group} style={styles.group}>
              <Text style={styles.groupTitle}>{groupTexts[group].title}</Text>
              {shown.map((category) => (
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
          );
        })}
      </ParchmentCard>
      <ParchmentCard title={t('settings.quietHours')} contentStyle={styles.card}>
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
      </ParchmentCard>
    </>
  );

  const renderAbout = () => (
    <>
      <ParchmentCard title={t('settings.section.about')} contentStyle={styles.card}>
        <Text style={styles.rowTitle}>{`${t('settings.version')}: ${Constants.expoConfig?.version ?? ''}`}</Text>
        <WoodButton title={t('settings.credits')} compact onPress={() => navigate('/settings/credits')} />
      </ParchmentCard>
      <ParchmentCard title={t('settings.developer')} contentStyle={styles.card}>
        <SwitchRow
          title={t('settings.debugTools')}
          description={__DEV__ ? t('settings.debugAlwaysOn') : t('settings.debugHint')}
          value={debugOn}
          disabled={__DEV__}
          onChange={toggleDebug}
        />
      </ParchmentCard>
    </>
  );

  const sections = SECTION_META.map((meta) => ({
    ...meta,
    render: { game: renderGame, language: renderLanguage, alerts: renderAlerts, about: renderAbout }[meta.id],
  }));

  const pagerPages = useLazyPages({
    keys: SECTION_META.map(({ id }) => id),
    active: page,
    variant: 'cards',
    render: (id) => {
      const section = sections.find((one) => one.id === id)!;
      return (
        <ScrollView style={styles.content} contentContainerStyle={styles.page}>
          <Text style={styles.pageTitle}>{section.label()}</Text>
          {section.render()}
        </ScrollView>
      );
    },
  });

  return (
    <View style={styles.screen}>
      <View style={styles.body}>
        <DiamondRail
          items={rail.items}
          selected={page}
          onSelect={(key) => {
            const index = sections.findIndex((section) => section.id === key);
            pager.current?.setPage(index);
            setPage(key as SectionId);
          }}
        />
        <PagerView
          ref={pager}
          style={styles.pager}
          initialPage={0}
          onPageSelected={({ nativeEvent }) => setPage(sections[nativeEvent.position].id)}
        >
          {pagerPages}
        </PagerView>
      </View>
      {autoToggle.dialog}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ui.woodDark },
  body: { flex: 1, flexDirection: 'row' },
  pager: { flex: 1 },
  content: { flex: 1, backgroundColor: ui.woodDark },
  page: { paddingVertical: 12, paddingHorizontal: 14, gap: 14 },
  pageTitle: { fontSize: 22, color: ui.brassLight },
  card: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44 },
  label: { flex: 1 },
  rowTitle: { fontSize: 20, color: ui.ink },
  hint: { fontFamily: fonts.serif, fontSize: 14, color: ui.inkMuted },
  disabled: { opacity: 0.5 },
  group: { gap: 6 },
  groupTitle: { fontFamily: fonts.serif, fontSize: 15, color: ui.inkMuted, textTransform: 'uppercase' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  time: { fontSize: 20, minWidth: 52, textAlign: 'center', color: ui.ink },
  walk: { gap: 2, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: ui.parchmentRule },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceFrame: { flexDirection: 'row', borderWidth: 2, borderColor: ui.outline, backgroundColor: ui.woodDark },
  choice: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  choiceGrow: { flex: 1 },
  choiceOn: { backgroundColor: ui.brass },
  choiceText: { fontFamily: fonts.serifBold, fontSize: 14, color: ui.onWoodMuted },
  choiceTextOn: { color: ui.outline },
  langChoice: { borderWidth: 2, borderColor: ui.outline, backgroundColor: ui.parchmentShade },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  warning: { gap: 8, padding: 12, borderWidth: 2, borderColor: ui.bad, backgroundColor: ui.badBg },
  dangerBox: { alignSelf: 'flex-start', padding: 6, borderWidth: 2, borderColor: ui.bad, backgroundColor: ui.badBg },
});

export default timed('screen: settings', SettingsScreen);
