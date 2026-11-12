import { classAffinities, gearProfiles, type Affinity } from '@/content/equipment';
import { heroClasses } from '@/content/heroes';

import type { ArmourType, HeroClassId, WeaponType } from '../types';
import { pieceDamageStat } from './damageStat';

/** The class's weapon of choice: its first favoured weapon type that rolls with the class's damage stat ('wielder' pieces roll with it). */
export const weaponTypeFor = (classId: HeroClassId): WeaponType | null => {
  const favoured = (Object.entries(classAffinities[classId]) as [WeaponType | ArmourType, Affinity][])
    .filter(([type, affinity]) => affinity === 'favoured' && gearProfiles[type]?.slot === 'weapon')
    .map(([type]) => type as WeaponType);
  return favoured.find((type) => pieceDamageStat(gearProfiles[type], classId) === heroClasses[classId].damageStat) ?? favoured[0] ?? null;
};
