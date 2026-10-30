import { expeditionRules, overnightExpeditionRules, dungeons } from '@/content/dungeons';
import { newHero, xpRules } from '@/content/heroes';
import { dungeonById, itemById, opportunityById, recipeById, recipeOutput } from '@/content/lookup';
import { lootConfig } from '@/content/loot/config';
import { MATERIAL_TIERS } from '@/content/items';
import { heroNames, rosterRules } from '@/content/roster';
import { recipes } from '@/content/recipes';
import { narrowPartySize } from '@/content/threats';
import { traitById, traits } from '@/content/traits';
import { travellerRules } from '@/content/patrols';
import { tutorialRules } from '@/content/tutorial';

import { unlockRecipe } from '../crafting/crafting';
import { guildBonus, rosterCap } from '../guild/guild';
import { highestUnlockedTier, isDungeonUnlocked } from '../dungeons/unlock';
import { briefingFor, openDungeonIds, rotationDay, type Rotation } from '../dungeons/rotation';
import { createRng, type Rng } from '../generation/rng';
import { addMaterials } from '../inventory';
import { charmApplies, partyCharms } from '../loot/charms';
import { lootContextOf } from '../loot/context';
import { grantLoot } from '../loot/grant';
import { mergeLoot, rollSourceLoot } from '../loot/roll';
import { rollSigil, type SigilDrop } from '../loot/sigils';
import { emptyLoot, type Loot, type LootCategory, type LootSourceId } from '../loot/types';
import { secretPrize } from '../secrets/prize';
import { spendKey } from '../secrets/keys';
import type { SaveData } from '../save';
import { applyRunHp, settleHp } from '../team/health';
import { heroAbilities, heroStats, isAway } from '../team/team';
import { composeBriefing } from '../threats/compose';
import { heroAnswers } from '../threats/answers';
import { launchEffects } from '../threats/penalties';
import { salvage } from '../threats/salvage';
import { scoreBriefing } from '../threats/score';
import { partyMeal, penaltyReduction, signatureBriefing } from '../threats/signatures';
import { pickRecruitClass } from '../taverns/taverns';
import { isTutorialDungeon, isTutorialExpedition } from '../tutorial/tutorial';
import type { ActiveExpedition, Briefing, DungeonDef, ExpeditionReport, HeroState, Hunger, OpportunityOutcome, ProvisionDef } from '../types';
import { buildLog } from './log';
import { heroSupplyNeed, hungerFor, pickSupply, supplyHeld, type SupplyPick } from './provisions';
import {
  answersMemberOf,
  EMPTY_BRIEFING,
  prepareParty,
  simulateRun,
  type ExpeditionRules,
  type PartyMember,
  type RunOptions,
  type RunResult,
} from './simulate';

// Tier unlocks are shared with crafting (see dungeons/unlock.ts).
export { highestUnlockedTier, isDungeonUnlocked } from '../dungeons/unlock';

/**
 * Whether the player can send a party there now: unlocked and open in the
 * rotation (if given). During the tutorial only its own dungeon is, until the
 * tutorial is done.
 */
export function isDungeonAvailable(save: SaveData, dungeon: DungeonDef, rotation?: Rotation) {
  if (save.tutorial.step !== 'done') return isTutorialDungeon(dungeon.id);
  // Overnight expeditions are open every day; they only follow their tier's unlock.
  if (dungeon.overnight) return isDungeonUnlocked(save, dungeon);
  return isDungeonUnlocked(save, dungeon) && (!rotation || openDungeonIds(rotation).includes(dungeon.id));
}

/** Whether a win in this dungeon now would be the day's first (dungeons and tier bosses, never overnight expeditions). */
export const firstWinAvailable = (save: SaveData, dungeon: DungeonDef, now: number) =>
  !dungeon.overnight && save.firstWinDay !== rotationDay(now);

/** Minutes an expedition to this dungeon would take now: Guild Hall time cuts apply; the tutorial's takes seconds. */
export function expeditionMinutes(save: SaveData, dungeon: DungeonDef) {
  if (isTutorialExpedition(save)) return tutorialRules.seconds / 60;
  return dungeon.durationMinutes * (1 - guildBonus(save, 'fasterExpeditions'));
}

/**
 * Minutes an overnight expedition's supply is counted for: a patrol runs for hours
 * but is a safe, unhurried round, so it only costs `supplyHours` per hero.
 */
const supplyMinutes = (save: SaveData, dungeon: DungeonDef) =>
  dungeon.overnight ? overnightExpeditionRules.supplyHours * 60 : expeditionMinutes(save, dungeon);

/** The optional meal for an expedition (provision item id) and whether the party opts into the opportunity cost. */
export type Loadout = { mealId?: string | null; optIn?: boolean };

export type LaunchPlan = {
  /** Duration after the meal and the missed threats' delays. */
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

/** The meal's effect for this party, if any: none under Spoiled stores (unless a Cook cancels it), more with a Cook. */
export function mealOf(briefing: Briefing, mealId: string | null | undefined, party: PartyMember[]) {
  const signed = signatureBriefing(briefing, party.map(answersMemberOf)).briefing;
  return partyMeal(provision(mealId)?.meal, signed, party.map((member) => member.classId));
}

/** The briefing's scores against these heroes as equipped, after their signatures. */
const threatScores = (briefing: Briefing, party: PartyMember[]) => {
  const signed = signatureBriefing(briefing, party.map(answersMemberOf)).briefing;
  return scoreBriefing(signed, party.map((member) => heroAnswers(answersMemberOf(member), signed.restriction))).threats;
};

/**
 * Supply and duration for sending these heroes with this loadout now. The
 * briefing's missed threats stretch the time and add to the supply need, and
 * an opted-in opportunity costs its supply.
 */
export function launchPlan(
  save: SaveData,
  dungeon: DungeonDef,
  heroIds: string[],
  loadout: Loadout = {},
  briefing: Briefing = EMPTY_BRIEFING,
): LaunchPlan {
  const base = expeditionMinutes(save, dungeon);
  const party = prepareParty(save, heroIds);
  const effects = launchEffects(threatScores(briefing, party), undefined, penaltyReduction(party.map((m) => m.classId)));
  const opportunity = briefing.opportunity ? opportunityById[briefing.opportunity] : null;
  const need =
    save.heroes
      .filter((h) => heroIds.includes(h.id))
      .reduce((sum, hero) => sum + heroSupplyNeed(heroAbilities(hero), supplyMinutes(save, dungeon)), 0) +
    effects.extraSupply +
    (loadout.optIn ? opportunity?.cost?.supply ?? 0 : 0);
  const supply = pickSupply(save.consumables, need);
  const meal = mealOf(briefing, loadout.mealId, party);
  return {
    minutes: base * (meal?.kind === 'duration' ? meal.multiplier : 1) * effects.timeMultiplier,
    need,
    held: supplyHeld(save.consumables),
    supply,
    hunger: hungerFor(supply.points, need),
  };
}

/** The run's provisions from what the party took: the odds preview and the real run use this. */
export const runProvisions = (hunger: Hunger, loadout: Loadout = {}, briefing: Briefing = EMPTY_BRIEFING): RunOptions => ({
  hunger,
  meal: provision(loadout.mealId)?.meal ?? null,
  briefing,
  optIn: loadout.optIn ?? false,
  elixirs: true,
});

/** Whether a patrol is out right now: only one overnight expedition runs at a time. */
export const overnightUnderWay = (save: SaveData) => save.expeditions.some((e) => dungeonById[e.dungeonId]?.overnight);

/** The briefing an expedition sets out with: the rotation's, else the day's composed one; the tutorial's own while it runs. */
export function briefingOf(save: SaveData, dungeon: DungeonDef, rotation: Rotation | undefined, now: number): Briefing {
  if (isTutorialDungeon(dungeon.id) && save.tutorial.step !== 'done') return tutorialRules.briefing;
  return rotation ? briefingFor(rotation, dungeon) : composeBriefing(dungeon, rotationDay(now));
}

function expeditionBriefing(save: SaveData, dungeon: DungeonDef, rotation: Rotation | undefined, now: number): Briefing {
  return briefingOf(save, dungeon, rotation, now);
}

export function startExpedition(
  save: SaveData,
  dungeonId: string,
  heroIds: string[],
  now: number,
  durationScale = 1,
  /** Today's rotation: the dungeon must be open, and its briefing is kept for the run. */
  rotation?: Rotation,
  loadout: Loadout = {},
  /** A secret dungeon's own briefing. */
  briefing?: Briefing,
): SaveData {
  const dungeon = dungeonById[dungeonId];
  if (!dungeon) throw new Error(`Unknown dungeon ${dungeonId}`);
  // Secret dungeons launch from a tipped place, never through the rotation.
  if (dungeon.secret && !briefing) throw new Error(`${dungeon.name} is not available`);
  if (!dungeon.secret && !isDungeonAvailable(save, dungeon, rotation)) throw new Error(`${dungeon.name} is not available`);
  // Overnight expeditions are patrols: only one is out at a time.
  if (dungeon.overnight && overnightUnderWay(save)) throw new Error(`${dungeon.name} is already under way`);
  if (heroIds.length === 0) throw new Error('Pick at least one hero');
  if (heroIds.length > rosterRules.partySize) throw new Error(`At most ${rosterRules.partySize} heroes per expedition`);
  const run = briefing ?? expeditionBriefing(save, dungeon, rotation, now);
  // Narrow passages: one hero fewer than usual fits through, unless a Curse-breaker in the party lifts them.
  const restriction = signatureBriefing(run, prepareParty(save, heroIds).map(answersMemberOf)).briefing.restriction;
  if (restriction === 'narrowPassages' && heroIds.length > narrowPartySize(rosterRules.partySize)) {
    throw new Error(`At most ${narrowPartySize(rosterRules.partySize)} heroes fit the narrow passages`);
  }
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

  // Heroes set out with the HP they have now, and keep it until they come back.
  const settled = settleHp(save, now);
  const plan = launchPlan(settled, dungeon, heroIds, loadout, run);
  for (const [itemId, count] of Object.entries(plan.supply.items)) take(itemId, count);

  const id = `x${save.nextUid}`;
  // A chapel's blessing is spent by the next expedition; patrol fights leave it waiting.
  const blessed = save.expeditionBlessing;
  const expedition: ActiveExpedition = {
    id,
    dungeonId,
    heroIds,
    startedAt: now,
    // Whole seconds, so the notification and the timer agree.
    endsAt: now + Math.round(plan.minutes * 60 * durationScale) * 1000,
    seed: `${id}:${now}`,
    guaranteed: isTutorialExpedition(save),
    ...(blessed ? { blessed: true } : {}),
    briefing: run,
    optIn: loadout.optIn ?? false,
    hunger: plan.hunger,
    supplyUsed: plan.supply.points,
    mealId: loadout.mealId ?? null,
    notificationId: null,
  };
  let next: SaveData = {
    ...settled,
    consumables,
    expeditions: [...save.expeditions, expedition],
    expeditionBlessing: blessed ? false : save.expeditionBlessing,
    // The escort hero set out with the player instead: the background task stands down.
    escort: save.escort && heroIds.includes(save.escort.heroId) ? null : save.escort,
    nextUid: save.nextUid + 1,
  };
  // An opted-in Sealed vault costs its mysterious key at launch.
  if (loadout.optIn && run.opportunity && opportunityById[run.opportunity].cost?.key) next = spendKey(next);
  return next;
}

/** One unknown Provisions recipe, like a step chest teaches (Old inscriptions). */
function unknownProvisionRecipe(save: SaveData, rng: Rng): string | null {
  const unknown = recipes.filter((r) => r.station === 'provisions' && !save.knownRecipes.includes(r.id));
  return unknown.length > 0 ? unknown[rng.int(0, unknown.length - 1)].id : null;
}

/** A prisoner freed by the party joins the roster: a pool class for the tier, a positive trait, near the roster's middle level. */
function prisonerRecruit(save: SaveData, rng: Rng): HeroState {
  const classId = pickRecruitClass(rng, highestUnlockedTier(save));
  const positive = traits.filter((t) => t.positive);
  const levels = [...save.heroes.map((h) => h.level)].sort((a, b) => a - b);
  const median = levels.length % 2 ? levels[(levels.length - 1) / 2] : (levels[levels.length / 2 - 1] + levels[levels.length / 2]) / 2;
  const names = heroNames[classId];
  return newHero(
    `h${save.nextUid}`,
    names[rng.int(0, names.length - 1)],
    classId,
    positive[rng.int(0, positive.length - 1)].id,
    Math.max(1, Math.round(median)),
  );
}

/** The loot matrix row a dungeon's win rolls (the first win of the day and a new tier's first clear come on top). */
export const dungeonLootSource = (dungeon: DungeonDef): LootSourceId =>
  dungeon.isBoss ? 'tierBoss' : dungeon.overnight ? 'overnightExpedition' : 'dungeonRun';

/**
 * The tutorial expedition's loot: the day's first-win row, seeded apart from
 * everything else so the run and skipping give the same, whatever the party.
 */
export function tutorialLoot(save: SaveData, now: number): Loot {
  const dungeon = dungeonById[tutorialRules.dungeonId];
  const row = lootConfig.bonusRows.firstWin;
  return rollSourceLoot({
    source: 'firstWin',
    tier: dungeon.tier,
    minutes: dungeon.durationMinutes,
    luck: 0,
    modifiers: [],
    enemies: dungeon.encounters.flatMap((encounter) => (encounter.type === 'fight' ? encounter.mobs.map((m) => m.mobId) : [])),
    base: { gold: Math.round(dungeon.gold[1] * row.gold), xp: Math.round(dungeon.xp * row.xp) },
    context: lootContextOf(save),
    rng: createRng(tutorialRules.lootSeed),
  });
}

/** Pays the tutorial expedition's loot out to these heroes (a skip collects it without a run). */
export function grantTutorialLoot(save: SaveData, heroIds: string[], now: number): SaveData {
  return grantLoot(
    { ...save, firstWinDay: rotationDay(now), tutorial: { ...save.tutorial, rewarded: true } },
    heroIds,
    tutorialLoot(save, now),
    now,
  );
}

/**
 * The party's consumables that never triggered during the run, broken back
 * down (see threats/salvage.ts): potions nobody needed, kits that changed no
 * threat and never healed, salves whose element never came, elixirs and
 * weakness items never used.
 */
export function untriggeredSalvage(party: PartyMember[], run: RunResult, source: LootSourceId): ExpeditionReport['salvaged'] {
  const triggered = (member: PartyMember): boolean => {
    const item = member.consumable!;
    // A charm is spent by any run at a source where it can apply, won or lost.
    if (item.charm) return charmApplies(item.charm, source);
    if (item.when === 'lowHp') return run.consumed.includes(member.heroId);
    if (item.kit) {
      // A ward salve is a kit too: it also counts when its carrier took damage of its element.
      return (
        run.threats.some((t) => t.kitHeroes.includes(member.heroId)) ||
        run.opportunity?.kitHeroId === member.heroId ||
        run.carriedHealed.includes(member.heroId) ||
        (item.kit.heal !== undefined && run.consumed.includes(member.heroId)) ||
        (item.protectsAgainst !== undefined && (run.damageElements[member.heroId]?.includes(item.protectsAgainst) ?? false))
      );
    }
    if (item.protectsAgainst) {
      const element = run.threats.find((t) => t.threat.id === 'element');
      return (
        (element?.kitHeroes.includes(member.heroId) ?? false) ||
        (run.damageElements[member.heroId]?.includes(item.protectsAgainst) ?? false)
      );
    }
    const elixir = item.elixir;
    if (elixir) {
      // Stat, speed and crit elixirs are drunk before the run; an oil needs a weapon that struck; the rest need their trigger.
      if (elixir.kind === 'stat' || elixir.kind === 'speed' || elixir.kind === 'crit') return true;
      if (elixir.kind === 'oil') return member.weaponName !== null && run.attacked.includes(member.heroId);
      return run.elixirsUsed.includes(member.heroId);
    }
    return !!item.weakness && run.weaknessUsedBy === member.heroId;
  };
  return [
    ...party
      .filter((m) => m.consumable && !triggered(m))
      .map((m) => ({ heroId: m.heroId, itemId: m.consumable!.id, ...salvage(m.consumable!.id) })),
    // The Alchemist's second potion, if it was never drunk.
    ...party
      .filter((m) => m.potion && !run.potionsDrunk.includes(m.heroId))
      .map((m) => ({ heroId: m.heroId, itemId: m.potion!.id, ...salvage(m.potion!.id) })),
  ];
}

/**
 * Runs the expedition and applies it: gold, loot and XP for the share of
 * encounters cleared, boss-only recipe drops, consumables and a report. The
 * briefing's missed threats cut the loot, its opportunity pays out, and every
 * consumable is gone — the ones that never triggered are broken back down.
 */
export function resolveExpedition(
  save: SaveData,
  expedition: ActiveExpedition,
  { rules = expeditionRules, loot: lootOptions = {} }: { rules?: ExpeditionRules; loot?: { force?: LootCategory } } = {},
): { save: SaveData; report: ExpeditionReport } {
  const dungeon = dungeonById[expedition.dungeonId];
  const briefing = expedition.briefing ?? EMPTY_BRIEFING;
  const party = prepareParty(save, expedition.heroIds, 0, true);
  const luck = party.reduce((sum, m) => sum + m.luck, 0);
  const run = simulateRun(party, dungeon, `${expedition.seed}|run`, {
    rules,
    guaranteed: expedition.guaranteed,
    ...(expedition.blessed ? { blessed: true } : {}),
    ...runProvisions(expedition.hunger ?? 'fed', { mealId: expedition.mealId, optIn: expedition.optIn }, briefing),
  });
  const meal = run.meal;
  const barren = run.signed.briefing.restriction === 'barren';
  // Separate streams so a change to the run doesn't reshuffle the rewards, and vice versa.
  const rng = createRng(expedition.seed);
  const success = run.bossDefeated;
  const progress = run.encountersCleared / run.encounterCount;
  // Better retreats (Guild Hall) raise what a failed run brings back, up to a full clear.
  // Comfort broth adds to it, and so does the smoke bomb an escape was built on.
  const bomber = run.escaped
    ? party.find((m) => m.consumable?.elixir?.kind === 'smokeBomb' && run.elixirsUsed.includes(m.heroId))?.consumable?.elixir
    : undefined;
  const retreat = success ? 1 : 1 + guildBonus(save, 'betterRetreats') + (meal?.kind === 'retreat' ? meal.bonus : 0) + (bomber?.kind === 'smokeBomb' ? bomber.retreatBonus : 0);
  const lootShare = Math.min(1, (run.encountersCleared / run.encounterCount) * retreat);
  const guildGold = 1 + guildBonus(save, 'gold');
  // Barren leaves gold bonuses from traits, charms and meals out; the others only apply above 1.
  const cut = (multiplier: number) => (barren && multiplier > 1 ? 1 : multiplier);

  // Thrifty and greedy heroes: each trait counts once per party, different ones combine.
  const traitGold = cut(
    [...new Set(party.map((m) => m.traitId))]
      .flatMap((id) => traitById[id]?.effects ?? [])
      .reduce((product, e) => product * (e.kind === 'goldMultiplier' ? e.multiplier : 1), 1),
  );
  const mealGold = cut(meal?.kind === 'gold' ? meal.multiplier : 1);
  // Lost loot cuts the dungeon's rolled gold; the run's bonus gold is unaffected.
  const bounty = run.opportunity?.answered && run.opportunity.goldMultiplier ? run.opportunity.goldMultiplier : 1;
  const kept = 1 - run.lostLoot;
  const goldScale = guildGold * traitGold * mealGold;
  const baseGold = Math.round((rng.int(dungeon.gold[0], dungeon.gold[1]) * lootShare * kept * bounty + run.bonusGold) * goldScale);
  // The tutorial's first expedition pays the day's first-win row instead.
  const tutorialReward = expedition.guaranteed;
  // Dungeons below the highest unlocked tier teach less.
  const tierShare = xpRules.lowerTierShare[Math.min(xpRules.lowerTierShare.length - 1, highestUnlockedTier(save) - dungeon.tier)];
  const mealXp = meal?.kind === 'xp' ? meal.multiplier : 1;
  const xp = Math.round(
    dungeon.xp * Math.min(1, progress * retreat) * tierShare * (run.opportunity?.answered && run.opportunity.xpMultiplier ? run.opportunity.xpMultiplier : 1),
  );

  // A win rolls its row of the loot matrix, plus the day's first win (dungeons
  // and tier bosses, never overnight expeditions) and a new tier's first clear on top. A
  // loss keeps its share of gold and XP and rolls nothing. The tutorial run
  // pays the first-win row and counts as the day's first win.
  const firstWin =
    tutorialReward ||
    (success && !dungeon.overnight && !dungeon.secret && save.firstWinDay !== rotationDay(expedition.endsAt));
  const firstTierClear =
    !tutorialReward &&
    success &&
    !dungeon.secret &&
    !save.clearedDungeons.some((id) => dungeonById[id]?.tier === dungeon.tier);
  const context = lootContextOf(save);
  const enemies = run.encounters.flatMap((e) => e.mobs.map((m) => m.mobId));
  const source = dungeonLootSource(dungeon);
  // Barren runs take no gold bonus from charms.
  const modifiers = partyCharms(party).filter((mod) => !barren || mod.kind !== 'gold');
  const roll = (source: LootSourceId, base: { gold: number; xp: number }) =>
    rollSourceLoot({
      source,
      tier: dungeon.tier,
      minutes: dungeon.durationMinutes,
      luck,
      modifiers,
      enemies,
      base,
      context,
      rng: createRng(`${expedition.seed}|${source}`),
      ...(lootOptions.force ? { force: lootOptions.force } : {}),
    });
  const bonus = (row: keyof typeof lootConfig.bonusRows) => ({
    gold: Math.round(dungeon.gold[1] * lootConfig.bonusRows[row].gold * goldScale),
    xp: Math.round(dungeon.xp * lootConfig.bonusRows[row].xp * tierShare * mealXp),
  });
  let loot: Loot;
  if (tutorialReward) {
    loot = tutorialLoot(save, expedition.endsAt);
  } else if (success) {
    loot = roll(source, { gold: baseGold, xp: Math.round(xp * mealXp) });
    if (firstWin) loot = mergeLoot(loot, roll('firstWin', bonus('firstWin')));
    if (firstTierClear) loot = mergeLoot(loot, roll('firstTierClear', bonus('firstTierClear')));
  } else {
    loot = { ...emptyLoot(), gold: Math.round(baseGold * (1 + lootConfig.luck.goldPerPoint * luck)), xp: Math.round(xp * mealXp) };
  }

  // A secret dungeon's prize, or the Sealed vault's the party paid a key for: only a win claims either.
  const prize =
    success && (dungeon.secret || (briefing.opportunity === 'sealedVault' && expedition.optIn))
      ? secretPrize(dungeon.tier, createRng(`${expedition.seed}|prize`))
      : null;
  if (prize) loot = mergeLoot(loot, prize);

  // Everything in a consumable slot is gone after the run; what never triggered
  // is broken back down instead (see threats/salvage.ts).
  const salvaged = untriggeredSalvage(party, run, source);
  const consumablesUsed = party.flatMap((m) => [...(m.consumable ? [m.consumable.id] : []), ...(m.potion ? [m.potion.id] : [])]);
  const salvageGold = salvaged.reduce((sum, s) => sum + s.gold, 0);
  const salvageMaterials = salvaged.flatMap((s) => s.materials);

  const heroes = save.heroes.map((hero) =>
    expedition.heroIds.includes(hero.id)
      ? { ...hero, equipment: { ...hero.equipment, consumable: null, ...(hero.equipment.potion ? { potion: null } : {}) } }
      : hero,
  );

  let next: SaveData = grantLoot(
    {
      ...save,
      gold: save.gold + salvageGold,
      materials: addMaterials(save.materials, [...salvageMaterials, ...(run.opportunity?.materials ?? [])]),
      heroes,
      expeditions: save.expeditions.filter((e) => e.id !== expedition.id),
      clearedDungeons:
        success && !dungeon.secret && !save.clearedDungeons.includes(dungeon.id)
          ? [...save.clearedDungeons, dungeon.id]
          : save.clearedDungeons,
      firstWinDay: firstWin ? rotationDay(expedition.endsAt) : save.firstWinDay,
      tutorial: { ...save.tutorial, ...(tutorialReward ? { rewarded: true } : {}) },
    },
    expedition.heroIds,
    loot,
    expedition.endsAt,
  );
  // A tier boss teaches the pickaxe that opens the next tier.
  const pickaxe = success && dungeon.isBoss ? recipeById[`${MATERIAL_TIERS[dungeon.tier - 1].id}Pickaxe`] : undefined;
  if (pickaxe) next = unlockRecipe(next, pickaxe.id);
  // The opportunity's save-side rewards: a taught recipe, a prisoner recruit.
  const opportunityRecipe =
    run.opportunity?.answered && run.opportunity.recipe ? unknownProvisionRecipe(next, rng) : null;
  if (opportunityRecipe) next = unlockRecipe(next, opportunityRecipe);
  if (run.opportunity?.answered && run.opportunity.recruit && next.heroes.length < rosterCap(next)) {
    const recruit = prisonerRecruit(next, rng);
    next = { ...next, heroes: [...next.heroes, recruit], nextUid: next.nextUid + 1 };
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

  // The pilgrim's reward, once the party is home: gold, a key fragment, or a
  // blessing that rests every hero at home (the party included); heroes still
  // away keep what they have.
  if (run.opportunity?.answered && run.opportunity.pilgrim) {
    const pilgrim = run.opportunity.pilgrim;
    if (pilgrim === 'gold') {
      const short = dungeons.find((d) => d.tier === dungeon.tier && d.slot === 'short')!;
      next = { ...next, gold: next.gold + Math.round(((short.gold[0] + short.gold[1]) / 2) * travellerRules.goldShareOfShort) };
    } else if (pilgrim === 'keyFragment') {
      next = { ...next, keyFragments: next.keyFragments + 1 };
    } else {
      next = {
        ...next,
        heroes: next.heroes.map((hero) =>
          isAway(next, hero.id) ? hero : (({ hp: _hp, hpAt: _at, exhaustedUntil: _ex, ...rest }) => rest)(hero),
        ),
      };
    }
  }

  // Sigils: only for wins. The tutorial run brings none.
  let sigil: SigilDrop = {};
  if (!tutorialReward && success) {
    const rolled = rollSigil(next, dungeon, createRng(`${expedition.seed}|sigil`));
    next = rolled.save;
    sigil = rolled.drop;
  }

  const opportunity: OpportunityOutcome | null = run.opportunity
    ? (({ kitHeroId: _kit, ...outcome }) => outcome)(run.opportunity)
    : null;
  const log = buildLog(
    {
      dungeon,
      party,
      run,
      gold: loot.gold,
      recipeItemNames: [...loot.recipeIds, ...(pickaxe ? [pickaxe.id] : []), ...(opportunityRecipe ? [opportunityRecipe] : [])].map(
        (id) => recipeOutput(recipeById[id]).name,
      ),
      ...sigil,
      firstWin,
      firstTierClear,
      hunger: expedition.hunger,
      salvaged,
      elixirs: true,
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
    briefing,
    threats: run.threats.map(({ threat, state, forced, intimidated }) => ({
      id: threat.id,
      level: threat.level,
      ...(threat.element ? { element: threat.element } : {}),
      state,
      ...(forced ? { forced } : {}),
      ...(intimidated ? { intimidated } : {}),
    })),
    opportunity,
    salvaged,
    loot,
    gold: loot.gold,
    xp: loot.xp,
    ...sigil,
    ...(prize ? { prize } : {}),
    ...(firstWin ? { firstWin } : {}),
    ...(firstTierClear ? { firstTierClear } : {}),
    consumablesUsed,
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
