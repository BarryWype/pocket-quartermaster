import { StyleSheet, View, type ImageSourcePropType } from 'react-native';

import type { ResourceKind } from '@/game/generation/types';

import { GameIcon } from './GameIcon';

const borderColors: Record<ResourceKind, string> = {
  wood: '#5e3622',
  ore: '#6b6b6b',
  animal: '#8a5a2b',
  herb: '#2f6b2a',
};

type Props = {
  emoji: string;
  icon?: ImageSourcePropType;
  kind: ResourceKind;
  inRange: boolean;
  fleeing: boolean;
};

export function SpawnMarker({ emoji, icon, kind, inRange, fleeing }: Props) {
  return (
    <View
      style={[
        styles.tile,
        { borderColor: borderColors[kind] },
        inRange && styles.inRange,
        fleeing && styles.fleeing,
      ]}
    >
      {fleeing ? <GameIcon emoji="💨" size={21} /> : <GameIcon emoji={emoji} icon={icon} size={21} />}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4ead2',
    borderWidth: 3,
  },
  inRange: { backgroundColor: '#fff6a8', transform: [{ scale: 1.2 }] },
  fleeing: { opacity: 0.6 },
});
