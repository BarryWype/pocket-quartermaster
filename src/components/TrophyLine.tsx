import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';

import { lootConfig } from '@/content/loot/config';
import { trophyOf } from '@/game/loot/generators';
import type { LootSourceId } from '@/game/loot/types';
import { t } from '@/i18n';
import { colors } from '@/theme';

import { IconLabel } from './IconLabel';

/** The trophy a boss or elite source can drop: a relic, monster parts or an elemental stone; nothing when it has none. */
export function TrophyLine({ source, labelStyle }: { source: LootSourceId; labelStyle?: StyleProp<TextStyle> }) {
  const kind = trophyOf(source);
  if (!kind) return null;
  const [min, max] = lootConfig.trophies.parts;
  return <IconLabel emoji="🏆" label={t(`trophy.${kind}`, { min, max })} labelStyle={[styles.label, labelStyle]} />;
}

const styles = StyleSheet.create({
  label: { color: colors.muted },
});
