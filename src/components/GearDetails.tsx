import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { gearRules, rarityNames } from '@/content/gear';
import { itemById } from '@/content/lookup';
import type { GearDef, GearInstance } from '@/game/types';
import { tr } from '@/i18n';

import { AffixLines } from './AffixLines';
import { gearStatsParts } from './GearRow';
import { PartsLine } from './IconLabel';
import { Text } from './Text';
import { workToolParts } from './WorkToolLine';

type Props = {
  gear: GearInstance;
  /** List rows and pop-ups show smaller lines. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

/**
 * What a piece is, the same everywhere it is described: its own stats after
 * the roll, its work-tool line, its unique and each of its affixes.
 */
export function GearDetails({ gear, compact, style, labelStyle }: Props) {
  const item = itemById[gear.itemId] as GearDef;
  const stats = gearStatsParts(gear);
  const tool = workToolParts(item);
  const hasAffixes = gear.relicId !== undefined || gear.unique !== undefined || gear.affixes.length > 0;
  if (stats.length === 0 && tool.length === 0 && !hasAffixes) return null;
  return (
    <View style={[styles.details, style]}>
      {stats.length > 0 && <PartsLine parts={stats} sep="   " labelStyle={labelStyle} />}
      {tool.length > 0 && <PartsLine parts={tool} labelStyle={labelStyle} />}
      <AffixLines piece={gear} compact={compact} labelStyle={labelStyle} />
    </View>
  );
}

/** "Rare · Iron sword": the rarity in its colour, then the base item. */
export function GearSubtitle({ gear }: { gear: GearInstance }) {
  return (
    <>
      <Text style={{ color: gearRules.colors[gear.rarity] }}>{tr(rarityNames[gear.rarity])}</Text>
      {` · ${tr(itemById[gear.itemId].name)}`}
    </>
  );
}

const styles = StyleSheet.create({
  details: { gap: 4, alignItems: 'flex-start' },
});
