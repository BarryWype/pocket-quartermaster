import { heroClasses } from '@/content/heroes';

import type { DamageStat, GearDef, HeroClassId, HeroRoll } from '../types';

/**
 * The stat a hero of the class rolls damage with: a Gambler's follows their
 * rolled third primary (Magic for Magic, Power for Power and HP); anyone else
 * the class's own.
 */
export function classDamageStat(classId: HeroClassId, roll?: HeroRoll): DamageStat {
  if (classId === 'gambler' && roll?.primary) return roll.primary === 'magic' ? 'magic' : 'power';
  return heroClasses[classId].damageStat;
}

/**
 * The stat a gear piece's damage rolls with: the hero's class damage stat when
 * the piece says 'wielder' (flasks), else the piece's own stat.
 */
export function pieceDamageStat(item: Pick<GearDef, 'damageStat'>, classId: HeroClassId, roll?: HeroRoll): DamageStat | undefined {
  if (item.damageStat === 'wielder') return classDamageStat(classId, roll);
  return item.damageStat;
}
