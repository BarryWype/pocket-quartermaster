import type { ReactNode } from 'react';

import { elementInfo } from '@/content/elements';
import { qualities } from '@/content/forging';
import { gearName, itemById } from '@/content/lookup';
import { gearStats } from '@/game/forging/quality';
import { rollToScale } from '@/game/forging/roll';
import type { GearInstance } from '@/game/types';
import { t, tr } from '@/i18n';

import { Row } from './Row';

export const statIcons = { attack: '⚔️', defense: '🛡️', magic: '✨', hp: '❤️' } as const;
export const STATS = Object.keys(statIcons) as (keyof typeof statIcons)[];

/** "⚔️ 14 · ❤️ 30 · roll 6/7": a piece's stats after its quality and roll. */
export function gearStatsText(gear: GearInstance) {
  const item = itemById[gear.itemId];
  if (item.slot !== 'weapon' && item.slot !== 'armor') return '';
  const stats = gearStats(item, gear);
  return STATS.filter((key) => stats[key])
    .map((key) => `${statIcons[key]} ${Math.round(stats[key]!)}`)
    .concat([t('gear.roll', { roll: rollToScale(gear.roll ?? 1), max: 7 })])
    .join(' · ');
}

type Props = { gear: GearInstance; note?: string | null; right?: ReactNode };

/** A gear piece in its quality colour, with its stats, element and an optional note. */
export function GearRow({ gear, note, right }: Props) {
  const item = itemById[gear.itemId];
  const subtitle = [
    gearStatsText(gear),
    gear.element ? `${elementInfo[gear.element].emoji} ${tr(elementInfo[gear.element].name)}` : null,
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
