import { StyleSheet, View } from 'react-native';

import { tagInfo } from '@/content/rotation';
import { systemIcons } from '@/content/systemIcons';
import { familyTags } from '@/game/enemies/tags';
import type { MobDef } from '@/game/types';
import { formatPercent, t, tr } from '@/i18n';
import { colors } from '@/theme';

import { GameIcon } from './GameIcon';
import { Text } from './Text';

type Props = { mob: MobDef; named?: boolean };

/** An enemy's family labels, its main family first, after its name unless `named` is false; then its natural armour. */
export function EnemyTags({ mob, named = true }: Props) {
  return (
    <View style={styles.row}>
      {named && <Text style={styles.name}>{tr(mob.name)}</Text>}
      {familyTags(mob).map((tag, i) => (
        // The emoji never shares the label's Text: the game font holds no emoji
        // glyphs, and a run mixing them measures wrong and clips the label.
        <View key={tag} style={[styles.label, i === 0 && styles.main]}>
          <GameIcon emoji={tagInfo[tag].emoji} icon={tagInfo[tag].icon} size={18} />
          <Text style={styles.labelText}>{tr(tagInfo[tag].name)}</Text>
        </View>
      ))}
      {mob.armour ? (
        <View style={[styles.label, styles.armour]}>
          <GameIcon emoji="🛡️" icon={systemIcons['🛡️']} size={18} />
          <Text style={styles.labelText}>{t('enemy.armour', { pct: formatPercent(mob.armour) })}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  name: { fontSize: 17, marginRight: 2 },
  label: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 2, borderColor: colors.woodLight, paddingHorizontal: 5 },
  main: { borderColor: colors.woodDark },
  armour: { borderColor: colors.ink },
  labelText: { fontSize: 14, color: colors.muted },
});
