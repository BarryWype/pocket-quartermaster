import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { frNotificationCategories } from '@/content/fr/notifications';
import { heroClasses } from '@/content/heroes';
import { notificationCategories } from '@/content/notifications';
import { patrolRules } from '@/content/patrols';
import { nearbyKinds } from '@/content/pocketMode';
import type { NotificationCategory } from '@/game/notifications/types';
import type { AlertFor } from '@/game/patrols/escort';
import { pocketTracking } from '@/game/patrols/pocketMode';
import type { SaveData } from '@/game/save';
import { currentHp, drinkProblem, isExhausted, maxHp } from '@/game/team/health';
import { isAway } from '@/game/team/team';
import { formatPercent, localized, t } from '@/i18n';
import { disableAutoGather, enableAutoGather, syncBackground } from '@/hooks/useAutoGather';
import { useNow } from '@/hooks/useNow';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useWorldStore } from '@/store/worldStore';
import { colors, pixel } from '@/theme';

import { Button } from './Button';
import { HpBar } from './HpBar';
import { Overlay } from './Overlay';
import { useSheetMaxHeight } from './Sheet';
import { Panel } from './Panel';
import { Text } from './Text';

export type PocketOption = 'autoGather' | 'patrolAlerts' | 'escort';

const ALERT_CHOICES: AlertFor[] = ['all', 'banditsTravellers', 'off'];

/** Applies one option switch and keeps tracking in step with it. */
function setPocketOption(option: PocketOption, on: boolean) {
  const { pocketMode, setPocketMode } = useSettingsStore.getState();
  const next = { ...pocketMode, [option]: on };
  setPocketMode({ [option]: on });
  if (!next.autoGather && !next.patrolAlerts && !next.escort) disableAutoGather();
  else if (on && next.enabled && useWorldStore.getState().autoGather === 'off') enableAutoGather();
  else syncBackground();
}

/** One of Pocket mode's options, with its switch. */
export function PocketOptionRow({ option }: { option: PocketOption }) {
  const on = useSettingsStore((state) => state.pocketMode[option]);
  return (
    <View style={styles.optionRow}>
      <Text style={styles.optionLabel}>{t(`autoGather.options.${option}`)}</Text>
      <Switch
        value={on}
        onValueChange={(value) => setPocketOption(option, value)}
        trackColor={{ false: colors.parchmentDark, true: colors.success }}
        thumbColor={colors.parchment}
        ios_backgroundColor={colors.parchmentDark}
      />
    </View>
  );
}

/** Which patrols a notification is wanted for. */
export function AlertForPicker() {
  const patrolAlertFor = useSettingsStore((state) => state.notifications.patrolAlertFor);
  const updateNotifications = useSettingsStore((state) => state.updateNotifications);
  return (
    <View style={styles.picker}>
      <Text style={styles.pickerLabel}>{t('autoGather.alertFor')}</Text>
      <View style={styles.options}>
        {ALERT_CHOICES.map((choice) => (
          <Pressable
            key={choice}
            onPress={() => {
              updateNotifications({ patrolAlertFor: choice });
              syncBackground();
            }}
            style={[styles.option, patrolAlertFor === choice && styles.optionActive]}
          >
            <Text style={styles.optionText}>{t(`autoGather.alertForChoices.${choice}`)}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Pocket mode's own notification kinds, switched here next to its options. */
export const POCKET_CATEGORIES: NotificationCategory[] = ['questReady', 'questTarget', 'chestUnlocked', 'nearbyPlaces', 'secretPlace'];

/** Which places nearby a notification is wanted for. */
function NearbyKindsPicker() {
  const wanted = useSettingsStore((state) => state.notifications.nearbyKinds);
  const updateNotifications = useSettingsStore((state) => state.updateNotifications);
  return (
    <View style={styles.picker}>
      <Text style={styles.pickerLabel}>{t('autoGather.nearbyFor')}</Text>
      <View style={styles.options}>
        {nearbyKinds.map((kind) => {
          const on = wanted.includes(kind);
          return (
            <Pressable
              key={kind}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => {
                updateNotifications({ nearbyKinds: on ? wanted.filter((k) => k !== kind) : [...wanted, kind] });
                syncBackground();
              }}
              style={[styles.option, on && styles.optionActive]}
            >
              <Text style={styles.optionText}>{t(`autoGather.nearbyChoices.${kind}`)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** The notifications Pocket mode sends, each with its switch, and the places nearby to watch. */
export function PocketNotificationRows() {
  const notifications = useSettingsStore((state) => state.notifications);
  const setCategory = useSettingsStore((state) => state.setCategory);
  const texts = localized({ en: notificationCategories, fr: frNotificationCategories });
  return (
    <View style={styles.section}>
      <Text style={styles.pickerLabel}>{t('autoGather.notifyTitle')}</Text>
      {POCKET_CATEGORIES.map((category) => (
        <View key={category} style={styles.optionRow}>
          <Text style={styles.optionLabel}>{texts[category].title}</Text>
          <Switch
            value={notifications.categories[category]}
            disabled={!notifications.enabled}
            onValueChange={(on) => {
              setCategory(category, on);
              syncBackground();
            }}
            trackColor={{ false: colors.parchmentDark, true: colors.success }}
            thumbColor={colors.parchment}
            ios_backgroundColor={colors.parchmentDark}
          />
        </View>
      ))}
      {notifications.categories.nearbyPlaces && <NearbyKindsPicker />}
    </View>
  );
}

/** Shows while Pocket mode has no option on: without one, tracking does not run. */
export function PocketOptionsHint() {
  const pocketMode = useSettingsStore((state) => state.pocketMode);
  // With the master switch forced on, this is whether any option is on.
  if (pocketTracking({ ...pocketMode, enabled: true })) return null;
  return <Text style={styles.hint}>{t('autoGather.needOption')}</Text>;
}

/** The escort option: pick the hero who walks with you, and watch over them. */
function EscortSection({ save, now }: { save: SaveData; now: number }) {
  const escortOn = useSettingsStore((state) => state.pocketMode.escort);
  const setEscort = useGameStore((state) => state.setEscort);
  const drinkPotion = useGameStore((state) => state.drinkPotion);
  const [picking, setPicking] = useState(false);
  if (!escortOn) return null;
  const escortId = save.escort?.heroId;
  const hero = escortId ? save.heroes.find((h) => h.id === escortId) : undefined;
  const candidates = save.heroes.filter((h) => !isAway(save, h.id) && !isExhausted(h, now));
  if (picking) {
    return (
      <View style={styles.section}>
        <View style={styles.options}>
          {candidates.map((candidate) => (
            <Pressable
              key={candidate.id}
              onPress={() => {
                setEscort(candidate.id);
                setPicking(false);
                syncBackground();
              }}
              style={styles.option}
            >
              <Text style={styles.optionText}>
                {heroClasses[candidate.classId].emoji} {candidate.name} · {formatPercent(currentHp(save, candidate, now) / maxHp(save, candidate))}
              </Text>
            </Pressable>
          ))}
        </View>
        <Button title={t('common.cancel')} color={colors.muted} onPress={() => setPicking(false)} />
      </View>
    );
  }
  if (!hero) {
    return (
      <View style={styles.section}>
        <Text style={styles.hint}>{t('autoGather.escortNone')}</Text>
        <Button title={t('autoGather.pickHero')} onPress={() => setPicking(true)} />
      </View>
    );
  }
  const status = isExhausted(hero, now)
    ? t('autoGather.escortExhausted')
    : currentHp(save, hero, now) / maxHp(save, hero) < patrolRules.escort.minHpShare
      ? t('autoGather.escortPaused', { percent: formatPercent(patrolRules.escort.minHpShare) })
      : t('autoGather.escortReady');
  return (
    <View style={styles.section}>
      <Text style={styles.escortName}>
        {heroClasses[hero.classId].emoji} {hero.name} · {status}
      </Text>
      <HpBar save={save} hero={hero} now={now} />
      <View style={styles.buttons}>
        <Button
          title={t('autoGather.escortDrink')}
          disabled={drinkProblem(save, hero.id, now) !== null}
          onPress={() => {
            drinkPotion(hero.id);
            syncBackground();
          }}
        />
        <Button title={t('autoGather.swapEscort')} color={colors.muted} onPress={() => setPicking(true)} />
        <Button
          title={t('autoGather.removeEscort')}
          color={colors.danger}
          onPress={() => {
            setEscort(null);
            syncBackground();
          }}
        />
      </View>
    </View>
  );
}

/** Pocket mode's panel, opened from the pill on the map: its options and the escort. */
export function PocketModePanel() {
  const open = useWorldStore((state) => state.pocketPanel !== 'closed');
  const save = useGameStore((state) => state.save);
  const now = useNow();
  const close = () => useWorldStore.getState().set({ pocketPanel: 'closed' });
  const maxHeight = useSheetMaxHeight();
  if (!open) return null;
  return (
    <Overlay onClose={close}>
        <Panel style={[styles.dialog, { maxHeight }]}>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            <Text style={styles.title}>{t('autoGather.label')}</Text>
            <Text style={styles.hint}>{t('autoGather.does')}</Text>
            <PocketOptionRow option="autoGather" />
            <PocketOptionRow option="patrolAlerts" />
            <AlertForPicker />
            <PocketOptionRow option="escort" />
            <EscortSection save={save} now={now} />
            <PocketOptionsHint />
            <PocketNotificationRows />
          </ScrollView>
          <View style={styles.actions}>
            <Button title={t('common.close')} onPress={close} />
          </View>
        </Panel>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  dialog: { gap: 10, padding: 14 },
  scroll: { flexShrink: 1 },
  content: { gap: 10 },
  title: { fontSize: 24 },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  optionLabel: { fontSize: 20 },
  picker: { gap: 4 },
  pickerLabel: { fontSize: 16, color: colors.muted, textTransform: 'uppercase' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  option: { paddingHorizontal: 8, paddingVertical: 4, borderWidth: 2, borderColor: colors.woodDark, backgroundColor: colors.parchmentDark },
  optionActive: { borderColor: colors.ink, borderWidth: pixel.outline, backgroundColor: colors.highlight },
  optionText: { fontSize: 17 },
  section: { gap: 10 },
  escortName: { fontSize: 20 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  hint: { fontSize: 18, color: colors.muted },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
});
