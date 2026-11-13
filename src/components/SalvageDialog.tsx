import { ScrollView, StyleSheet, View } from 'react-native';

import { gearRules, rarityNames } from '@/content/gear';
import { gearName, materialById } from '@/content/lookup';
import { salvageDialog, type SalvageWarning } from '@/game/forging/salvage';
import type { SaveData } from '@/game/save';
import type { GearInstance } from '@/game/types';
import { t, tr, type TextKey } from '@/i18n';
import { colors } from '@/theme';

import { Button } from './Button';
import { GearDetails } from './GearDetails';
import { Overlay } from './Overlay';
import { useSheetMaxHeight } from './Sheet';
import { Panel } from './Panel';
import { Price } from './Price';
import { Text } from './Text';
import { IconLabel } from './IconLabel';

const warningKey: Record<SalvageWarning, TextKey> = {
  named: 'inventory.salvageWarning.named',
  equipped: 'inventory.salvageWarning.equipped',
  rareOrBetter: 'inventory.salvageWarning.rareOrBetter',
  relic: 'inventory.salvageWarning.relic',
  affixes: 'inventory.salvageWarning.affixes',
};

type Props = {
  gear: GearInstance;
  save: SaveData;
  onConfirm: () => void;
  onClose: () => void;
};

/** Asks before a piece is destroyed: its name, rarity, what comes back, and why to think twice. */
export function SalvageDialog({ gear, save, onConfirm, onClose }: Props) {
  const dialog = salvageDialog(save, gear);
  const returns = dialog.returns.materials
    .map(({ materialId, amount }) => `${amount} ${tr(materialById[materialId].name).toLowerCase()}`)
    .join(', ');

  const maxHeight = useSheetMaxHeight();
  return (
    <Overlay onClose={onClose}>
      <Panel style={[styles.dialog, { maxHeight }]}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <Text style={styles.title}>{t('inventory.salvageTitle', { item: gearName(gear) })}</Text>
          <Text style={[styles.quality, { color: gearRules.colors[dialog.rarity] }]}>{tr(rarityNames[dialog.rarity])}</Text>
          <GearDetails gear={gear} />
          <View style={styles.returnsRow}>
            <Text>{t('inventory.salvageBody')}</Text>
            {returns ? <Text>{returns}</Text> : null}
            {dialog.returns.gold > 0 && <Price amount={dialog.returns.gold} />}
          </View>
          {dialog.warnings.map((warning) => (
            <View key={warning} style={styles.warning}>
              <IconLabel emoji="⚠️" label={t(warningKey[warning])} labelStyle={styles.warningText} />
            </View>
          ))}
        </ScrollView>
        <View style={styles.actions}>
          <Button title={t('common.cancel')} color={colors.muted} onPress={onClose} />
          <Button title={t('inventory.salvage')} onPress={onConfirm} />
        </View>
      </Panel>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  dialog: { gap: 10, padding: 14 },
  scroll: { flexShrink: 1 },
  content: { gap: 10 },
  title: { fontSize: 24 },
  quality: { fontSize: 16, textTransform: 'uppercase' },
  returnsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  warning: { padding: 8, borderWidth: 2, borderColor: colors.danger, backgroundColor: colors.parchmentDark },
  warningText: { color: colors.danger },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
});
