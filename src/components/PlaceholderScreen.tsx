import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

import { Text } from './Text';

type Props = {
  title: string;
  description: string;
};

export function PlaceholderScreen({ title, description }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 26, marginBottom: 8 },
  description: { fontSize: 19, color: colors.muted, textAlign: 'center' },
});
