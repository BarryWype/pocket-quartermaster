import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';

import { elementInfo } from '@/content/elements';
import { qualities } from '@/content/forging';
import { componentById, gearName, itemById, relicById } from '@/content/lookup';
import { gearStats } from '@/game/forging/quality';
import { trinketEffect } from '@/game/loot/trinkets';
import { rollToScale } from '@/game/forging/roll';
import type { GearDef, GearInstance } from '@/game/types';
import { t, tr } from '@/i18n';
import { colors } from '@/theme';

import { PartsLine, type LabelPart } from './IconLabel';
import { Row } from './Row';

export const statIcons = {
  power: '⚔️',
  armour: '🛡️',
  magic: '✨',
  hp: '❤️',
  resistance: '🔰',
  evasion: '💨',
  speed: '👟',
  crit: '🎯',
  luck: '🍀',
} as const;
export const STATS = Object.keys(statIcons) as (keyof typeof statIcons)[];

/** "🎯 6", "🔰 🔥 +12" or "+1 ● Might": what a trinket gives at its quality. */
export function trinketParts(gear: GearInstance): LabelPart[] {
  const effect = trinketEffect(itemById[gear.itemId] as GearDef, gear.quality);
  const statParts: LabelPart[] = STATS.filter((key) => effect.stats[key]).map((key) => ({ emoji: statIcons[key], text: String(effect.stats[key]) }));
  return statParts
    .concat(
      effect.elementResist
        ? [{ emoji: statIcons.resistance, after: elementInfo[effect.elementResist.element].emoji, text: `+${effect.elementResist.amount}` }]
        : [],
    )
    .concat(effect.approach ? [`+1 ● ${t(`threats.approach.${effect.approach}`)}`] : []);
}

/** "⚔️ 14 · ❤️ 30 · roll 6/7": a piece's stats after its quality and roll. */
export function gearStatsParts(gear: GearInstance): LabelPart[] {
  const item = itemById[gear.itemId];
  if (item.slot === 'trinket') return trinketParts(gear);
  if (item.slot !== 'weapon' && item.slot !== 'armor' && item.slot !== 'offhand') return [];
  const stats = gearStats(item, gear);
  const statParts: LabelPart[] = STATS.filter((key) => stats[key]).map((key) => ({ emoji: statIcons[key], text: String(Math.round(stats[key]!)) }));
  return statParts.concat([t('gear.roll', { roll: rollToScale(gear.roll ?? 1), max: 7 })]);
}

/** "🏺 Pierce against constructs" or "🧩 Drake fang: Pierce": a restored relic's or a component's effect in one line. */
export function gearEffectParts(gear: GearInstance): LabelPart[] {
  if (gear.relicId) return [{ emoji: '🏺', text: tr(relicById[gear.relicId].effect) }];
  if (gear.component) {
    const component = componentById[gear.component];
    return [{ emoji: component.emoji, text: `${tr(component.name)}: ${tr(component.adds)}` }];
  }
  return [];
}

type Props = { gear: GearInstance; note?: string | null; right?: ReactNode };

/** A gear piece in its quality colour, with its stats, element and an optional note. */
export function GearRow({ gear, note, right }: Props) {
  const item = itemById[gear.itemId];
  const parts: LabelPart[] = [
    ...gearStatsParts(gear),
    gear.element ? { emoji: elementInfo[gear.element].emoji, text: tr(elementInfo[gear.element].name) } : null,
    ...gearEffectParts(gear),
    note,
  ].filter((part): part is LabelPart => part !== null);
  return (
    <Row
      emoji={item.emoji}
      icon={item.icon}
      title={gearName(gear)}
      titleColor={qualities[gear.quality].color}
      subtitle={parts.length > 0 ? <PartsLine parts={parts} labelStyle={styles.subtitle} /> : undefined}
      right={right}
    />
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 17, color: colors.muted },
});
