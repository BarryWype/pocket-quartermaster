import { dungeons as allDungeons, expeditionRules } from '@/content/dungeons';
import { dungeonById, recipeById, recipeOutput } from '@/content/lookup';
import { modifierById } from '@/content/modifiers';
import { firstClearRules } from '@/content/rotation';
import { traitById } from '@/content/traits';
import { tutorialRules } from '@/content/tutorial';

import { forgedItem, unlockRecipe } from '../crafting/crafting';
import { masteryTypeOf } from '../forging/mastery';
import { guildBonus, partySize, sigilCap } from '../guild/guild';
import { modifierFor, openDungeonIds, withModifier, type Rotation } from '../dungeons/rotation';
import { createRng } from '../generation/rng';
import { addMaterials } from '../inventory';
import { rollLoot } from '../rewards/loot';
import { grantMainRewards, type MainRewardOptions } from '../rewards/mainRewards';
import type { SaveData } from '../save';
import { addXp, isOnExpedition } from '../team/team';
import { isTutorialExpedition } from '../tutorial/tutorial';
import type { ActiveExpedition, DungeonDef, ExpeditionReport } from '../types';
import { buildLog } from './log';
import { prepareParty, simulateRun, type ExpeditionRules, type PartyMember } from './simulate';

/** Tier 1 is open from the start; tier N opens once a tier N-1 boss has been beaten. */
export function isDungeonUnlocked(save: SaveData, dungeon: DungeonDef, dungeons: DungeonDef[] = allDungeons) {
  if (dungeon.tier <= 1) return true;
  return dungeons.some((d) => d.tier === dungeon.tier - 1 && d.isBoss && save.clearedDungeons.includes(d.id));
}

/**
 * Whether the player can send a party there now: unlocked and open in the
 * rotation (if given). The tutorial's dungeon stays open until the tutorial is
 * done, and is the only one for its first expedition.
 */
export function isDungeonAvailable(save: SaveData, dungeon: DungeonDef, rotation?: Rotation) {
  const tutorialDungeon = dungeon.id === tutorialRules.firstExpedition.dungeonId;
  if (isTutorialExpedition(save)) return tutorialDungeon;
  if (tutorialDungeon && save.tutorial.step !== 'done') return true;
  return isDungeonUnlocked(save, dungeon) && (!rotation || openDungeonIds(rotation).includes(dungeon.id));
}

/** Minutes an expedition to this dungeon would take now: Guild Hall time cuts apply; the tutorial's first one takes seconds. */
export function expeditionMinutes(save: SaveData, dungeon: DungeonDef) {
  if (isTutorialExpedition(save)) return tutorialRules.firstExpedition.seconds / 60;
  return dungeon.durationMinutes * (1 - guildBonus(save, 'fasterExpeditions'));
}

export function startExpedition(
  save: SaveData,
  dungeonId: string,
  heroIds: string[],
  now: number,
  durationScale = 1,
  /** Today's rotation: the dungeon must be open, and its modifier is kept for the run. */
  rotation?: Rotation,
): SaveData {
  const dungeon = dungeonById[dungeonId];
  if (!dungeon) throw new Error(`Unknown dungeon ${dungeonId}`);
  if (!isDungeonAvailable(save, dungeon, rotation)) throw new Error(`${dungeon.name} is not available`);
  if (heroIds.length === 0) throw new Error('Pick at least one hero');
  if (heroIds.length > partySize(save)) throw new Error(`At most ${partySize(save)} heroes per expedition`);
  for (const heroId of heroIds) {
    if (!save.heroes.some((h) => h.id === heroId)) throw new Error(`Unknown hero ${heroId}`);
    if (isOnExpedition(save, heroId)) throw new Error(`${heroId} is already away`);
  }

  const id = `x${save.nextUid}`;
  const expedition: ActiveExpedition = {
    id,
    dungeonId,
    heroIds,
    startedAt: now,
    // Whole seconds, so the notification and the timer agree.
    endsAt: now + Math.round(expeditionMinutes(save, dungeon) * 60 * durationScale) * 1000,
    seed: `${id}:${now}`,
    guaranteed: isTutorialExpedition(save),
    modifierId: rotation ? (modifierFor(rotation, dungeonId)?.id ?? null) : null,
    notificationId: null,
  };
  return { ...save, expeditions: [...save.expeditions, expedition], nextUid: save.nextUid + 1 };
}

/**
 * Runs the expedition and applies it: gold, loot and XP for the share of
 * encounters cleared, boss-only recipe drops, consumables and a report.
 */
export function resolveExpedition(
  save: SaveData,
  expedition: ActiveExpedition,
  { rules = expeditionRules, mainReward }: { rules?: ExpeditionRules; mainReward?: MainRewardOptions } = {},
): { save: SaveData; report: ExpeditionReport } {
  const dungeon = withModifier(dungeonById[expedition.dungeonId], expedition.modifierId ? modifierById[expedition.modifierId] : null);
  const party = prepareParty(save, expedition.heroIds);
  const run = simulateRun(party, dungeon, `${expedition.seed}|run`, { rules, guaranteed: expedition.guaranteed });
  // Separate streams so a change to the run doesn't reshuffle the rewards, and vice versa.
  const rng = createRng(expedition.seed);
  const success = run.bossDefeated;
  const progress = run.encountersCleared / run.encounterCount;
  // Calmed beasts let the party through but bring nothing back.
  // Better retreats (Guild Hall) raise what a failed run brings back, up to a full clear.
  const retreat = success ? 1 : 1 + guildBonus(save, 'betterRetreats');
  const lootShare = Math.min(1, ((run.encountersCleared - run.encountersCalmed) / run.encounterCount) * retreat);
  const multipliers = dungeon.rewardMultipliers ?? { gold: 1, materials: 1 };
  const guildGold = 1 + guildBonus(save, 'gold');

  // Thrifty and greedy heroes: each trait counts once per party, different ones combine.
  const traitGold = [...new Set(party.map((m) => m.traitId))]
    .flatMap((id) => traitById[id]?.effects ?? [])
    .reduce((product, e) => product * (e.kind === 'goldMultiplier' ? e.multiplier : 1), 1);
  let gold = Math.round(
    (rng.int(dungeon.gold[0], dungeon.gold[1]) * lootShare * multipliers.gold * guildGold + run.bonusGold) * traitGold,
  );
  let materials = rollLoot(rng, dungeon.loot)
    .map((stack) => ({ ...stack, amount: Math.floor(stack.amount * lootShare * multipliers.materials) }))
    .filter((stack) => stack.amount > 0);
  let recipeId: string | null = null;
  // Blueprints only drop for weapon types the player has met (by recruiting someone who uses them).
  const metType = (id: string) => {
    const item = forgedItem(recipeById[id]);
    return !item || masteryTypeOf(item) in save.mastery;
  };
  for (const drop of dungeon.recipeDrops) {
    const dropped = rng.chance(drop.chance);
    if (success && dropped && !recipeId && !save.knownRecipes.includes(drop.recipeId) && metType(drop.recipeId)) {
      recipeId = drop.recipeId;
    }
  }
  // The tutorial's first expedition pays a fixed reward instead.
  const tutorialReward = expedition.guaranteed ? tutorialRules.firstExpedition : null;
  if (tutorialReward) {
    gold = tutorialReward.gold;
    materials = [];
    recipeId = save.knownRecipes.includes(tutorialReward.recipeId) ? null : tutorialReward.recipeId;
  }
  const xp = Math.round(dungeon.xp * Math.min(1, progress * retreat));
  // The first win in each pool dungeon pays a one-time bonus.
  const firstClear =
    success && dungeon.slot && !tutorialReward && !save.firstClears.includes(dungeon.id)
      ? { gold: Math.round(dungeon.gold[1] * firstClearRules.goldShare), xp: Math.round(dungeon.xp * firstClearRules.xpShare) }
      : undefined;

  // Potions nobody needed go back to the stock; everything else is used up.
  const unusedPotion = (member: PartyMember) =>
    member.consumable?.when === 'lowHp' && !run.consumed.includes(member.heroId);
  const consumablesUsed = party.flatMap((m) => (m.consumable && !unusedPotion(m) ? [m.consumable.id] : []));
  const consumables = { ...save.consumables };
  for (const member of party.filter(unusedPotion)) {
    const itemId = member.consumable!.id;
    consumables[itemId] = (consumables[itemId] ?? 0) + 1;
  }

  const heroes = save.heroes.map((hero) => {
    if (!expedition.heroIds.includes(hero.id)) return hero;
    const xpBonus = (traitById[hero.trait]?.effects ?? []).reduce((m, e) => m * (e.kind === 'xpMultiplier' ? e.multiplier : 1), 1);
    return addXp(
      { ...hero, equipment: { ...hero.equipment, consumable: null } },
      Math.round((xp + (firstClear?.xp ?? 0)) * xpBonus * (1 + guildBonus(save, 'heroXp'))),
    );
  });

  // The first win against each tier boss earns a Guild Hall charter.
  const charter = success && !!dungeon.isBoss && !save.clearedDungeons.includes(dungeon.id);
  let next: SaveData = {
    ...save,
    charters: save.charters + (charter ? 1 : 0),
    gold: save.gold + gold + (firstClear?.gold ?? 0),
    materials: addMaterials(save.materials, materials),
    consumables,
    heroes,
    firstClears: firstClear ? [...save.firstClears, dungeon.id] : save.firstClears,
    expeditions: save.expeditions.filter((e) => e.id !== expedition.id),
    clearedDungeons:
      success && !save.clearedDungeons.includes(dungeon.id) ? [...save.clearedDungeons, dungeon.id] : save.clearedDungeons,
  };
  if (recipeId) next = unlockRecipe(next, recipeId);

  // Main rewards: only for successes. The tutorial run always brings back a Sigil.
  let mainRewards: ExpeditionReport['mainRewards'] = [];
  if (tutorialReward) {
    if (next.sigils.length < sigilCap(next)) {
      next = { ...next, sigils: [...next.sigils, tutorialReward.sigilTier] };
      mainRewards = [{ kind: 'sigil', tier: tutorialReward.sigilTier }];
    }
  } else if (success) {
    const granted = grantMainRewards(next, dungeon, createRng(`${expedition.seed}|main`), expedition.endsAt, {
      ...mainReward,
      goldMultiplier: guildGold,
      chanceMultiplier: 1 + guildBonus(save, 'mainRewards'),
    });
    next = granted.save;
    mainRewards = granted.rewards;
  }

  const log = buildLog(
    {
      dungeon,
      party,
      run,
      gold,
      recipeItemName: recipeId ? recipeOutput(recipeById[recipeId]).name : null,
      mainRewards,
      firstClear,
      charter,
    },
    createRng(`${expedition.seed}|log`),
  );

  const report: ExpeditionReport = {
    id: expedition.id,
    dungeonId: dungeon.id,
    heroIds: expedition.heroIds,
    finishedAt: expedition.endsAt,
    outcome: run.outcome,
    success,
    encountersCleared: run.encountersCleared,
    encounterCount: run.encounterCount,
    heroHp: run.hp,
    mainRewards,
    gold,
    materials,
    recipeId,
    xp,
    consumablesUsed,
    firstClear,
    charter: charter || undefined,
    log,
    seen: false,
  };

  return { save: { ...next, reports: [report, ...save.reports].slice(0, rules.reportsKept) }, report };
}

/** Resolves every expedition whose timer has ended, oldest first. */
export function resolveDue(
  save: SaveData,
  now: number,
  mainReward?: MainRewardOptions,
): { save: SaveData; reports: ExpeditionReport[] } {
  const due = save.expeditions.filter((e) => e.endsAt <= now).sort((a, b) => a.endsAt - b.endsAt);
  return due.reduce<{ save: SaveData; reports: ExpeditionReport[] }>(
    (acc, expedition) => {
      const { save: next, report } = resolveExpedition(acc.save, expedition, { mainReward });
      return { save: next, reports: [...acc.reports, report] };
    },
    { save, reports: [] },
  );
}

/** Moves every running expedition's end time to now (debug). */
export function fastForward(save: SaveData, now: number): SaveData {
  return { ...save, expeditions: save.expeditions.map((e) => ({ ...e, endsAt: Math.min(e.endsAt, now) })) };
}
