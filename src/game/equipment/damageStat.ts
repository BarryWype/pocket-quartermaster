import { heroClasses } from '@/content/heroes';

import type { DamageStat, GearDef, HeroClassId } from '../types';

/**
 * The stat a gear piece's damage rolls with: the class's damage stat when the
 * piece says 'wielder' (flasks), else the piece's own stat.
 */
export function pieceDamageStat(item: Pick<GearDef, 'damageStat'>, classId: HeroClassId): DamageStat | undefined {
  if (item.damageStat === 'wielder') return heroClasses[classId].damageStat;
  return item.damageStat;
}
