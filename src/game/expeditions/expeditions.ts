import { dungeons as allDungeons, expeditionRules, overnightQuestRules } from '@/content/dungeons';
import { xpRules } from '@/content/heroes';
import { dungeonById, itemById, recipeById, recipeOutput } from '@/content/lookup';
import { modifierById } from '@/content/modifiers';
import { mainRewardRules } from '@/content/mainRewards';
import { firstClearRules } from '@/content/rotation';
import { traitById } from '@/content/traits';
import { tutorialRules } from '@/content/tutorial';

import { forgedItem, unlockRecipe } from '../crafting/crafting';
import { masteryTypeOf } from '../forging/mastery';
import { guildBonus, partySize, sigilCap } from '../guild/guild';
import { modifierFor, openDungeonIds, rotationDay, withModifier, type Rotation } from '../dungeons/rotation';
import { createRng } from '../generation/rng';
import { addMaterials } from '../inventory';
import { rollLoot } from '../rewards/loot';
import { grantMainRewards, type MainRewardOptions } from '../rewards/mainRewards';
import type { SaveData } from '../save';
import { applyRunHp, settleHp } from '../team/health';
import { addXp, canWield, heroAbilities, heroStats, isAway } from '../team/team';
import { isTutorialExpedition } from '../tutorial/tutorial';
import type { ActiveExpedition, DungeonDef, ExpeditionReport, Hunger, ProvisionDef } from '../types';
import { buildLog } from './log';
import { heroSupplyNeed, hungerFor, pickSupply, supplyHeld, type SupplyPick } from './provisions';
import { prepareParty, simulateRun, type ExpeditionRules, type PartyMember, type RunProvisions } from './simulate';

/** Tier 1 is open from the start; tier N opens once a tier N-1 boss has been beaten. */
export function isDungeonUnlocked(save: SaveData, dungeon: DungeonDef, dungeons: DungeonDef[] = allDungeons) {
  if (dungeon.tier <= 1) return true;
  return dungeons.some((d) => d.tier === dungeon.tier - 1 && d.isBoss && save.clearedDungeons.includes(d.id));
}

/** The highest dungeon tier the player can reach. */
export const highestUnlockedTier = (save: SaveData, dungeons: DungeonDef[] = allDungeons) =>
  Math.max(...dungeons.filter((d) => isDungeonUnlocked(save, d, dungeons)).map((d) => d.tier));

/**
 * Whether the player can send a party there now: unlocked and open in the
 * rotation (if given). The tutorial's dungeon stays open until the tutorial is
 * done, and is the only one for its first expedition.
 */
export function isDungeonAvailable(save: SaveData, dungeon: DungeonDef, rotation?: Rotation) {
  const tutorialDungeon = dungeon.id === tutorialRules.firstExpedition.dungeonId;
  if (isTutorialExpedition(save)) return tutorialDungeon;
  if (tutorialDungeon && save.tutorial.step !== 'done') return true;
  // Overnight quests are open every day; they only follow their tier's unlock.
  if (dungeon.overnight) return isDungeonUnlocked(save, dungeon);
  return isDungeonUnlocked(save, dungeon) && (!rotation || openDungeonIds(rotation).includes(dungeon.id));
}

/**
 * Whether a boss's daily bonus is still there today: its guaranteed main reward
 * and extra roll come with the first win each rotation day.
 */
export const bossBonusAvailable = (save: SaveData, dungeonId: string, now: number) =>
  save.bossBonusDays[dungeonId] !== rotationDay(now);

/**
 * The blueprint the day's first win in a pool dungeon would teach: one of its
 * unknown drops, preferring weapon types a roster hero can use, then armour.
 * Bosses are excluded (they have their own daily bonus); nothing when the
 * player knows them all.
 */
export function guaranteedBlueprint(save: SaveData, dungeon: DungeonDef): string | null {
  if (!dungeon.slot) return null;
  const learnable = (recipeId: string) => {
    const item = forgedItem(recipeById[recipeId]);
    return !item || masteryTypeOf(item) in save.mastery ? item : null;
  };
  let pick: string | null = null;
  let best = 3;
  for (const { recipeId } of dungeon.recipeDrops) {
    const item = learnable(recipeId);
    if (!item || save.knownRecipes.includes(recipeId)) continue;
    // Weapon types a roster hero can use, then armour, then the rest.
    const rank = item.slot === 'weapon' ? (save.heroes.some((h) => canWield(h, item)) ? 0 : 2) : 1;
    if (rank < best) {
      best = rank;
      pick = recipeId;
    }
  }
  return pick;
}

/** Whether the pool dungeon's guaranteed daily blueprint is still there today. */
export const blueprintBonusAvailable = (save: SaveData, dungeonId: string, now: number) =>
  save.blueprintBonusDays[dungeonId] !== rotationDay(now);

/** Minutes an expedition to this dungeon would take now: Guild Hall time cuts apply; the tutorial's first one takes seconds. */
export function expeditionMinutes(save: SaveData, dungeon: DungeonDef) {
  if (isTutorialExpedition(save)) return tutorialRules.firstExpedition.seconds / 60;
  return dungeon.durationMinutes * (1 - guildBonus(save, 'fasterExpeditions'));
}

/**
 * Minutes an overnight quest's supply is counted for: a patrol runs for hours
 * but is a safe, unhurried round, so it only costs `supplyHours` per hero.
 */
const supplyMinutes = (save: SaveData, dungeon: DungeonDef) =>
  dungeon.overnight ? overnightQuestRules.supplyHours * 60 : expeditionMinutes(save, dungeon);

/** The optional meal and kit for an expedition (provision item ids). */
export type Loadout = { mealId?: string | null; kitId?: string | null };

export type LaunchPlan = {
  /** Duration after the meal. */
  minutes: number;
  /** Supply points needed, held, and what would be taken. */
  need: number;
  held: number;
  supply: SupplyPick;
  hunger: Hunger;
};

const provision = (id: string | null | undefined) => {
  const item = id ? itemById[id] : null;
  return item?.slot === 'provision' ? (item as ProvisionDef) : null;
};

/** Supply and duration for sending these heroes with this loadout now. */
export function launchPlan(save: SaveData, dungeon: DungeonDef, heroIds: string[], loadout: Loadout = {}): LaunchPlan {
  const base = expeditionMinutes(save, dungeon);
  const need = save.heroes
    .filter((h) => heroIds.includes(h.id))
    .reduce((sum, hero) => sum + heroSupplyNeed(heroAbilities(hero), supplyMinutes(save, dungeon)), 0);
  const supply = pickSupply(save.consumables, need);
  const meal = provision(loadout.mealId)?.meal;
  return {
    minutes: base * (meal?.kind === 'duration' ? meal.multiplier : 1),
    need,
    held: supplyHeld(save.consumables),
    supply,
    hunger: hungerFor(supply.points, need),
  };
}

/** The run's provisions from what the party took: the odds preview and the real run use this. */
export const runProvisions = (hunger: Hunger, loadout: Loadout = {}): RunProvisions => ({
  hunger,
  meal: provision(loadout.mealId)?.meal ?? null,
  kit: provision(loadout.kitId)?.kit ?? null,
});

/** Whether a patrol is out right now: only one overnight quest runs at a time. */
export const overnightUnderWay = (save: SaveData) => save.expeditions.some((e) => dungeonById[e.dungeonId]?.overnight);

export function startExpedition(
  save: SaveData,
  dungeonId: string,
  heroIds: string[],
  now: number,
  durationScale = 1,
  /** Today's rotation: the dungeon must be open, and its modifier is kept for the run. */
  rotation?: Rotation,
  loadout: Loadout = {},
): SaveData {
  const dungeon = dungeonById[dungeonId];
  if (!dungeon) throw new Error(`Unknown dungeon ${dungeonId}`);
  if (!isDungeonAvailable(save, dungeon, rotation)) throw new Error(`${dungeon.name} is not available`);
  // Overnight quests are patrols: only one is out at a time.
  if (dungeon.overnight && overnightUnderWay(save)) throw new Error(`${dungeon.name} is already under way`);
  if (heroIds.length === 0) throw new Error('Pick at least one hero');
  if (heroIds.length > partySize(save)) throw new Error(`At most ${partySize(save)} heroes per expedition`);
  for (const heroId of heroIds) {
    if (!save.heroes.some((h) => h.id === heroId)) throw new Error(`Unknown hero ${heroId}`);
    if (isAway(save, heroId)) throw new Error(`${heroId} is already away`);
  }
  const consumables = { ...save.consumables };
  const take = (itemId: string, count: number) => {
    if ((consumables[itemId] ?? 0) < count) throw new Error(`No ${itemId} left`);
    consumables[itemId] -= count;
  };
  if (loadout.mealId) {
    if (!provision(loadout.mealId)?.meal) throw new Error(`${loadout.mealId} is not a meal`);
    take(loadout.mealId, 1);
  }
  if (loadout.kitId) {
    if (!provision(loadout.kitId)?.kit) throw new Error(`${loadout.kitId} is not a kit`);
    take(loadout.kitId, 1);
  }

  // Heroes set out with the HP they have now, and keep it until they come back.
  const settled = settleHp(save, now);
  const plan = launchPlan(settled, dungeon, heroIds, loadout);
  for (const [itemId, count] of Object.entries(plan.supply.items)) take(itemId, count);

  const id = `x${save.nextUid}`;
  const expedition: ActiveExpedition = {
    id,
    dungeonId,
    heroIds,
    startedAt: now,
    // Whole seconds, so the notification and the timer agree.
    endsAt: now + Math.round(plan.minutes * 60 * durationScale) * 1000,
    seed: `${id}:${now}`,
    guaranteed: isTutorialExpedition(save),
    modifierId: rotation ? (modifierFor(rotation, dungeonId)?.id ?? null) : null,
    hunger: plan.hunger,
    supplyUsed: plan.supply.points,
    mealId: loadout.mealId ?? null,
    kitId: loadout.kitId ?? null,
    notificationId: null,
  };
  return {
    ...settled,
    consumables,
    expeditions: [...save.expeditions, expedition],
    // The escort hero set out with the player instead: the background task stands down.
    escort: save.escort && heroIds.includes(save.escort.heroId) ? null : save.escort,
    nextUid: save.nextUid + 1,
  };
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
  const loadout = { mealId: expedition.mealId, kitId: expedition.kitId };
  const run = simulateRun(party, dungeon, `${expedition.seed}|run`, {
    rules,
    guaranteed: expedition.guaranteed,
    ...runProvisions(expedition.hunger ?? 'fed', loadout),
  });
  const meal = provision(expedition.mealId)?.meal;
  // Separate streams so a change to the run doesn't reshuffle the rewards, and vice versa.
  const rng = createRng(expedition.seed);
  const success = run.bossDefeated;
  const progress = run.encountersCleared / run.encounterCount;
  // Calmed beasts let the party through but bring nothing back.
  // Better retreats (Guild Hall) raise what a failed run brings back, up to a full clear.
  // Comfort broth adds to it.
  const retreat = success ? 1 : 1 + guildBonus(save, 'betterRetreats') + (meal?.kind === 'retreat' ? meal.bonus : 0);
  const lootShare = Math.min(1, ((run.encountersCleared - run.encountersCalmed) / run.encounterCount) * retreat);
  const multipliers = dungeon.rewardMultipliers ?? { gold: 1, materials: 1 };
  const guildGold = 1 + guildBonus(save, 'gold');

  // Thrifty and greedy heroes: each trait counts once per party, different ones combine.
  const traitGold = [...new Set(party.map((m) => m.traitId))]
    .flatMap((id) => traitById[id]?.effects ?? [])
    .reduce((product, e) => product * (e.kind === 'goldMultiplier' ? e.multiplier : 1), 1);
  // Merchant's pie, and one Lucky tooth for the party however many there are.
  const charmGold = Math.max(1, ...party.map((m) => (m.consumable?.charm?.kind === 'gold' ? m.consumable.charm.multiplier : 1)));
  const mealGold = meal?.kind === 'gold' ? meal.multiplier : 1;
  let gold = Math.round(
    (rng.int(dungeon.gold[0], dungeon.gold[1]) * lootShare * multipliers.gold + run.bonusGold) * guildGold * traitGold * charmGold * mealGold,
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
  // Dungeons below the highest unlocked tier teach less.
  const tierShare = xpRules.lowerTierShare[Math.min(xpRules.lowerTierShare.length - 1, highestUnlockedTier(save) - dungeon.tier)];
  const xp = Math.round(dungeon.xp * Math.min(1, progress * retreat) * tierShare);
  // The first win in each pool dungeon pays a one-time bonus.
  const firstClear =
    success && dungeon.slot && !tutorialReward && !save.firstClears.includes(dungeon.id)
      ? { gold: Math.round(dungeon.gold[1] * firstClearRules.goldShare), xp: Math.round(dungeon.xp * firstClearRules.xpShare * tierShare) }
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
  // A kit that never triggered comes back.
  if (expedition.kitId && !run.kitUsed) consumables[expedition.kitId] = (consumables[expedition.kitId] ?? 0) + 1;
  const mealXp = meal?.kind === 'xp' ? meal.multiplier : 1;

  const heroes = save.heroes.map((hero) => {
    if (!expedition.heroIds.includes(hero.id)) return hero;
    const xpBonus = (traitById[hero.trait]?.effects ?? []).reduce((m, e) => m * (e.kind === 'xpMultiplier' ? e.multiplier : 1), 1);
    return addXp(
      { ...hero, equipment: { ...hero.equipment, consumable: null } },
      Math.round((xp + (firstClear?.xp ?? 0)) * xpBonus * mealXp * (1 + guildBonus(save, 'heroXp'))),
    );
  });

  // The first win against each tier boss earns a Guild Hall charter.
  const charter = success && !!dungeon.isBoss && !save.clearedDungeons.includes(dungeon.id);
  // Later boss wins on the same rotation day roll a lower chance once.
  const dailyBonus = !dungeon.isBoss || bossBonusAvailable(save, dungeon.id, expedition.endsAt);
  const rewardDungeon = dailyBonus
    ? dungeon
    : { ...dungeon, mainRewardChance: mainRewardRules.repeatMainRewardChance, mainRewardExtraRollChance: 0 };
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
    bossBonusDays:
      success && dungeon.isBoss && dailyBonus ? { ...save.bossBonusDays, [dungeon.id]: rotationDay(expedition.endsAt) } : save.bossBonusDays,
  };
  if (recipeId) next = unlockRecipe(next, recipeId);
  // The first win in each pool dungeon on a rotation day teaches one of its
  // blueprints, on top of the normal rolls (see guaranteedBlueprint). The
  // player's known recipes are read after the normal drop, so it never repeats it.
  const dailyBlueprint =
    success && dungeon.slot && !tutorialReward && blueprintBonusAvailable(save, dungeon.id, expedition.endsAt)
      ? guaranteedBlueprint(next, dungeon)
      : null;
  if (dailyBlueprint) {
    next = {
      ...unlockRecipe(next, dailyBlueprint),
      blueprintBonusDays: { ...save.blueprintBonusDays, [dungeon.id]: rotationDay(expedition.endsAt) },
    };
  }
  // Heroes come back with the HP the run left them, as a share of their max after any level up.
  next = applyRunHp(
    next,
    run.hp.map((h) => {
      const hero = next.heroes.find((x) => x.id === h.heroId)!;
      const max = heroStats(next, hero).hp;
      return { heroId: h.heroId, hp: h.maxHp > 0 ? (h.hp / h.maxHp) * max : 0, maxHp: max };
    }),
    expedition.endsAt,
  );

  // Main rewards: only for successes. The tutorial run always brings back a Sigil.
  let mainRewards: ExpeditionReport['mainRewards'] = [];
  if (tutorialReward) {
    if (next.sigils.length < sigilCap(next)) {
      next = { ...next, sigils: [...next.sigils, tutorialReward.sigilTier] };
      mainRewards = [{ kind: 'sigil', tier: tutorialReward.sigilTier }];
    }
  } else if (success) {
    const granted = grantMainRewards(next, rewardDungeon, createRng(`${expedition.seed}|main`), expedition.endsAt, {
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
      hunger: expedition.hunger,
      kitId: expedition.kitId,
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
    heroHp: run.hp.map((h) => ({ ...h, before: Math.round(party.find((m) => m.heroId === h.heroId)?.hp ?? h.maxHp) })),
    hunger: expedition.hunger,
    supplyUsed: expedition.supplyUsed,
    mealId: expedition.mealId ?? null,
    kitId: expedition.kitId ?? null,
    kitUsed: run.kitUsed,
    mainRewards,
    gold,
    materials,
    recipeId,
    xp,
    consumablesUsed,
    firstClear,
    dailyBlueprint: dailyBlueprint ?? undefined,
    charter: charter || undefined,
    log,
    seen: false,
  };

  return { save: { ...next, reports: [report, ...save.reports].slice(0, rules.reportsKept) }, report };
}

/**
 * Expeditions whose timer has ended, oldest first. They wait, heroes still
 * away, until the player collects the loot (`resolveExpedition`).
 */
export const readyExpeditions = (save: SaveData, now: number) =>
  save.expeditions.filter((e) => e.endsAt <= now).sort((a, b) => a.endsAt - b.endsAt);

/** Moves every running expedition's end time to now (debug). */
export function fastForward(save: SaveData, now: number): SaveData {
  return { ...save, expeditions: save.expeditions.map((e) => ({ ...e, endsAt: Math.min(e.endsAt, now) })) };
}
