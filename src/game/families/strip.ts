import { familyRules } from '@/content/families';

// How family levels read: lit dots, and the tag count each level is reached at.

/** A family level as lit dots, "●●○" for level 2: levels are never shown as a number. */
export const levelMarks = (level: number): string => '●'.repeat(level) + '○'.repeat(3 - level);

/** The tag count a family level is reached at: 2, 4 or 6. */
export const tagsForLevel = (level: number): number => familyRules.levels[level - 1];
