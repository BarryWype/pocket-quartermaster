import { questRules } from '@/content/quests';
import { lootConfig } from '@/content/loot/config';
import { lootMatrix } from '@/content/loot/matrix';

import { highestUnlockedTier } from '../expeditions/expeditions';
import { createRng } from '../generation/rng';
import type { LatLng } from '../generation/types';
import { rollForSave } from '../loot/context';
import { grantLoot } from '../loot/grant';
import type { Loot, LootSourceId } from '../loot/types';
import type { SaveData } from '../save';
import { duplicateTipGold, grantTip, questTipSecret, type TipOutcome } from '../secrets/tips';
import { heroStats } from '../team/team';
import { freeRecruitOrGold, rollFreeRecruit, type RecruitOutcome } from '../taverns/freeRecruit';
import { questEvent } from './progress';
import type { Quest } from './types';

/** The loot matrix row each band pays from. */
export const QUEST_SOURCES: Record<Quest['band'], LootSourceId> = {
  short: 'questShort',
  medium: 'questMedium',
  long: 'questLong',
  secret: 'secretQuest',
};

/** The Luck a quest's rewards read: the luckiest heroes' total, as a party's would be. */
export function questLuck(save: SaveData): number {
  return save.heroes
    .map((hero) => heroStats(save, hero).luck)
    .sort((a, b) => b - a)
    .slice(0, questRules.luckHeroes)
    .reduce((sum, luck) => sum + luck, 0);
}

/** What a quest pays, fixed by its id and this save's seed: its band's row with the roster's Luck, no loot trinkets. */
export function questLoot(save: SaveData, quest: Quest, now?: number): Loot {
  return rollForSave(save, QUEST_SOURCES[quest.band], createRng(`quest-loot|${save.playerSeed}|${quest.id}`), { luck: questLuck(save) }, now);
}

export function claimProblem(save: SaveData, questId: string): 'gone' | 'notDone' | null {
  const quest = save.quests.list.find((q) => q.id === questId);
  if (!quest) return 'gone';
  return quest.doneAt === null ? 'notDone' : null;
}

/** Whether a done quest's band's Recruit mark rolls a free recruit for this quest, fixed by the save's seed. */
export function questRecruit(save: SaveData, quest: Quest): boolean {
  return createRng(`quest-recruit|${save.playerSeed}|${quest.id}`).chance(lootConfig.markChances[lootMatrix[QUEST_SOURCES[quest.band]].recruit]);
}

/** Pays a done quest and takes it off the list; a rolled recruit joins (or pays gold) on top of the loot. */
export function claimQuest(save: SaveData, questId: string, now: number): { save: SaveData; loot: Loot; recruit: RecruitOutcome | null } {
  const quest = save.quests.list.find((q) => q.id === questId);
  if (!quest || claimProblem(save, questId) !== null) throw new Error(`Cannot claim quest ${questId}`);
  const loot = questLoot(save, quest, now);
  let paid = grantLoot(save, [], loot, now, 'quest');
  let recruit: RecruitOutcome | null = null;
  if (questRecruit(save, quest)) {
    const offer = rollFreeRecruit(save, `quest-recruit|${save.playerSeed}|${quest.id}|who`, `quest:${quest.id}`, 'roll');
    const joined = freeRecruitOrGold(paid, offer, highestUnlockedTier(save));
    paid = joined.save;
    recruit = joined.outcome;
  }
  return { save: { ...paid, quests: { ...paid.quests, list: paid.quests.list.filter((q) => q.id !== questId) } }, loot, recruit };
}

/**
 * Reaching a secret quest's strange mark: the quest is done and tips off a
 * secret place within about 1 km of the mark, one with no active tip; with
 * all three tipped already, it pays duplicate-tip gold. `isNearWater` lets
 * the underwater dungeon be picked (the app passes it once map tiles load).
 */
export function reachMark(
  save: SaveData,
  questId: string,
  at: number,
  isNearWater?: (point: LatLng) => boolean,
): { save: SaveData; tip: TipOutcome | null } {
  const quest = save.quests.list.find((q) => q.id === questId);
  if (!quest?.target || quest.objective !== 'mark' || quest.doneAt !== null) return { save, tip: null };
  const reachedAt = quest.reachedAt ?? at;
  const done = questEvent(save, { kind: 'arrived', placeId: quest.target.placeId }, reachedAt);
  if (done === save) return { save, tip: null };
  const anchor = quest.target.position;
  const secret = questTipSecret(done, quest.id, anchor, reachedAt, isNearWater);
  if (!secret) {
    const gold = duplicateTipGold(done);
    return { save: { ...done, gold: done.gold + gold }, tip: { kind: 'gold', gold } };
  }
  const granted = grantTip(done, { source: 'quest', sourceId: quest.id, anchor, secret }, reachedAt);
  return { save: granted.save, tip: granted.outcome };
}
