import type { ReactNode } from 'react';
import { StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';

import { GameIcon } from '@/components/GameIcon';
import { Text } from '@/components/Text';
import { fonts, ui } from '@/theme';

type Props = {
  children?: ReactNode;
  title?: string;
  titleEmoji?: string;
  titleIcon?: ImageSourcePropType;
  titleSub?: string;
  /** A red pin dot on the top edge, for quest notices. */
  pinned?: boolean;
  tilt?: -1 | 0 | 1;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

/** A parchment card: 3 px outline, double inner rim, 4 px drop strip, optional plank title band. */
export function ParchmentCard({ children, title, titleEmoji, titleIcon, titleSub, pinned, tilt = 0, style, contentStyle }: Props) {
  return (
    <View style={[styles.drop, style]}>
      <View style={[styles.card, tilt !== 0 && { transform: [{ rotate: `${tilt}deg` }] }]}>
        <View style={styles.rimGap} pointerEvents="none" />
        <View style={styles.rim} pointerEvents="none" />
        {pinned && <View style={styles.pin} pointerEvents="none" />}
        {title !== undefined && (
          <View style={styles.band}>
            <View style={styles.bandSeams} pointerEvents="none">
              {Array.from({ length: 12 }, (_, i) => (
                <View key={i} style={[styles.bandSeam, { top: (i + 1) * 14 }]} />
              ))}
            </View>
            {titleEmoji !== undefined && (
              <View style={styles.bandIcon}>
                <GameIcon emoji={titleEmoji} icon={titleIcon} size={30} />
              </View>
            )}
            <View style={styles.bandText}>
              <Text style={styles.bandTitle}>{title}</Text>
              {titleSub !== undefined && <Text style={styles.bandSub}>{titleSub}</Text>}
            </View>
          </View>
        )}
        <View style={[styles.content, contentStyle]}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  drop: { paddingBottom: 4, backgroundColor: ui.outline },
  card: { borderWidth: 3, borderColor: ui.outline, backgroundColor: ui.parchment },
  rimGap: { position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderWidth: 2, borderColor: ui.parchment },
  rim: { position: 'absolute', top: 5, left: 5, right: 5, bottom: 5, borderWidth: 2, borderColor: ui.brass },
  pin: {
    position: 'absolute',
    top: -5,
    left: '50%',
    marginLeft: -5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ui.bad,
    borderWidth: 2,
    borderColor: ui.outline,
  },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: ui.woodMid,
    borderBottomWidth: 3,
    borderBottomColor: ui.outline,
  },
  bandSeams: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  bandSeam: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: ui.woodSeam },
  bandIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ui.woodDeep,
    borderWidth: 2,
    borderColor: ui.brass,
  },
  bandText: { flexDirection: 'column', flexShrink: 1 },
  bandTitle: { fontSize: 23, color: ui.brassLight, lineHeight: 24 },
  bandSub: { fontFamily: fonts.serif, fontSize: 13, color: '#E2CFA4' },
  content: { padding: 10 },
});
