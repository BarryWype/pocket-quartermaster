import type { ReactNode } from 'react';
import { StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { GameIcon } from './GameIcon';
import { Text } from './Text';

type Props = {
  emoji: string;
  icon?: ImageSourcePropType;
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  /** E.g. a gear piece's quality colour. */
  titleColor?: string;
};

export function Row({ emoji, icon, title, subtitle, right, titleColor }: Props) {
  return (
    <View style={styles.row}>
      <GameIcon emoji={emoji} icon={icon} size={32} />
      <View style={styles.body}>
        <Text style={[styles.title, titleColor ? { color: titleColor } : null]}>{title}</Text>
        {typeof subtitle === 'string' ? <Text style={styles.subtitle}>{subtitle}</Text> : subtitle}
      </View>
      {typeof right === 'string' || typeof right === 'number' ? <Text style={styles.right}>{right}</Text> : right}
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.section}>{children}</Text>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ccc',
  },
  body: { flex: 1 },
  title: { fontSize: 16 },
  subtitle: { fontSize: 13, color: '#666' },
  right: { fontSize: 16, fontWeight: '600' },
  section: { fontSize: 18, fontWeight: '600', marginTop: 16, marginBottom: 4 },
});
