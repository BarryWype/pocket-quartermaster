import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { gatheringConfig } from '@/content/gatheringConfig';
import { frPatrolTexts } from '@/content/fr/patrols';
import { materialById } from '@/content/lookup';
import { patrolTexts } from '@/content/patrols';
import { walkToShow, type WalkFight, type WalkPatrols, type WalkSummary } from '@/game/gathering/autoGather';
import { pocketModeAvailable } from '@/game/patrols/pocketMode';
import { locationPermissionState, planPocketTurnOn, type LocationPermissionState } from '@/game/patrols/pocketPermission';
import { formatDistance, formatDuration, formatNumber, formatPercent, localized, t } from '@/i18n';
import { disableAutoGather, startPocketMode } from '@/hooks/useAutoGather';
import { isExpoGo, pocketPlatform } from '@/services/environment';
import { getAutoGatherPermission, requestAutoGatherPermission, type AutoGatherPermission } from '@/services/walkTracking';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useWorldStore } from '@/store/worldStore';
import { colors, pixel } from '@/theme';

import { Button } from './Button';
import { GameIcon } from './GameIcon';
import { Overlay } from './Overlay';
import { Panel } from './Panel';
import { patrolIcons } from './PatrolMarker';
import { PocketModePanel } from './PocketModePanel';
import { Text } from './Text';

const openSettings = () => Linking.openSettings().catch(() => {});

function InfoDialog({ confirm, onTurnOn, onClose }: { confirm: boolean; onTurnOn: () => void; onClose: () => void }) {
  const limited = useWorldStore((state) => state.autoGather === 'limited');
  const lines = [
    t('autoGather.infoIntro'),
    t('autoGather.infoAutoGather', { radius: gatheringConfig.autoGather.radiusMeters, tapRadius: gatheringConfig.collectRadiusMeters }),
    t('autoGather.infoPatrolAlerts'),
    t('autoGather.infoEscort'),
    t('autoGather.infoCounting'),
    t('autoGather.infoNotify'),
    t('autoGather.infoPassive'),
    t('autoGather.infoBattery'),
  ];
  return (
    <Overlay onClose={onClose}>
        <Panel style={styles.dialog}>
          <Text style={styles.title}>{t('autoGather.label')}</Text>
          {lines.map((line) => (
            <Text key={line} style={styles.line}>
              • {line}
            </Text>
          ))}
          {limited && !confirm && (
            <View style={styles.warning}>
              <Text>{t('autoGather.limitedHint')}</Text>
              <Button title={t('autoGather.openSettings')} onPress={openSettings} />
            </View>
          )}
          <View style={styles.actions}>
            <Button title={confirm ? t('common.cancel') : t('common.close')} color={colors.muted} onPress={onClose} />
            {confirm && <Button title={t('autoGather.turnOn')} onPress={onTurnOn} />}
          </View>
        </Panel>
    </Overlay>
  );
}

/**
 * The auto-gather switch's behaviour, shared by the map and Settings: the
 * info dialog before the first turn-on, then what the phone's location
 * permission allows — full Pocket mode, limited to the app being open (with
 * how to upgrade), a one-time system request, or an explanation that never
 * asks in a loop. In Expo Go, Pocket mode needs the installed app.
 */
export function useAutoGatherToggle() {
  const enabled = useSettingsStore((state) => state.pocketMode.enabled);
  const introSeen = useSettingsStore((state) => state.pocketMode.introSeen);
  const mode = useWorldStore((state) => state.autoGather);
  const available = useGameStore((state) => pocketModeAvailable(state.save));
  const [dialog, setDialog] = useState<'info' | 'confirm' | null>(null);

  const turnOn = async () => {
    setDialog(null);
    useSettingsStore.getState().setPocketMode({ introSeen: true });
    const environment = { expoGo: isExpoGo(), platform: pocketPlatform() };
    const toState = (permission: AutoGatherPermission): LocationPermissionState =>
      locationPermissionState(permission !== 'denied', permission === 'background');
    let permission = await getAutoGatherPermission().catch((): AutoGatherPermission => 'denied');
    let plan = planPocketTurnOn(toState(permission), environment, useWorldStore.getState().autoGatherRefused);
    if (plan.kind === 'ask') {
      // One system request; if it stays refused, the switch explains from now on instead of asking again.
      permission = await requestAutoGatherPermission().catch((): AutoGatherPermission => 'denied');
      const refused = toState(permission) === 'none';
      if (refused) useWorldStore.getState().set({ autoGatherRefused: true });
      plan = planPocketTurnOn(toState(permission), environment, refused);
    }
    if (plan.kind === 'ask' || plan.kind === 'explain') {
      if (plan.kind === 'explain' && plan.reason === 'expoGo') {
        Alert.alert(t('autoGather.expoGoTitle'), t('autoGather.expoGoBody'), [{ text: t('common.close'), style: 'cancel' }]);
      } else {
        Alert.alert(t('autoGather.deniedTitle'), t('autoGather.deniedBody'), [
          { text: t('common.close'), style: 'cancel' },
          { text: t('autoGather.openSettings'), onPress: openSettings },
        ]);
      }
      return;
    }
    const started = await startPocketMode(permission);
    if (!started) {
      useWorldStore.getState().set({ autoGatherRefused: true });
      Alert.alert(t('autoGather.deniedTitle'), t('autoGather.deniedBody'), [
        { text: t('common.close'), style: 'cancel' },
        { text: t('autoGather.openSettings'), onPress: openSettings },
      ]);
      return;
    }
    if (plan.mode === 'limited' && plan.upgrade) {
      Alert.alert(t('autoGather.limitedTitle'), `${t('autoGather.limitedBody')}\n${t(plan.upgrade.stepsKey)}`, [
        { text: t('common.close'), style: 'cancel' },
        { text: t('autoGather.openSettings'), onPress: openSettings },
      ]);
    }
  };
  const toggle = (on: boolean) => {
    if (!on) disableAutoGather();
    else if (introSeen) turnOn();
    else setDialog('confirm');
  };

  return {
    enabled,
    mode,
    available,
    toggle,
    showInfo: () => setDialog('info'),
    dialog: dialog && <InfoDialog confirm={dialog === 'confirm'} onTurnOn={turnOn} onClose={() => setDialog(null)} />,
  };
}

/** The always-visible switch on the map, with its ⓘ and the Pocket mode panel. */
export function AutoGatherPill({ style }: { style?: StyleProp<ViewStyle> }) {
  const { enabled, mode, available, toggle, showInfo, dialog } = useAutoGatherToggle();
  if (!available) return null;
  const state = !enabled ? 'off' : mode === 'limited' ? 'limited' : 'on';
  const openPanel = () => useWorldStore.getState().set({ pocketPanel: 'open' });
  return (
    <View style={[styles.pillRow, style]}>
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: enabled }} onPress={() => toggle(!enabled)} style={[styles.pill, styles[state]]}>
        <Text style={styles.pillText}>
          {state === 'off' ? '○' : '●'} {t('autoGather.label')}: {t(`autoGather.${state}`)}
        </Text>
      </Pressable>
      <Pressable accessibilityLabel={t('autoGather.openOptions')} onPress={openPanel} style={styles.info}>
        <Text style={styles.infoText}>›</Text>
      </Pressable>
      <Pressable accessibilityLabel={t('autoGather.info')} onPress={showInfo} style={styles.info}>
        <Text style={styles.infoText}>ⓘ</Text>
      </Pressable>
      {state === 'limited' && (
        // Background location is one system setting away.
        <Pressable accessibilityLabel={t('autoGather.openSettings')} onPress={openSettings} style={styles.info}>
          <Text style={styles.infoText}>⚙️</Text>
        </Pressable>
      )}
      {dialog}
      <PocketModePanel />
    </View>
  );
}

export function WalkStats({ walk }: { walk: WalkSummary }) {
  return (
    <>
      <Text style={styles.line}>
        {t('autoGather.walkStats', {
          duration: formatDuration(walk.endedAt - walk.startedAt),
          distance: formatDistance(walk.distanceMeters),
          count: walk.nodes,
        })}
      </Text>
      {walk.gained.length > 0 && (
        <View style={styles.materials}>
          {walk.gained.map(({ materialId, amount }) => (
            <View key={materialId} style={styles.material}>
              <GameIcon emoji={materialById[materialId]?.emoji ?? '❓'} icon={materialById[materialId]?.icon} size={22} />
              <Text style={styles.line}>×{amount}</Text>
            </View>
          ))}
        </View>
      )}
      {walk.steps > 0 && (
        <Text style={styles.muted}>
          {t(walk.stepsEstimated ? 'autoGather.stepsEstimated' : 'autoGather.steps', { steps: formatNumber(walk.steps) })}
        </Text>
      )}
    </>
  );
}

/** The patrols and travellers met on a walk, under the walk stats. */
export function WalkPatrolsSection({ patrols }: { patrols: WalkPatrols }) {
  const heroes = useGameStore((state) => state.save.heroes);
  const texts = localized({ en: patrolTexts, fr: frPatrolTexts });
  const won = patrols.fights.filter((fight) => fight.won);
  const lost = patrols.fights.filter((fight) => !fight.won);
  const fightLine = (fight: WalkFight) =>
    t('autoGather.walkPatrols.fight', {
      patrol: `${patrolIcons[fight.kind]} ${texts.kinds[fight.kind]}${fight.elite ? ' ★' : ''}`,
      tier: fight.tier,
      outcome: fight.won
        ? fight.by === 'escort'
          ? t('autoGather.walkPatrols.byEscort')
          : t('autoGather.walkPatrols.byYou')
        : t('autoGather.walkPatrols.lostFight'),
    });
  const escortHp = patrols.escortHp;
  const escortName = escortHp ? (heroes.find((hero) => hero.id === escortHp.heroId)?.name ?? t('hero.unknown')) : null;
  const rewardParts = [
    ...(patrols.gold > 0 ? [t('patrols.goldGain', { gold: patrols.gold })] : []),
    ...(patrols.xp > 0 ? [t('expeditions.loot.xp', { xp: patrols.xp })] : []),
  ];
  return (
    <>
      {won.length > 0 && (
        <>
          <Text style={styles.subtitle}>{t('autoGather.walkPatrols.beaten')}</Text>
          {won.map((fight, index) => (
            <Text key={index} style={styles.line}>
              {fightLine(fight)}
            </Text>
          ))}
        </>
      )}
      {lost.length > 0 && (
        <>
          <Text style={styles.subtitle}>{t('autoGather.walkPatrols.lost')}</Text>
          {lost.map((fight, index) => (
            <Text key={index} style={styles.line}>
              {fightLine(fight)}
            </Text>
          ))}
        </>
      )}
      {escortHp && escortName && (
        <>
          <Text style={styles.subtitle}>{t('autoGather.walkPatrols.escortHp')}</Text>
          <Text style={styles.line}>
            {t('autoGather.walkPatrols.escortHpLine', {
              hero: escortName,
              before: formatPercent(escortHp.before / Math.max(1, escortHp.max)),
              after: formatPercent(escortHp.after / Math.max(1, escortHp.max)),
            })}
          </Text>
        </>
      )}
      {patrols.travellers.length > 0 && (
        <>
          <Text style={styles.subtitle}>{t('autoGather.walkPatrols.travellers')}</Text>
          {patrols.travellers.map((traveller, index) => (
            <Text key={index} style={styles.line}>
              {t('autoGather.walkPatrols.traveller', {
                traveller: `${patrolIcons[traveller.kind]} ${texts.travellers[traveller.kind].name}`,
                reward: t(`autoGather.walkPatrols.rewardWords.${traveller.reward}`),
              })}
            </Text>
          ))}
        </>
      )}
      {(rewardParts.length > 0 || patrols.materials.length > 0) && (
        <>
          <Text style={styles.subtitle}>{t('autoGather.walkPatrols.rewards')}</Text>
          {rewardParts.length > 0 && <Text style={styles.line}>{rewardParts.join(', ')}</Text>}
          {patrols.materials.length > 0 && (
            <View style={styles.materials}>
              {patrols.materials.map(({ materialId, amount }) => (
                <View key={materialId} style={styles.material}>
                  <GameIcon emoji={materialById[materialId]?.emoji ?? '❓'} icon={materialById[materialId]?.icon} size={22} />
                  <Text style={styles.line}>×{amount}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </>
  );
}

/** "While you walked": the newest walk recorded while the app was closed, until dismissed. */
export function WalkCard() {
  const walk = useGameStore((state) => walkToShow(state.save));
  const markWalksSeen = useGameStore((state) => state.markWalksSeen);
  const autoStopMinutes = useSettingsStore((state) => state.pocketMode.autoStopMinutes);
  if (!walk) return null;
  return (
    <Overlay onClose={markWalksSeen}>
        <Panel style={styles.dialog}>
          <Text style={styles.title}>🚶 {t('autoGather.whileYouWalked')}</Text>
          <WalkStats walk={walk} />
          {walk.patrols && <WalkPatrolsSection patrols={walk.patrols} />}
          {walk.autoStopped && <Text style={styles.muted}>{t('autoGather.autoStopped', { minutes: autoStopMinutes })}</Text>}
          <View style={styles.actions}>
            <Button title={t('common.close')} onPress={markWalksSeen} />
          </View>
        </Panel>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  dialog: { gap: 10, padding: 14 },
  title: { fontSize: 24 },
  line: { fontSize: 19 },
  muted: { fontSize: 18, color: colors.muted },
  subtitle: { fontSize: 21 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  warning: { gap: 6, padding: 8, borderWidth: 2, borderColor: colors.danger, backgroundColor: colors.parchmentDark },
  materials: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  material: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, borderWidth: pixel.outline - 1, borderColor: colors.woodDark },
  off: { backgroundColor: colors.parchment },
  on: { backgroundColor: colors.highlight },
  limited: { backgroundColor: colors.parchmentDark, borderColor: colors.gold },
  pillText: { fontSize: 17, color: colors.ink },
  info: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.woodDark,
    backgroundColor: colors.parchment,
  },
  infoText: { fontSize: 16 },
});
