import type { Ability } from '@/game/types';
import { formatNumber, formatPercent as percent, t, tr } from '@/i18n';

import { tagInfo } from './rotation';

/** Why a hero is good in a dungeon, for the "Good here" badge. */
export function abilityText(ability: Ability): string {
  switch (ability.kind) {
    case 'damageVsTag':
      return t('abilities.damageVsTag', { percent: percent(ability.multiplier - 1), tag: tr(tagInfo[ability.tag].name).toLowerCase() });
    case 'trapDisarm':
      return t('abilities.trapDisarm', { percent: percent(ability.chance) });
    case 'trapReduce':
      return t('abilities.trapReduce', { multiplier: formatNumber(ability.multiplier) });
    case 'obstacleSolve':
      return t('abilities.obstacleSolve', { kinds: ability.kinds.map((kind) => t(`abilities.obstacles.${kind}`)).join(t('common.and')) });
    case 'calmBeasts':
      return t('abilities.calmBeasts', { percent: percent(ability.chance) });
    case 'localsReaction':
      return t(`abilities.${ability.key}`);
    case 'partyHeal':
      return t('abilities.partyHeal', { percent: percent(ability.pct) });
    case 'protect':
      return t('abilities.protect', { percent: percent(ability.share) });
    case 'rage':
      return t('abilities.rage', { percent: percent(ability.multiplier - 1), below: percent(ability.belowPct) });
    case 'partyDamageBuff':
      return t('abilities.partyDamageBuff', { percent: percent(ability.multiplier - 1) });
    case 'critBonus':
      return t('abilities.critBonus', { percent: percent(ability.chance) });
    case 'cacheBonus':
      return t('abilities.cacheBonus', { multiplier: formatNumber(ability.multiplier) });
    case 'elementalAdvantage':
      return t('abilities.elementalAdvantage', { multiplier: formatNumber(ability.multiplier) });
    case 'statMultiplier':
      return t('abilities.statMultiplier', {
        sign: ability.multiplier >= 1 ? '+' : '−',
        percent: percent(Math.abs(ability.multiplier - 1)),
        stat: t(`abilities.stats.${ability.stat}`),
      });
    case 'goldMultiplier':
      return t('abilities.goldMultiplier', {
        sign: ability.multiplier >= 1 ? '+' : '−',
        percent: percent(Math.abs(ability.multiplier - 1)),
      });
    case 'xpMultiplier':
      return t('abilities.xpMultiplier', { percent: percent(ability.multiplier - 1) });
    case 'ambushAlert':
      return t('abilities.ambushAlert');
    case 'stewBoost':
      return t('abilities.stewBoost', { multiplier: formatNumber(ability.multiplier) });
    case 'damageTaken':
      return t('abilities.damageTaken', { percent: percent(1 - ability.multiplier) });
    case 'healRate':
      return t('abilities.healRate', {
        sign: ability.multiplier >= 1 ? '+' : '−',
        percent: percent(Math.abs(ability.multiplier - 1)),
      });
    case 'supplyNeed':
      return t('abilities.supplyNeed', { sign: ability.add >= 0 ? '+' : '−', count: Math.abs(ability.add) });
    case 'hungerResist':
      return t('abilities.hungerResist', { multiplier: formatNumber(ability.multiplier) });
    case 'trapTrigger':
      return t('abilities.trapTrigger');
    case 'potionThreshold':
      return t('abilities.potionThreshold');
    case 'hostileLocals':
      return t('abilities.hostileLocals');
  }
}
