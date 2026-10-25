import { dungeons as allDungeons, expeditionRules } from '@/content/dungeons';
import { dungeonById, itemById, materialById, recipeById, recipeOutput } from '@/content/lookup';
import { tutorialRules } from '@/content/tutorial';

import { unlockRecipe } from '../crafting/crafting';
import { createRng } from '../generation/rng';
import { addMaterials } from '../inventory';
import { rollLoot } from '../rewards/loot';
import { grantMainRewards, type MainRewardOptions } from '../rewards/mainRewards';
import type { SaveData } from '../save';
import { addXp, isOnExpedition } from '../team/team';
import { isTutorialExpedition } from '../tutorial/tutorial';
import type { ActiveExpedition, DungeonDef, ExpeditionReport } from '../types';
import { buildLog, type LogInput } from './log';
import { prepareParty, simulateRun, type ExpeditionRules, type PartyMember } from './simulate';

/** Tier 1 is open from the start; tier N opens once a tier N-1 boss has been beaten. */
export function isDungeonUnlocked(save: SaveData, dungeon: DungeonDef, dungeons: DungeonDef[] = allDungeons) {
  if (dungeon.tier <= 1) return true;
  return dungeons.some((d) => d.tier === dungeon.tier - 1 && d.isBoss && save.clearedDungeons.includes(d.id));
}

/** Whether the player can send a party there now: unlocked, and the tutorial's dungeon during the tutorial. */
export function isDungeonAvailable(save: SaveData, dungeon: DungeonDef) {
  if (isTutorialExpedition(save)) return dungeon.id === tutorialRules.firstExpedition.dungeonId;
  return isDungeonUnlocked(save, dungeon);
}

/** Minutes an expedition to this dungeon would take now; the tutorial's first one takes seconds. */
export function expeditionMinutes(save: SaveData, dungeon: DungeonDef) {
  return isTutorialExpedition(save) ? tutorialRules.firstExpedition.seconds / 60 : dungeon.durationMinutes;
}

export function startExpedition(
  save: SaveData,
  dungeonId: string,
  heroIds: string[],
  now: number,
  durationScale = 1,
): SaveData {
  const dungeon = dungeonById[dungeonId];
  if (!dungeon) throw new Error(`Unknown dungeon ${dungeonId}`);
  if (!isDungeonAvailable(save, dungeon)) throw new Error(`${dungeon.name} is not available`);
  if (heroIds.length === 0) throw new Error('Pick at least one hero');
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
    endsAt: now + expeditionMinutes(save, dungeon) * 60_000 * durationScale,
    seed: `${id}:${now}`,
    guaranteed: isTutorialExpedition(save),
    notificationId: null,
  };
  return { ...save, expeditions: [...save.expeditions, expedition], nextUid: save.nextUid + 1 };
}

/**
 * Runs the expedition and applies it: gold, loot and XP for the share of
 * encounters cleared, boss-only recipe drops, gear wear, consumables and a report.
 */
export function resolveExpedition(
  save: SaveData,
  expedition: ActiveExpedition,
  { rules = expeditionRules, mainReward }: { rules?: ExpeditionRules; mainReward?: MainRewardOptions } = {},
): { save: SaveData; report: ExpeditionReport } {
  const dungeon = dungeonById[expedition.dungeonId];
  const party = prepareParty(save, expedition.heroIds);
  const run = simulateRun(party, dungeon, `${expedition.seed}|run`, { rules, guaranteed: expedition.guaranteed });
  // Separate streams so a change to the run doesn't reshuffle the rewards, and vice versa.
  const rng = createRng(expedition.seed);
  const success = run.bossDefeated;
  const progress = run.encountersCleared / run.encounterCount;

  let gold = Math.round(rng.int(dungeon.gold[0], dungeon.gold[1]) * progress) + run.bonusGold;
  let materials = rollLoot(rng, dungeon.loot)
    .map((stack) => ({ ...stack, amount: Math.floor(stack.amount * progress) }))
    .filter((stack) => stack.amount > 0);
  let recipeId: string | null = null;
  for (const drop of dungeon.recipeDrops) {
    const dropped = rng.chance(drop.chance);
    if (success && dropped && !recipeId && !save.knownRecipes.includes(drop.recipeId)) recipeId = drop.recipeId;
  }
  // The tutorial's first expedition pays a fixed reward instead.
  const tutorialReward = expedition.guaranteed ? tutorialRules.firstExpedition : null;
  if (tutorialReward) {
    gold = tutorialReward.gold;
    materials = tutorialReward.materials;
    recipeId = save.knownRecipes.includes(tutorialReward.recipeId) ? null : tutorialReward.recipeId;
  }
  const xp = Math.round(dungeon.xp * progress);

  const gearEvents: LogInput['gearEvents'] = [];
  const brokenUids = new Set<string>();
  let gear = save.gear;
  for (const hero of save.heroes.filter((h) => expedition.heroIds.includes(h.id))) {
    for (const slot of ['weapon', 'armor'] as const) {
      const piece = gear.find((g) => g.uid === hero.equipment[slot]);
      if (!piece) continue;
      const item = itemById[piece.itemId];
      if (item.slot !== 'weapon' && item.slot !== 'armor') continue;
      const loss = Math.round(rng.int(...dungeon.durabilityLoss) * (success ? 1 : rules.failureWearMultiplier));
      const durability = Math.max(0, piece.durability - loss);
      const threshold = item.maxDurability * rules.crackedThreshold;
      if (durability === 0) {
        brokenUids.add(piece.uid);
        gearEvents.push({ heroName: hero.name, gearName: item.name, kind: 'broken' });
      } else if (durability < threshold && piece.durability >= threshold) {
        gearEvents.push({ heroName: hero.name, gearName: item.name, kind: 'cracked' });
      }
      gear = gear.map((g) => (g.uid === piece.uid ? { ...g, durability } : g));
    }
  }

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
    const { weapon, armor } = hero.equipment;
    return addXp(
      {
        ...hero,
        equipment: {
          weapon: weapon && brokenUids.has(weapon) ? null : weapon,
          armor: armor && brokenUids.has(armor) ? null : armor,
          consumable: null,
        },
      },
      xp,
    );
  });

  let next: SaveData = {
    ...save,
    gold: save.gold + gold,
    materials: addMaterials(save.materials, materials),
    consumables,
    gear: gear.filter((g) => !brokenUids.has(g.uid)),
    heroes,
    expeditions: save.expeditions.filter((e) => e.id !== expedition.id),
    clearedDungeons:
      success && !save.clearedDungeons.includes(dungeon.id) ? [...save.clearedDungeons, dungeon.id] : save.clearedDungeons,
  };
  if (recipeId) next = unlockRecipe(next, recipeId);

  // Main rewards: only for successes, and not for the tutorial run, which has its own.
  let mainRewards: ExpeditionReport['mainRewards'] = [];
  if (success && !tutorialReward) {
    const granted = grantMainRewards(next, dungeon, createRng(`${expedition.seed}|main`), expedition.endsAt, mainReward);
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
      finds: tutorialReward ? tutorialReward.materials.map((m) => materialById[m.materialId].name) : [],
      mainRewards,
      gearEvents,
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
    brokenGear: save.gear.filter((g) => brokenUids.has(g.uid)).map((g) => g.itemId),
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
