import type { ReactNode } from 'react';

import { elementInfo } from '@/content/elements';
import { qualities } from '@/content/forging';
import { componentById, gearName, itemById, relicById } from '@/content/lookup';
import { gearStats } from '@/game/forging/quality';
import { trinketEffect } from '@/game/loot/trinkets';
import { rollToScale } from '@/game/forging/roll';
import type { GearDef, GearInstance } from '@/game/types';
import { t, tr } from '@/i18n';

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
export function trinketText(gear: GearInstance) {
  const effect = trinketEffect(itemById[gear.itemId] as GearDef, gear.quality);
  return STATS.filter((key) => effect.stats[key])
    .map((key) => `${statIcons[key]} ${effect.stats[key]}`)
    .concat(effect.elementResist ? [`${statIcons.resistance} ${elementInfo[effect.elementResist.element].emoji} +${effect.elementResist.amount}`] : [])
    .concat(effect.approach ? [`+1 ● ${t(`threats.approach.${effect.approach}`)}`] : [])
    .join(' · ');
}

/** "⚔️ 14 · ❤️ 30 · roll 6/7": a piece's stats after its quality and roll. */
export function gearStatsText(gear: GearInstance) {
  const item = itemById[gear.itemId];
  if (item.slot === 'trinket') return trinketText(gear);
  if (item.slot !== 'weapon' && item.slot !== 'armor') return '';
  const stats = gearStats(item, gear);
  return STATS.filter((key) => stats[key])
    .map((key) => `${statIcons[key]} ${Math.round(stats[key]!)}`)
    .concat([t('gear.roll', { roll: rollToScale(gear.roll ?? 1), max: 7 })])
    .join(' · ');
}

/** "🏺 Pierce against constructs" or "🧩 Drake fang: Pierce": a restored relic's or a component's effect in one line. */
export function gearEffectText(gear: GearInstance) {
  if (gear.relicId) return `🏺 ${tr(relicById[gear.relicId].effect)}`;
  if (gear.component) return `${componentById[gear.component].emoji} ${tr(componentById[gear.component].name)}: ${tr(componentById[gear.component].adds)}`;
  return null;
}

type Props = { gear: GearInstance; note?: string | null; right?: ReactNode };

/** A gear piece in its quality colour, with its stats, element and an optional note. */
export function GearRow({ gear, note, right }: Props) {
  const item = itemById[gear.itemId];
  const subtitle = [
    gearStatsText(gear),
    gear.element ? `${elementInfo[gear.element].emoji} ${tr(elementInfo[gear.element].name)}` : null,
    gearEffectText(gear),
    note,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Row
      emoji={item.emoji}
      icon={item.icon}
      title={gearName(gear)}
      titleColor={qualities[gear.quality].color}
      subtitle={subtitle}
      right={right}
    />
  );
}
