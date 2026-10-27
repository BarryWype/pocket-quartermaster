import { Modal, StyleSheet, View } from 'react-native';

import { heroClasses } from '@/content/heroes';
import { bossBonusAvailable } from '@/game/expeditions/expeditions';
import { oddsBand, type OddsBand } from '@/game/expeditions/odds';
import { partySize } from '@/game/guild/guild';
import type { SaveData } from '@/game/save';
import { isOnExpedition } from '@/game/team/team';
import type { DungeonDef } from '@/game/types';
import { formatDuration, formatPercent, t, tr } from '@/i18n';
import { colors } from '@/theme';

import { Button } from './Button';
import { Panel } from './Panel';
import { Text } from './Text';

type Props = {
  save: SaveData;
  dungeon: DungeonDef;
  party: string[];
  /** 0–1, from the simulated runs. */
  chance: number;
  durationMs: number;
  now: number;
  onConfirm: () => void;
  onClose: () => void;
};

export const ODDS_COLORS: Record<OddsBand, string> = { Risky: colors.danger, Fair: colors.gold, Safe: colors.success };

/** Things worth a second look before the party leaves. */
function warningsFor({ save, dungeon, party, chance, durationMs, now }: Omit<Props, 'onConfirm' | 'onClose'>) {
  const heroes = save.heroes.filter((h) => party.includes(h.id));
  const without = (slot: 'weapon' | 'armor') =>
    heroes
      .filter((h) => !h.equipment[slot])
      .map((h) => h.name)
      .join(', ');
  const idle = save.heroes.filter((h) => !party.includes(h.id) && !isOnExpedition(save, h.id));
  return [
    oddsBand(chance) === 'Risky' ? t('expeditions.confirm.risky', { percent: formatPercent(chance) }) : null,
    party.length < partySize(save) && idle.length > 0
      ? t('expeditions.confirm.roomLeft', { count: idle.length, names: idle.map((h) => h.name).join(', ') })
      : null,
    without('weapon') ? t('expeditions.confirm.noWeapon', { names: without('weapon') }) : null,
    without('armor') ? t('expeditions.confirm.noArmor', { names: without('armor') }) : null,
    dungeon.isBoss && !bossBonusAvailable(save, dungeon.id, now + durationMs) ? t('expeditions.confirm.bonusClaimed') : null,
  ].filter((warning): warning is string => warning !== null);
}

/** Confirms sending the party, with a summary and any warnings. */
export function SendDialog({ onConfirm, onClose, ...props }: Props) {
  const { save, dungeon, party, chance, durationMs } = props;
  const warnings = warningsFor(props);
  const heroes = save.heroes.filter((h) => party.includes(h.id));
  const band = oddsBand(chance);

  return (
    <Modal transparent statusBarTranslucent navigationBarTranslucent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Panel style={styles.dialog}>
          <Text style={styles.title}>{t('expeditions.confirm.title', { dungeon: `${dungeon.emoji} ${tr(dungeon.name)}` })}</Text>
          <Text>{heroes.map((h) => `${heroClasses[h.classId].emoji} ${h.name}`).join('   ')}</Text>
          <Text style={styles.summary}>
            ⏳ {formatDuration(durationMs)} ·{' '}
            <Text style={{ color: ODDS_COLORS[band] }}>
              {formatPercent(chance)} {t(`odds.${band}`)}
            </Text>
          </Text>
          {warnings.map((warning) => (
            <View key={warning} style={styles.warning}>
              <Text style={styles.warningText}>⚠️ {warning}</Text>
            </View>
          ))}
          <View style={styles.actions}>
            <Button title={t('common.cancel')} color={colors.muted} onPress={onClose} />
            <Button title={t('expeditions.send')} onPress={onConfirm} />
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
  summary: { fontSize: 20 },
  warning: { padding: 8, borderWidth: 2, borderColor: colors.danger, backgroundColor: colors.parchmentDark },
  warningText: { color: colors.ink },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
});
