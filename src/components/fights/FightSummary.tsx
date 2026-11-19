import { StyleSheet, View } from 'react-native';

import { lootMatrix } from '@/content/loot/matrix';
import { systemIcons } from '@/content/systemIcons';
import { LOOT_CATEGORIES, type LootCategory, type LootSourceId } from '@/game/loot/types';
import type { ActiveThreat, MobDef } from '@/game/types';
import { t, tr } from '@/i18n';
import { ui } from '@/theme';

import { Text } from '../Text';
import { ThreatChip } from '../ThreatChip';
import { ItemSlot } from '../ui';

const MINI = 30;

/** Each loot category's icon, for the drops row. */
const categoryEmoji: Record<LootCategory, string> = {
  gold: '🪙', // coin-ok: the gold drop's tile, no amount
  xp: '✨',
  materials: '🪵',
  shards: '💎',
  blueprints: '📜',
  gear: '⚔️',
  trinkets: '💍',
  trophies: '🏆',
  relics: '🏺',
  monsterParts: '🦴',
  consumables: '🧪',
  treasureMaps: '🗺️',
  manuals: '📖',
  keyFragments: '🗝️',
};

/**
 * What a source can drop, as small tiles from the loot matrix: always and
 * often drops plain, sometimes and rare ones faded. XP goes to the heroes and
 * isn't shown.
 */
export function DropTiles({ source }: { source: LootSourceId }) {
  const marks = lootMatrix[source].marks;
  const shown = LOOT_CATEGORIES.filter((category) => category !== 'xp' && marks[category] !== '—');
  return (
    <View style={styles.row} accessibilityLabel={t('fightSheet.dropsLabel', { list: shown.map((c) => t(`fightSheet.drops.${c}`)).join(', ') })}>
      <Text style={styles.label}>{t('fightSheet.drops.title')}</Text>
      {shown.map((category) => {
        const mark = marks[category];
        return (
          <ItemSlot
            key={category}
            state="ready"
            size={MINI}
            emoji={categoryEmoji[category]}
            icon={systemIcons[categoryEmoji[category]]}
            faded={mark === 'R' || mark === 'R/2' || mark === 'S'}
            accessibilityLabel={t(`fightSheet.drops.${category}`)}
          />
        );
      })}
    </View>
  );
}

type Props = { foes: MobDef[]; threats: ActiveThreat[]; source: LootSourceId; line?: string };

/** A fight's one-line summary: its foes, its threats with their level, and what it drops, as tiles. */
export function FightSummary({ foes, threats, source, line }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.line}>{line ?? t('fightSheet.foes', { count: foes.length, names: foes.map((mob) => tr(mob.name)).join(', ') })}</Text>
      {threats.length > 0 && (
        <View style={styles.row}>
          {threats.map((threat) => (
            <ThreatChip key={threat.id} threat={threat} />
          ))}
        </View>
      )}
      <DropTiles source={source} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  line: { fontSize: 19, color: ui.ink },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
  label: { fontSize: 15, color: ui.inkMuted, marginRight: 2 },
});
