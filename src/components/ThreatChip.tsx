import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { elementInfo } from '@/content/elements';
import { threatById } from '@/content/lookup';
import { t, tr } from '@/i18n';
import type { ThreatDisplay } from '@/game/threats/coverage';
import type { ActiveThreat, OpportunityDef, RestrictionDef } from '@/game/types';
import { colors, pixel } from '@/theme';

import { GameIcon } from './GameIcon';
import { Text } from './Text';

const stateColors: Record<ThreatDisplay, string> = {
  covered: colors.success,
  partial: colors.gold,
  uncovered: colors.danger,
};

type ChipProps = {
  emoji: string;
  title: string;
  label: string;
  state?: ThreatDisplay;
  onPress?: () => void;
  children?: ReactNode;
};

/** The shared chip frame: icon, short label, then the chip's own details. */
function Chip({ emoji, title, label, state, onPress, children }: ChipProps) {
  const body = (
    <View
      accessibilityLabel={label}
      style={[styles.chip, { borderColor: state ? stateColors[state] : colors.woodDark }]}
    >
      <GameIcon emoji={emoji} size={20} />
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {body}
    </Pressable>
  );
}

type ThreatChipProps = {
  threat: ActiveThreat;
  state?: ThreatDisplay;
  onPress?: () => void;
};

/** One threat of a briefing as a compact chip: icon, short name, level pips. */
export function ThreatChip({ threat, state, onPress }: ThreatChipProps) {
  const def = threatById[threat.id];
  const element = threat.id === 'element' && threat.element ? elementInfo[threat.element] : null;
  const name = tr(def.name);
  const pips = '●'.repeat(threat.level) + '○'.repeat(3 - threat.level);
  const label = [
    name,
    element ? tr(element.name) : null,
    threat.surge ? t(`threats.surge.${threat.surge}`) : null,
    t('threats.level', { level: threat.level }),
    state ? t(`threats.${state}`) : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <Chip emoji={def.emoji} title={element ? `${name} ${element.emoji}` : name} label={label} state={state} onPress={onPress}>
      {threat.surge && (
        <View style={styles.surge}>
          <Text style={styles.surgeText}>{t(`threats.surge.${threat.surge}`)}</Text>
        </View>
      )}
      <Text style={styles.pips}>{pips}</Text>
    </Chip>
  );
}

/** The briefing's opportunity as a small chip, its supply cost as a pill. */
export function OpportunityChip({ opportunity, onPress }: { opportunity: OpportunityDef; onPress?: () => void }) {
  const name = tr(opportunity.name);
  return (
    <Chip
      emoji={opportunity.emoji}
      title={name}
      label={[name, opportunity.cost ? t('threats.cost', { count: opportunity.cost.supply }) : null]
        .filter(Boolean)
        .join(', ')}
      onPress={onPress}
    >
      {opportunity.cost && (
        <View style={styles.pill}>
          <Text style={styles.pillText}>🍖 {opportunity.cost.supply}</Text>
        </View>
      )}
    </Chip>
  );
}

/** The briefing's restriction as a small chip. */
export function RestrictionChip({ restriction, onPress }: { restriction: RestrictionDef; onPress?: () => void }) {
  const name = tr(restriction.name);
  return <Chip emoji={restriction.emoji} title={name} label={name} onPress={onPress} />;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: pixel.outline,
    borderColor: colors.woodDark,
    borderTopColor: colors.ink,
    borderLeftColor: colors.ink,
    backgroundColor: colors.parchmentDark,
    alignSelf: 'flex-start',
  },
  title: { fontSize: 16, flexShrink: 1 },
  pips: { fontSize: 14, color: colors.muted },
  surge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: colors.danger,
    backgroundColor: colors.ink,
  },
  surgeText: { fontSize: 12, color: colors.highlight },
  pill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: colors.woodDark,
    backgroundColor: colors.wood,
  },
  pillText: { fontSize: 13, color: colors.parchment },
});
