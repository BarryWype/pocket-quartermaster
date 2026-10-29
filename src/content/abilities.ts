import type { Ability, HeroClassId } from '@/game/types';
import { formatNumber, formatPercent as percent, t, tr } from '@/i18n';

import { heroClasses } from './heroes';
import { opportunityById } from './lookup';
import { approachRules } from './threats';

import { tagInfo } from './rotation';

/** Why a hero is good in a dungeon, for the "Good here" badge. */
export function abilityText(ability: Ability): string {
  switch (ability.kind) {
    case 'damageVsTag':
      return t('abilities.damageVsTag', { percent: percent(ability.multiplier - 1), tag: tr(tagInfo[ability.tag].name).toLowerCase() });
    case 'trapReduce':
      return t('abilities.trapReduce', { multiplier: formatNumber(ability.multiplier) });
    case 'pickpocket':
      return t('abilities.pickpocket');
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
    case 'potionThreshold':
      return t('abilities.potionThreshold');
    // Trait approach and keyword effects are shown by the trait's description,
    // never by this ability list.
    case 'approach':
    case 'keyword':
    // Class signatures are shown by the class's signature line.
    case 'penaltyReduce':
    case 'keywordCount':
    case 'approachFor':
    case 'kitBonus':
    case 'fistsPierce':
    case 'carryKit':
    case 'potionSlot':
    case 'lowerThreat':
    case 'cancelRestriction':
    case 'opportunityBoost':
    case 'raiseAllies':
    case 'singleEnemyCrit':
    case 'fence':
    case 'mealBoost':
    case 'fightHeal':
    case 'ignoresRestrictions':
      return '';
  }
}

/** A class's signature in one line, its numbers read from the class's abilities. */
export function signatureText(classId: HeroClassId): string {
  const vars: Record<string, string | number> = {};
  for (const a of heroClasses[classId].abilities) {
    switch (a.kind) {
      case 'rage':
        Object.assign(vars, { rage: percent(a.multiplier - 1), below: percent(a.belowPct) });
        break;
      case 'protect':
        vars.protect = percent(a.share);
        break;
      case 'damageVsTag':
        vars.tagBonus = percent(a.multiplier - 1);
        break;
      case 'penaltyReduce':
        vars[a.penalty] = formatNumber(a.multiplier);
        break;
      case 'cacheBonus':
        vars.cache = formatNumber(a.multiplier);
        break;
      case 'elementalAdvantage':
        vars.advantage = formatNumber(a.multiplier);
        break;
      case 'partyHeal':
        vars.partyHeal = percent(a.pct);
        break;
      case 'opportunityBoost': {
        const reward = opportunityById[a.opportunity].reward;
        vars.boost = formatNumber(a.multiplier);
        if (reward.kind === 'goldMultiplier') vars.bounty = percent((reward.multiplier - 1) * a.multiplier);
        break;
      }
      case 'keywordCount':
        vars.count = a.count;
        break;
      case 'approachFor':
        if (a.add) vars.add = a.add;
        break;
      case 'singleEnemyCrit':
        vars.crit = formatNumber(a.multiplier);
        break;
      case 'fence':
        Object.assign(vars, { fenceMin: percent(a.shares[0]), fenceMax: percent(a.shares[2]) });
        break;
      case 'kitBonus':
        Object.assign(vars, { kit: approachRules.kitBonus + a.add, baseKit: approachRules.kitBonus });
        break;
      case 'mealBoost':
        vars.meal = formatNumber(a.multiplier);
        break;
      case 'fightHeal':
        vars.fightHeal = percent(a.pct);
        break;
      case 'critBonus':
        vars.critBonus = percent(a.chance);
        break;
    }
  }
  return t(`classes.signature.${classId}`, vars);
}
