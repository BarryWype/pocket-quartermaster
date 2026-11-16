import { supplyRules } from '@/content/supplyLines';

import { windowIndex } from '../generation/time';

/** The richness period a time falls in: richness rerolls when it changes. */
export const periodAt = (now: number): number => windowIndex(now, supplyRules.periodWeeks * 7 * 24 * 60);
