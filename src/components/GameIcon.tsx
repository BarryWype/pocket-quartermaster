import { Image, type ImageSourcePropType } from 'react-native';

import { Text } from './Text';

type Props = {
  emoji: string;
  icon?: ImageSourcePropType;
  size: number;
};

/** A content icon: its pixel art when it has one, its emoji otherwise. */
export function GameIcon({ emoji, icon, size }: Props) {
  if (icon) return <Image source={icon} style={{ width: size, height: size }} resizeMode="contain" />;
  return <Text style={{ fontSize: size * 0.75, width: size, textAlign: 'center' }}>{emoji}</Text>;
}
