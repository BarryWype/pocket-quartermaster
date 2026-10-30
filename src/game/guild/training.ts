import { guildRules } from '@/content/guild';

import { highestUnlockedTier } from '../dungeons/unlock';
import type { SaveData } from '../save';
import { addXp, isAway } from '../team/team';
import { guildBonus } from './guild';

type Rules = typeof guildRules;

const HOUR = 3_600_000;

/**
 * Training (Guild Hall): heroes at home earn XP per hour since the last check,
 * at most `trainingMaxHours` per gap. Unused fractions of an hour carry over.
 * Nothing during the tutorial; heroes on an expedition don't train.
 */
export function applyTraining(save: SaveData, now: number, rules: Rules = guildRules): SaveData {
  const rate = guildBonus(save, 'training');
  if (save.trainedAt === null || rate === 0 || save.tutorial.step !== 'done') return { ...save, trainedAt: now };
  const elapsed = Math.min(Math.max(0, now - save.trainedAt), rules.trainingMaxHours * HOUR);
  const xp = Math.floor((rate * elapsed) / HOUR);
  if (xp === 0) return save;
  const used = (xp / rate) * HOUR;
  const playerTier = highestUnlockedTier(save);
  return {
    ...save,
    trainedAt: now - (elapsed - used),
    heroes: save.heroes.map((hero) => (isAway(save, hero.id) ? hero : addXp(hero, xp, playerTier))),
  };
}
