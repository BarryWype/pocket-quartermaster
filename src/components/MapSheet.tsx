import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PanResponder, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import type { Difficulty } from '@/content/difficulty';
import { motion } from '@/content/motion';
import type { SheetAction } from '@/game/places/mainAction';
import { formatDistance, formatTimeLeft, t } from '@/i18n';
import { ui } from '@/theme';

import { PressScale } from './motion';
import { SheetDrag } from './motion/OverlayPanel';
import { GameIcon } from './GameIcon';
import { Overlay } from './Overlay';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { DifficultyRing, EmberButton, TimeRing, WoodButton } from './ui';

/** The ring around the header's icon: the time left, or a fight's difficulty (with its time, when it has one). */
export type MapSheetRing =
  | { kind: 'time'; left: number; last: boolean }
  | { kind: 'difficulty'; difficulty: Difficulty; time?: { left: number; last: boolean } }
  | null;

/** One tab of the full sheet. Tabs come in a fixed order: what the place does, its order, details. */
export type MapSheetTab = { key: string; label: string; render: () => ReactNode };

export type MapSheetAction = {
  /** The decision from `mainAction()`. */
  state: SheetAction;
  /** The verb for the walk label, lower case: "trade", "fight", "collect 12". */
  verb: string;
  /** The label when the player can act: "Buy", "Fight", "Collect 12". */
  label: string;
  /** The label when blocked: the reason in the button's own words ("Needs a free hero"). */
  blockedLabel?: string;
  onPress: () => void;
  /** The walk button: centres the map on the place. The sheet goes back to its peek. */
  onWalk?: () => void;
};

export type MapSheetSecondary = { key: string; title: string; onPress: () => void; disabled?: boolean };

type Props = {
  /** A tap outside, a swipe down from the peek and Android back all lead here. There is no Close button. */
  onClose: () => void;
  emoji: string;
  icon?: ImageSourcePropType;
  ring: MapSheetRing;
  title: string;
  /** The one status line under the title: `mapSheetStatus()`. */
  status: string;
  /** What's here, in one line. */
  summary: ReactNode;
  action: MapSheetAction;
  /** Secondary actions, in a row under the main one. */
  secondary?: MapSheetSecondary[];
  /** The full sheet's tabs. Without tabs there is only the peek. */
  tabs?: MapSheetTab[];
  /** Opens straight on the full sheet. */
  startFull?: boolean;
  /** True once the player is in range: a peek grows to the full sheet; a full sheet stays as it is. */
  inRange?: boolean;
  accessibilityLabel?: string;
};

/** The header's status line: "320 m away · leaves in 2 h", or "You’re here · leaves in 2 h". */
export function mapSheetStatus({ distance, range, expiresAt, now }: { distance: number; range: number; expiresAt?: number; now: number }): string {
  const where = distance <= range ? t('mapSheet.here') : t('mapSheet.away', { distance: formatDistance(distance) });
  return expiresAt === undefined ? where : `${where} · ${t('mapSheet.leavesIn', { time: formatTimeLeft(Math.max(0, expiresAt - now)) })}`;
}

/**
 * The one template behind every sheet that opens from a map tap. A tap opens
 * the peek: the header (icon in its ring, name, one status line), what's here
 * in one line, and the main action in the footer. More, a swipe up, a tap on
 * the title or walking into range opens the full sheet with its tabs; a swipe
 * down goes back to the peek, then closes. It reads nothing but its props, so
 * a save change never re-renders it on its own.
 */
export function MapSheet({ onClose, emoji, icon, ring, title, status, summary, action, secondary, tabs, startFull, inRange, accessibilityLabel }: Props) {
  const hasTabs = (tabs?.length ?? 0) > 0;
  const [full, setFull] = useState(hasTabs && !!startFull);
  const [tabKey, setTabKey] = useState(tabs?.[0]?.key ?? '');

  // Walking into range grows a peek; a sheet the player shrank by hand stays shrunk until the next arrival.
  // Adjusted while rendering, as React advises for state that follows a prop.
  const [wasInRange, setWasInRange] = useState(!!inRange);
  if (!!inRange !== wasInRange) {
    setWasInRange(!!inRange);
    if (inRange && hasTabs) setFull(true);
  }

  // Switches heights on release; it doesn't follow the finger, so the body's ScrollView keeps its own scroll.
  const latest = useRef({ full, hasTabs, onClose });
  useEffect(() => {
    latest.current = { full, hasTabs, onClose };
  });
  // The responder's callbacks read `latest` only during a drag, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [responder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) => Math.abs(dy) > 6 && Math.abs(dy) > Math.abs(dx),
      onPanResponderRelease: (_, { dy, vy }) => {
        const { closeDistance, closeVelocity } = motion.sheetDrag;
        const now = latest.current;
        if ((dy < -closeDistance || vy < -closeVelocity) && now.hasTabs) setFull(true);
        else if (dy > closeDistance || vy > closeVelocity) {
          if (now.full) setFull(false);
          else now.onClose();
        }
      },
    }),
  );

  const shown = full && hasTabs ? (tabs!.find((tab) => tab.key === tabKey) ?? tabs![0]) : null;

  return (
    <Overlay onClose={onClose} position="bottom">
      <View accessibilityLabel={accessibilityLabel ?? `${title}, ${status}`}>
        <SheetDrag.Provider value={responder.panHandlers}>
          <Sheet
            variant="wood"
            emoji={emoji}
            icon={icon}
            badge={<SheetBadge emoji={emoji} icon={icon} ring={ring} />}
            title={title}
            subtitle={status}
            headerRight={
              hasTabs ? (
                <WoodButton compact title={full ? t('mapSheet.less') : t('mapSheet.more')} onPress={() => setFull(!full)} />
              ) : undefined
            }
            onHeaderPress={hasTabs ? () => setFull(!full) : undefined}
            headerHint={t('mapSheet.headerHint')}
            bodyStyle={styles.body}
            footerStyle={styles.footer}
            footer={
              <>
                <MainButton action={action} onWalked={() => setFull(false)} />
                {secondary && secondary.length > 0 && (
                  <View style={styles.secondary}>
                    {secondary.map((entry) => (
                      <WoodButton key={entry.key} compact title={entry.title} disabled={entry.disabled} onPress={entry.onPress} style={styles.secondaryButton} />
                    ))}
                  </View>
                )}
              </>
            }
          >
            <View>{summary}</View>
            {shown && (
              <>
                <View style={styles.tabs} accessibilityRole="tablist" accessibilityLabel={t('mapSheet.tabsLabel')}>
                  {tabs!.map((tab, i) => {
                    const on = tab.key === shown.key;
                    return (
                      <PressScale
                        key={tab.key}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={tab.label}
                        onPress={() => setTabKey(tab.key)}
                        style={[styles.tab, i > 0 && styles.tabSeam, on && styles.tabOn]}
                      >
                        <Text style={[styles.tabText, on && styles.tabTextOn]}>{tab.label}</Text>
                      </PressScale>
                    );
                  })}
                </View>
                {shown.render()}
              </>
            )}
          </Sheet>
        </SheetDrag.Provider>
      </View>
    </Overlay>
  );
}

/** The footer's main button: the act, the walk (which says how far), or the act locked with its reason as its label. */
function MainButton({ action, onWalked }: { action: MapSheetAction; onWalked: () => void }) {
  const { state } = action;
  if (state.kind === 'walk') {
    return (
      <WoodButton
        emoji="👣"
        title={t('mapSheet.walkTo', { distance: formatDistance(state.meters), verb: action.verb })}
        onPress={() => {
          action.onWalk?.();
          onWalked();
        }}
      />
    );
  }
  if (state.kind === 'blocked') return <EmberButton disabled title={action.blockedLabel ?? action.label} onPress={action.onPress} />;
  return <EmberButton title={action.label} onPress={action.onPress} />;
}

const SIDE = 30;

/** The header's icon: a diamond tile inside its time ring, or its difficulty ring for a fight. */
function SheetBadge({ emoji, icon, ring }: { emoji: string; icon?: ImageSourcePropType; ring: MapSheetRing }) {
  const tile = (
    <View style={styles.tile}>
      <View style={styles.upright}>
        <GameIcon emoji={emoji} icon={icon} size={22} />
      </View>
    </View>
  );
  if (ring?.kind === 'difficulty') {
    return (
      <DifficultyRing difficulty={ring.difficulty} shape="diamond" size={SIDE} time={ring.time}>
        {tile}
      </DifficultyRing>
    );
  }
  if (ring?.kind === 'time') {
    return (
      <TimeRing left={ring.left} last={ring.last} size={SIDE}>
        {tile}
      </TimeRing>
    );
  }
  return tile;
}

const styles = StyleSheet.create({
  body: { gap: 10, paddingBottom: 12 },
  footer: { flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-start' },
  secondary: { flexDirection: 'row', gap: 8 },
  secondaryButton: { flex: 1 },
  tabs: { flexDirection: 'row', borderWidth: 3, borderColor: ui.outline, backgroundColor: ui.woodDark },
  tab: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabSeam: { borderLeftWidth: 2, borderLeftColor: ui.outline },
  tabOn: { backgroundColor: ui.woodSelected, borderBottomWidth: 3, borderBottomColor: ui.brass },
  tabText: { fontSize: 17, color: ui.onWoodMuted, textAlign: 'center' },
  tabTextOn: { color: ui.brassLight },
  tile: {
    width: SIDE,
    height: SIDE,
    transform: [{ rotate: '45deg' }],
    backgroundColor: ui.woodDeep,
    borderWidth: 2,
    borderColor: ui.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upright: { transform: [{ rotate: '-45deg' }] },
});
