import { Modal, StyleSheet, View } from 'react-native';

import { qualities } from '@/content/forging';
import { gearName, materialById } from '@/content/lookup';
import { salvageDialog, type SalvageWarning } from '@/game/forging/salvage';
import type { SaveData } from '@/game/save';
import type { GearInstance } from '@/game/types';
import { t, tr, type TextKey } from '@/i18n';
import { colors } from '@/theme';

import { Button } from './Button';
import { Panel } from './Panel';
import { Text } from './Text';

const warningKey: Record<SalvageWarning, TextKey> = {
  equipped: 'inventory.salvageWarning.equipped',
  rareOrBetter: 'inventory.salvageWarning.rareOrBetter',
  relic: 'inventory.salvageWarning.relic',
  component: 'inventory.salvageWarning.component',
  infused: 'inventory.salvageWarning.infused',
};

type Props = {
  gear: GearInstance;
  save: SaveData;
  onConfirm: () => void;
  onClose: () => void;
};

/** Asks before a piece is destroyed: its name, quality, what comes back, and why to think twice. */
export function SalvageDialog({ gear, save, onConfirm, onClose }: Props) {
  const dialog = salvageDialog(save, gear);
  const returns = dialog.returns.materials
    .map(({ materialId, amount }) => `${amount} ${tr(materialById[materialId].name).toLowerCase()}`)
    .concat(dialog.returns.gold > 0 ? [`🪙 ${dialog.returns.gold}`] : [])
    .join(', ');

  return (
    <Modal transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Panel style={styles.dialog}>
          <Text style={styles.title}>{t('inventory.salvageTitle', { item: gearName(gear) })}</Text>
          <Text style={[styles.quality, { color: qualities[dialog.quality].color }]}>{tr(qualities[dialog.quality].name)}</Text>
          <Text>{t('inventory.salvageBody', { returns: returns })}</Text>
          {dialog.warnings.map((warning) => (
            <View key={warning} style={styles.warning}>
              <Text style={styles.warningText}>⚠️ {t(warningKey[warning])}</Text>
            </View>
          ))}
          <View style={styles.actions}>
            <Button title={t('common.cancel')} color={colors.muted} onPress={onClose} />
            <Button title={t('inventory.salvage')} onPress={onConfirm} />
          </View>
        </Panel>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
  dialog: { gap: 10, padding: 14 },
  title: { fontSize: 24 },
  quality: { fontSize: 16, textTransform: 'uppercase' },
  warning: { padding: 8, borderWidth: 2, borderColor: colors.danger, backgroundColor: colors.parchmentDark },
  warningText: { color: colors.danger },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
});
