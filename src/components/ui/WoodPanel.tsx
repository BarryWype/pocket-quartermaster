import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { ui } from '@/theme';

type Props = {
  children?: ReactNode;
  /** A brass inner rim, for panels that frame content directly. */
  rim?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** A dark-wood panel: plank seams every 16 px inside a 3 px outline border. */
export function WoodPanel({ children, rim, style }: Props) {
  return (
    <View style={[styles.panel, style]}>
      <View style={styles.seams} pointerEvents="none">
        {Array.from({ length: 80 }, (_, i) => (
          <View key={i} style={[styles.seam, { top: (i + 1) * 16 }]} />
        ))}
      </View>
      {rim && <View style={styles.rim} pointerEvents="none" />}
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 3, borderColor: ui.outline, backgroundColor: ui.woodDark, overflow: 'hidden' },
  seams: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  seam: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: ui.woodSeam },
  rim: { position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderWidth: 2, borderColor: ui.brass },
  content: { zIndex: 1 },
});
