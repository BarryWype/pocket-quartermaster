import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = {
  emoji: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

export function Row({ emoji, title, subtitle, right }: Props) {
  return (
    <View style={styles.row}>
      <Text style={styles.emoji}>{emoji}</Text>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
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
  emoji: { fontSize: 24, width: 32, textAlign: 'center' },
  body: { flex: 1 },
  title: { fontSize: 16 },
  subtitle: { fontSize: 13, color: '#666' },
  right: { fontSize: 16, fontWeight: '600' },
  section: { fontSize: 18, fontWeight: '600', marginTop: 16, marginBottom: 4 },
});
