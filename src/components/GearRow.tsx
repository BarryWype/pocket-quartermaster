import { elementInfo } from '@/content/elements';
import { componentById, itemById, relicById } from '@/content/lookup';
import { gearStats } from '@/game/forging/quality';
import { trinketEffect } from '@/game/loot/trinkets';
import { rollToScale } from '@/game/forging/roll';
import type { GearDef, GearInstance } from '@/game/types';
import { t, tr } from '@/i18n';

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
