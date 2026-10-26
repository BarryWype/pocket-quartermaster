import type { Ability } from '@/game/types';

import { tagInfo } from './rotation';

/** Why a hero is good in a dungeon, for the "Good here" badge. */
export function abilityText(ability: Ability): string {
  switch (ability.kind) {
    case 'damageVsTag':
      return `+${Math.round((ability.multiplier - 1) * 100)}% damage against ${tagInfo[ability.tag].name.toLowerCase()}`;
    case 'trapDisarm':
      return `Disarms traps (${Math.round(ability.chance * 100)}%)`;
    case 'trapReduce':
      return `Trap damage ×${ability.multiplier} for the party`;
    case 'obstacleSolve':
      return `Clears ${ability.kinds.join(' and ')} obstacles`;
    case 'calmBeasts':
      return `Calms beast fights (${Math.round(ability.chance * 100)}%)`;
    case 'localsReaction':
      return { charm: 'Charms locals into helping', provoke: 'Provokes locals into a fight', pickpocket: 'Picks locals’ pockets' }[
        ability.key
      ];
    case 'partyHeal':
      return `Heals the party ${Math.round(ability.pct * 100)}% after each encounter`;
    case 'protect':
      return `Takes ${Math.round(ability.share * 100)}% of the hits aimed at the most hurt ally`;
    case 'rage':
      return `+${Math.round((ability.multiplier - 1) * 100)}% damage below ${Math.round(ability.belowPct * 100)}% HP`;
    case 'partyDamageBuff':
      return `+${Math.round((ability.multiplier - 1) * 100)}% damage for the whole party`;
    case 'critBonus':
      return `+${Math.round(ability.chance * 100)}% critical hits`;
    case 'cacheBonus':
      return `×${ability.multiplier} gold from hidden caches`;
    case 'elementalAdvantage':
      return `×${ability.multiplier} elemental advantage with an infused weapon`;
    case 'statMultiplier':
      return `+${Math.round((ability.multiplier - 1) * 100)}% ${ability.stat}`;
    case 'goldMultiplier':
      return `${ability.multiplier >= 1 ? '+' : '−'}${Math.round(Math.abs(ability.multiplier - 1) * 100)}% gold`;
    case 'xpMultiplier':
      return `+${Math.round((ability.multiplier - 1) * 100)}% XP`;
    case 'ambushAlert':
      return 'Ambushes don’t strike first';
    case 'rationBoost':
      return `Rations heal ×${ability.multiplier}`;
    case 'trapTrigger':
      return 'Traps trigger more often';
    case 'potionThreshold':
      return 'Drinks potions early';
    case 'hostileLocals':
      return 'Locals turn hostile more often';
  }
}
