import { useState } from 'react';
import { Alert, Linking, Modal, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { gatheringConfig } from '@/content/gatheringConfig';
import { frPatrolTexts } from '@/content/fr/patrols';
import { materialById } from '@/content/lookup';
import { patrolTexts } from '@/content/patrols';
import { walkToShow, type WalkFight, type WalkPatrols, type WalkSummary } from '@/game/gathering/autoGather';
import { pocketModeAvailable } from '@/game/patrols/pocketMode';
import { formatDistance, formatDuration, formatNumber, formatPercent, localized, t } from '@/i18n';
import { disableAutoGather, enableAutoGather } from '@/hooks/useAutoGather';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useWorldStore } from '@/store/worldStore';
import { colors, pixel } from '@/theme';

import { Button } from './Button';
import { GameIcon } from './GameIcon';
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
    t('autoGather.infoBattery'),
  ];
  return (
    <Modal transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
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
      </View>
    </Modal>
  );
}

/**
 * The auto-gather switch's behaviour, shared by the map and Settings: the
 * info dialog before the first turn-on, the permission request, and what to
 * say when location is refused.
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
    if ((await enableAutoGather()) !== 'denied') return;
    Alert.alert(t('autoGather.deniedTitle'), t('autoGather.deniedBody'), [
      { text: t('common.close'), style: 'cancel' },
      { text: t('autoGather.openSettings'), onPress: openSettings },
    ]);
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
    <Modal transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={markWalksSeen}>
      <View style={styles.backdrop}>
        <Panel style={styles.dialog}>
          <Text style={styles.title}>🚶 {t('autoGather.whileYouWalked')}</Text>
          <WalkStats walk={walk} />
          {walk.patrols && <WalkPatrolsSection patrols={walk.patrols} />}
          {walk.autoStopped && <Text style={styles.muted}>{t('autoGather.autoStopped', { minutes: autoStopMinutes })}</Text>}
          <View style={styles.actions}>
            <Button title={t('common.close')} onPress={markWalksSeen} />
          </View>
        </Panel>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
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
