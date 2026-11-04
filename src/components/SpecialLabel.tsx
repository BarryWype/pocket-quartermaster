import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';

import { specials } from '@/content/specials';
import { isRareSpecial } from '@/game/team/specials';
import type { HeroClassId, SpecialId } from '@/game/types';
import { tr } from '@/i18n';
import { colors } from '@/theme';

import { Text } from './Text';
import { Tip } from './Tip';

type Props = {
  classId: HeroClassId;
  special: SpecialId;
  /** The compact form for pickers: name and rare marker only. */
  short?: boolean;
  labelStyle?: StyleProp<TextStyle>;
};

/** A hero's special by name, with a ✦ when it is the class's rare one; tapping shows what it does and when it fires. */
export function SpecialLabel({ classId, special, short = false, labelStyle }: Props) {
  const def = specials[special];
  const name = tr(def.name);
  return (
    <Tip title={name} text={tr(def.description)} accessibilityLabel={name}>
      <View style={styles.row}>
        <Text style={[short ? styles.short : styles.name, labelStyle]}>{name}</Text>
        {isRareSpecial(classId, special) && <Text style={[styles.rare, short && styles.rareShort]}>✦</Text>}
      </View>
    </Tip>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  name: { fontSize: 19 },
  short: { fontSize: 15 },
  rare: { fontSize: 17, color: colors.gold },
  rareShort: { fontSize: 13 },
});
