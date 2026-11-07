import { elementInfo } from '@/content/elements';
import { itemById } from '@/content/lookup';
import { gearStats } from '@/game/gear/stats';
import { trinketEffect } from '@/game/loot/trinkets';
import type { GearDef, GearInstance } from '@/game/types';

import type { LabelPart } from './IconLabel';

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

/** "🎯 6" or "🔰 🔥 +12": what a trinket gives after its roll. */
export function trinketParts(gear: GearInstance): LabelPart[] {
  const effect = trinketEffect(itemById[gear.itemId] as GearDef, gear);
  const statParts: LabelPart[] = STATS.filter((key) => effect.stats[key]).map((key) => ({ emoji: statIcons[key], text: String(effect.stats[key]) }));
  return statParts.concat(
    effect.elementResist
      ? [{ emoji: statIcons.resistance, after: elementInfo[effect.elementResist.element].emoji, text: `+${effect.elementResist.amount}` }]
      : [],
  );
}

/** "⚔️ 14 · ❤️ 30": a piece's stats after its roll. */
export function gearStatsParts(gear: GearInstance): LabelPart[] {
  const item = itemById[gear.itemId];
  if (item.slot === 'trinket') return trinketParts(gear);
  if (item.slot !== 'weapon' && item.slot !== 'armor' && item.slot !== 'offhand') return [];
  const stats = gearStats(gear);
  return STATS.filter((key) => stats[key]).map((key) => ({ emoji: statIcons[key], text: String(Math.round(stats[key]!)) }));
}
