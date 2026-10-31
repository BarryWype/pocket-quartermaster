import { StyleSheet, View } from 'react-native';

import { masteryTypeNames, qualities } from '@/content/forging';
import { componentById, itemById, materialById, relicById, valuableById } from '@/content/lookup';
import { forgeConfirmation, restoreConfirmation, type ConfirmCost, type CostLine } from '@/game/crafting/confirm';
import type { SaveData } from '@/game/save';
import { t, tr } from '@/i18n';
import { colors } from '@/theme';

import { Button } from './Button';
import { GameIcon } from './GameIcon';
import { GearMarks } from './GearMarks';
import { Overlay } from './Overlay';
import { Panel } from './Panel';
import { Text } from './Text';

/** What the forge asks before it happens: a forge (plain or with a component) or a relic restore. */
export type ForgePending =
  | { kind: 'forge'; recipeId: string; componentId: string | null }
  | { kind: 'restore'; relicUid: string };

/** One spent thing, e.g. "🪵 Wood ×4 · 6 held → 2 left". */
function CostLines({ cost }: { cost: ConfirmCost }) {
  const line = ({ id, needed, held, remaining }: CostLine, emoji: string, name: string) => (
    <View key={id} style={styles.costLine}>
      <GameIcon emoji={emoji} size={18} />
      <Text>{t('crafting.confirmLine', { name: tr(name), needed, held, remaining })}</Text>
    </View>
  );
  return (
    <View>
      {cost.materials.map(({ id, ...rest }) => line({ id, ...rest }, materialById[id].emoji, materialById[id].name))}
      {cost.valuables.map(({ id, ...rest }) => line({ id, ...rest }, valuableById[id].emoji, valuableById[id].name))}
    </View>
  );
}

/**
 * Asks before anything is forged: the piece with its tier and expected
 * quality, the full cost with what remains after, and the chosen component's
 * effect. The backdrop tap and the back button cancel and change nothing.
 */
export function ForgeConfirmDialog({
  save,
  pending,
  onConfirm,
  onClose,
}: {
  save: SaveData;
  pending: ForgePending;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const confirm =
    pending.kind === 'forge' ? forgeConfirmation(save, pending.recipeId, pending.componentId) : restoreConfirmation(save, pending.relicUid);
  if (!confirm) return null;
  const isRestore = confirm.kind === 'restore';
  const itemName = isRestore ? relicById[confirm.relicId].name : itemById[confirm.itemId].name;
  const effect = isRestore
    ? relicById[confirm.relicId].effect
    : confirm.componentId
      ? componentById[confirm.componentId].adds
      : null;

  return (
    <Overlay onClose={onClose}>
      <Panel style={styles.dialog}>
        <Text style={styles.title}>{t(isRestore ? 'crafting.restoreTitle' : 'crafting.confirmTitle', { item: tr(itemName) })}</Text>
        <View style={styles.headRow}>
          <GearMarks tier={confirm.tier} />
          <Text style={styles.type}>{tr(masteryTypeNames[confirm.gearType].name)}</Text>
        </View>
        {!isRestore && (
          <Text style={[styles.quality, { color: qualities[confirm.expectedQuality].color }]}>
            {t('crafting.confirmQuality', { quality: tr(qualities[confirm.expectedQuality].name), level: confirm.masteryLevel })}
          </Text>
        )}
        {effect && <Text style={styles.mastery}>✦ {tr(effect)}</Text>}
        <Text style={styles.mastery}>{t('crafting.confirmCost')}</Text>
        <CostLines cost={confirm.cost} />
        <View style={styles.actions}>
          <Button title={t('common.cancel')} color={colors.muted} onPress={onClose} />
          <Button title={t(isRestore ? 'crafting.restore' : 'crafting.forge')} onPress={onConfirm} />
        </View>
      </Panel>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  dialog: { gap: 10, padding: 14 },
  title: { fontSize: 24 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  type: { fontSize: 18, color: colors.ink },
  quality: { fontSize: 16 },
  mastery: { fontSize: 16, color: colors.muted },
  costLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
});
