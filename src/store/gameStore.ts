import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { dungeons } from '@/content/dungeons';
import { newHero, xpRules } from '@/content/heroes';
import { items } from '@/content/items';
import { recipeById } from '@/content/lookup';
import { materials } from '@/content/materials';
import { craft, craftMany, forgetRecipe, forgeResult, learnAllRecipes, learnTier, unlockRecipe, type ForgeResult } from '@/game/crafting/crafting';
import { unlockAllPartRecipes } from '@/game/crafting/partRecipes';
import { infuse } from '@/game/crafting/infusion';
import { forgeWithComponent } from '@/game/forging/components';
import { restoreRelic } from '@/game/forging/relics';
import { salvage } from '@/game/forging/salvage';
import { convertShards, shardId, stoneId, type Element } from '@/game/elements';
import { fastForward, resolveExpedition, startExpedition, type Loadout } from '@/game/expeditions/expeditions';
import { markWalksSeen, processWalkPath, recordWalk, type WalkFix, type WalkOptions, type WalkPatrols, type WalkSummary } from '@/game/gathering/autoGather';
import { collectSpawn, localDayKey, type CollectResult, type Gatherer } from '@/game/gathering/gathering';
import { endWalkEffect, startWalkEffect } from '@/game/gathering/walkEffects';
import type { LatLng, Spawn } from '@/game/generation/types';
import { addMaterials } from '@/game/inventory';
import { dayKey, openChest, recordSteps, syncSteps } from '@/game/rewards/chests';
import { activateLure } from '@/game/rewards/lures';
import { collectTreasure, readTreasureMap } from '@/game/rewards/treasure';
import { grantLoot } from '@/game/loot/grant';
import { readManual } from '@/game/loot/manuals';
import type { Loot, ManualRarity } from '@/game/loot/types';
import { applyBackgroundResults, type BackgroundResult } from '@/game/patrols/escort';
import { isTravellerKind, type PatrolSpawn, type TravellerKind } from '@/game/patrols/generate';
import { resolvePatrolFights as resolveDueFights, startPatrolFight, type PatrolFight } from '@/game/patrols/fight';
import { acceptRecruit, helpTraveller as helpTravellerRule, sellValuableToTrader, trade, type TravellerRecruit, type TravellerReward } from '@/game/patrols/travellers';
import { addPatrolsToWalks, escortHpChange, walkPatrolsFrom } from '@/game/patrols/walkPatrols';
import { challengeSanctum, type SanctumResult, type SanctumSpawn } from '@/game/sanctums/sanctums';
import { createInitialSave, type SaveData, type TutorialStep } from '@/game/save';
import { drinkPotion, fastForwardHealing, giveHomeCare, healAll, setHeroHp, settleHp } from '@/game/team/health';
import { buy, sellGear, sellMaterial, sellValuable } from '@/game/places/shops';
import { apothecaryCare, blessRelics, chapelCare, takeChapelBlessing, trainHero, type CareKind } from '@/game/places/services';
import type { PlaceSpawn } from '@/game/places/generate';
import { fish } from '@/game/places/dock';
import { resolvePlaceFights, startPlaceFight } from '@/game/places/fights';
import { resolveHeists, startHeist } from '@/game/places/heists';
import { digRuin } from '@/game/places/ruins';
import { launchUnderwater } from '@/game/secrets/dungeon';
import { grantTip, type TipOutcome } from '@/game/secrets/tips';
import { buyAtBlackMarket, enterSecret, recruitAtSecret } from '@/game/secrets/places';
import type { TipSource } from '@/content/secrets';
import { pickApproach } from '@/game/team/stats';
import { dismissHero, equip, heroStats, isAway, keepHpShare, markClassesSeen, setKitFor, unequip } from '@/game/team/team';
import { buySupply, recruit, type RecruitOffer } from '@/game/taverns/taverns';
import { buyRank } from '@/game/guild/guild';
import { applyTraining } from '@/game/guild/training';
import type { GuildTrackId } from '@/content/guild';
import { advanceTutorial, finishTutorial, nextTutorialStep, placeTutorialWood } from '@/game/tutorial/tutorial';
import { pruneExpired, rollDailyApproaches } from '@/game/upkeep';
import type { Approach, EquipmentSlot, ExpeditionReport, Heist, HeroClassId, HeroRoll, MasteryType, PlaceFight, Quality } from '@/game/types';

import { t } from '@/i18n';

import { currentRotation, debugEnabled, useDebugStore } from './debugStore';
import { useWorldStore } from './worldStore';

/** A tip for a place already tipped pays gold: say so on the map. New tips have their own toast (SecretToast). */
function noteTips(outcomes: TipOutcome[]) {
  const gold = outcomes.reduce((sum, outcome) => sum + (outcome.kind === 'gold' ? outcome.gold : 0), 0);
  if (gold > 0) useWorldStore.getState().set({ patrolMessage: { text: t('secrets.duplicate', { gold }), at: Date.now() } });
}

type GameState = {
  save: SaveData;
  collect: (spawn: Spawn, gatherer: Gatherer, timeMs: number) => CollectResult;
  /** Auto-gather: collects along the walked path; `record` adds the summary to the walk history. */
  processWalk: (fixes: WalkFix[], options: WalkOptions, record: boolean) => WalkSummary;
  markWalksSeen: () => void;
  /** Folds the background task's fight results into the save and the newest walk summary; results already applied change nothing. */
  mergeBackground: (results: BackgroundResult[]) => void;
  /** Settles the patrol fights whose time is up; the newest walk summary tells of them. */
  resolvePatrolFights: () => PatrolFight[];
  /** Sends home heroes at a patrol; the fight settles when its time is up. */
  engagePatrol: (spawn: PatrolSpawn, heroIds: string[], player: LatLng) => void;
  /** Helps a traveller, pays what they ask and notes them in the walk summary. */
  helpTraveller: (
    spawn: PatrolSpawn,
    player: LatLng,
    choice?: 'meal' | 'supply',
  ) => { reward: TravellerReward; rosterFull: boolean; tip?: TipOutcome };
  /** Makes one of a trader's deals. */
  tradeWithTrader: (spawn: PatrolSpawn, tradeIndex: number, player: LatLng) => void;
  /** Takes a traveller up on joining the roster. */
  acceptTravellerRecruit: (offer: TravellerRecruit) => void;
  /** Sets the hero the background task sends at patrols by itself; null clears it. */
  setEscort: (heroId: string | null) => void;
  /** Returns the forged gear piece and mastery change, for gear recipes. Provisions can be made `count` at a time. */
  craft: (recipeId: string, count?: number) => ForgeResult | null;
  forgeWithComponent: (recipeId: string, componentId: string) => ForgeResult | null;
  /** `free` skips the cost (debug only). */
  restoreRelic: (relicUid: string, free?: boolean) => ForgeResult | null;
  infuse: (gearUid: string, element: Element) => void;
  salvage: (gearUid: string) => void;
  /** Pass null to empty the slot. */
  equip: (heroId: string, slot: EquipmentSlot, id: string | null) => void;
  dismissHero: (heroId: string) => void;
  /** A Porter's pick of the hero their kit is carried for. */
  setKitFor: (porterId: string, heroId: string | null) => void;
  /** Classes shown to the player (tavern or traveller offers) count as met. */
  seeClasses: (classIds: HeroClassId[]) => void;
  recruit: (offer: RecruitOffer, tavern: LatLng, player: LatLng) => void;
  closeTavernHint: () => void;
  closeCookingHint: () => void;
  /** Drinks a healing potion at home: the one asked for, or else the best fit. */
  drinkPotion: (heroId: string, itemId?: string) => void;
  /** Uses a home care item from the stock on a hero at home. */
  giveHomeCare: (heroId: string, itemId: string) => void;
  /** Spends one of the hero's pending approach picks. */
  pickApproach: (heroId: string, approach: Approach) => void;
  buySupply: (count: number, tavern: LatLng, player: LatLng) => void;
  /** Buys from a place's stock; a sold-out place leaves the map for this player. */
  buyAtPlace: (spawn: PlaceSpawn, lineKey: string, count: number, player: LatLng) => void;
  sellGearAtPlace: (spawn: PlaceSpawn, gearUid: string, player: LatLng) => void;
  sellMaterialAtPlace: (spawn: PlaceSpawn, materialId: string, count: number, player: LatLng) => void;
  /** Sells valuables of one `valuableId:tier` stack to a place that buys them. */
  sellValuableAtPlace: (spawn: PlaceSpawn, key: string, count: number, player: LatLng) => void;
  sellValuableToTrader: (spawn: PatrolSpawn, key: string, count: number, player: LatLng) => void;
  /** Debug: every market's collector wants this valuable today. */
  setCollector: (valuableId: string) => void;
  /** The chapel's free care, once per visit. */
  chapelCare: (spawn: PlaceSpawn, heroId: string, care: CareKind, player: LatLng) => void;
  blessRelics: (spawn: PlaceSpawn, player: LatLng) => void;
  takeChapelBlessing: (spawn: PlaceSpawn, player: LatLng) => void;
  apothecaryCare: (spawn: PlaceSpawn, heroId: string, care: CareKind, player: LatLng) => void;
  trainHero: (spawn: PlaceSpawn, heroId: string, player: LatLng) => void;
  /** Sends home heroes at a fight event or monster lair; the fight settles when its time is up. */
  engagePlaceFight: (spawn: PlaceSpawn, heroIds: string[], player: LatLng) => void;
  /** Sends one hero on a thieves' guild heist. */
  startHeist: (spawn: PlaceSpawn, heroId: string, player: LatLng) => void;
  /** Settles place fights and heists whose time is up. */
  resolvePlaces: () => { fights: PlaceFight[]; heists: Heist[] };
  digRuin: (spawn: PlaceSpawn, player: LatLng) => { reward: Loot; relic: boolean };
  /** Fishes at a dock; returns the fish caught. */
  fish: (spawn: PlaceSpawn, player: LatLng) => Loot;
  /** Spends a mysterious key on a tipped den or black market. */
  enterSecret: (place: PlaceSpawn, player: LatLng) => void;
  recruitAtSecret: (place: PlaceSpawn, player: LatLng) => void;
  buyAtBlackMarket: (place: PlaceSpawn, key: string, player: LatLng) => void;
  /** Spends a mysterious key and sends the party into the tipped underwater dungeon. */
  launchUnderwater: (place: PlaceSpawn, heroIds: string[], player: LatLng, loadout?: Loadout) => void;
  /** Debug: a tip for any secret place, found here. */
  giveTip: (source: TipSource, position: LatLng) => void;
  buyRank: (trackId: GuildTrackId) => void;
  /** Credits Guild Hall training XP since the last check. */
  train: () => void;
  startExpedition: (dungeonId: string, heroIds: string[], durationScale: number, loadout?: Loadout) => void;
  /** Drops expired maps, lures and used Sanctums. */
  prune: () => void;
  /** Brings a finished expedition home: rewards, XP and HP are applied now. */
  collectLoot: (expeditionId: string) => ExpeditionReport | null;
  markReportsSeen: () => void;
  recordSteps: (day: string, newSteps: number) => void;
  syncSteps: (day: string, total: number) => void;
  openChest: (chestId: string, steps: number) => Loot;
  placeTutorialWood: (position: LatLng) => void;
  challengeSanctum: (spawn: SanctumSpawn, tier: number, heroIds: string[], player: LatLng) => SanctumResult;
  readTreasureMap: (mapId: string, position: LatLng) => void;
  readManual: (heroId: string, rarity: ManualRarity) => void;
  collectTreasure: (mapId: string, player: LatLng, treasureAt: LatLng) => Loot;
  activateLure: (position: LatLng) => void;
  /** Uses a walking consumable where the player stands, replacing one of the same item. */
  startWalkEffect: (itemId: string, position: LatLng) => void;
  /** Moves the tutorial past `step` if it is the current one, e.g. when a tip is closed. */
  nextTutorialStep: (step: TutorialStep) => void;
  /** Debug: skips the whole tutorial. */
  finishTutorial: () => void;
  // Debug
  /** Crafts the next pickaxe for free. */
  grantNextPickaxe: () => void;
  /** Marks the lowest unbeaten boss as beaten, revealing the next dungeon tier. */
  beatNextBoss: () => void;
  addGold: (amount: number) => void;
  /** Debug: forgets every purchase and used-up place, refilling shops. */
  refillPlaces: () => void;
  setRuinsProgress: (progress: number) => void;
  addAllMaterials: (amount: number) => void;
  addSigil: (tier: number) => void;
  addElemental: (element: Element, kind: 'shard' | 'stone', amount: number) => void;
  /** Debug: pays any loot as if a source had dropped it. */
  debugGrantLoot: (loot: Loot) => void;
  resetFirstWin: () => void;
  /** Debug: a hero of any class and level, with an average roll or one landing on a grade. */
  addHero: (classId: HeroClassId, level: number, trait: string, roll?: HeroRoll) => void;
  /** Debug: sets a hero's level (1–15), XP to 0; pending approach picks follow. */
  debugSetHeroLevel: (heroId: string, level: number) => void;
  addCharters: (amount: number) => void;
  setGuildRank: (trackId: GuildTrackId, rank: number) => void;
  resetGuild: () => void;
  setMastery: (type: MasteryType, level: number) => void;
  /** Debug: adds a GearInstance, roll 1, no luck. */
  addGear: (itemId: string, quality: Quality, element: Element | null) => void;
  /** Debug: teaches a recipe, mastery starting where unlockRecipe puts it. */
  learnRecipe: (recipeId: string) => void;
  /** Debug: removes a recipe from the known list. */
  forgetRecipe: (recipeId: string) => void;
  /** Debug: teaches every recipe. */
  learnAllRecipes: () => void;
  /** Debug: sees every part and gem, unlocking every part recipe. */
  unlockAllPartRecipes: () => void;
  /** Debug: teaches every gear blueprint of a tier. */
  learnTier: (tier: number) => void;
  addLure: () => void;
  /** Forgets used Sanctums and the Sigil pity counter. */
  resetSanctums: () => void;
  /** Debug: forgets beaten patrols, helped travellers and trader uses. */
  resetPatrols: () => void;
  fastForwardExpeditions: () => void;
  /** Sets a hero's HP share; `exhausted` also knocks them out for a while. */
  setHeroHp: (heroId: string, share: number, exhausted: boolean) => void;
  healAll: () => void;
  /** Adds this many of every provision and charm. */
  addProvisions: (amount: number) => void;
  /** Adds one of every kit and ward salve (debug only). */
  addKits: () => void;
  /** Adds one of every elixir, provision, walking and home care item (debug only). */
  addConsumables: () => void;
  /** Ends a walking effect now (debug only). */
  endWalkEffect: (itemId: string) => void;
  fastForwardHealing: (minutes: number) => void;
  resetSave: () => void;
};

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      save: createInitialSave(),
      collect: (spawn, gatherer, timeMs) => {
        const result = collectSpawn(get().save, spawn, gatherer, timeMs);
        if (result.ok) set({ save: advanceTutorial(result.save) });
        return result;
      },
      processWalk: (fixes, options, record) => {
        const { save, summary } = processWalkPath(get().save, fixes, options);
        set({ save: record ? recordWalk(save, summary) : save });
        return summary;
      },
      markWalksSeen: () => set(({ save }) => ({ save: markWalksSeen(save) })),
      mergeBackground: (results) => {
        const now = Date.now();
        const save = get().save;
        const newResults = results.filter((result) => save.appliedBackgroundResults[result.id] === undefined);
        const applied = applyBackgroundResults(save, results, now);
        set({ save: addPatrolsToWalks(applied, walkPatrolsFrom(newResults, [], escortHpChange(newResults)), now) });
      },
      resolvePatrolFights: () => {
        const now = Date.now();
        const { save, resolved } = resolveDueFights(get().save, now);
        const next = addPatrolsToWalks(save, walkPatrolsFrom([], resolved), now);
        if (next !== get().save) set({ save: next });
        return resolved;
      },
      engagePatrol: (spawn, heroIds, player) => set({ save: startPatrolFight(get().save, spawn, heroIds, player, Date.now()) }),
      helpTraveller: (spawn, player, choice) => {
        if (!isTravellerKind(spawn.kind)) throw new Error(`Nothing to ask of a ${spawn.kind}`);
        const now = Date.now();
        const { save, reward, rosterFull, tip } = helpTravellerRule(get().save, spawn, player, now, choice);
        noteTips(tip ? [tip] : []);
        const kind: TravellerKind = spawn.kind;
        const patrols: WalkPatrols = {
          fights: [],
          escortHp: null,
          travellers: [{ kind, reward: reward.kind }],
          gold: reward.kind === 'loot' ? reward.loot.gold : 0,
          xp: 0,
          materials: reward.kind === 'loot' ? reward.loot.materials : [],
        };
        set({ save: addPatrolsToWalks(save, patrols, now) });
        return { reward, rosterFull, ...(tip ? { tip } : {}) };
      },
      tradeWithTrader: (spawn, tradeIndex, player) =>
        set(({ save }) => ({ save: trade(save, spawn, tradeIndex, player, Date.now()) })),
      acceptTravellerRecruit: (offer) => set(({ save }) => ({ save: rollDailyApproaches(acceptRecruit(save, offer), Date.now()) })),
      setEscort: (heroId) => {
        const save = get().save;
        if (heroId && !save.heroes.some((h) => h.id === heroId)) throw new Error(`Unknown hero ${heroId}`);
        if (heroId && isAway(save, heroId)) throw new Error(`${heroId} is away`);
        set({ save: { ...save, escort: heroId ? { heroId } : null } });
      },
      craft: (recipeId, count = 1) => {
        const before = get().save;
        const debug = useDebugStore.getState();
        const quality = debugEnabled(debug) ? (debug.forcedQuality ?? undefined) : undefined;
        const recipe = recipeById[recipeId];
        const save = advanceTutorial(recipe.station === 'provisions' ? craftMany(before, recipe, count) : craft(before, recipe, quality));
        set({ save });
        const result = forgeResult(before, save);
        if (result && quality) debug.set({ forcedQuality: null });
        return result;
      },
      forgeWithComponent: (recipeId, componentId) => {
        const before = get().save;
        const save = forgeWithComponent(before, recipeById[recipeId], componentId);
        set({ save });
        return forgeResult(before, save);
      },
      restoreRelic: (relicUid, free = false) => {
        const before = get().save;
        const save = restoreRelic(before, relicUid, free);
        set({ save });
        return forgeResult(before, save);
      },
      infuse: (gearUid, element) => set(({ save }) => ({ save: infuse(save, gearUid, element) })),
      salvage: (gearUid) => set(({ save }) => ({ save: salvage(save, gearUid) })),
      equip: (heroId, slot, id) =>
        set(({ save }) => ({
          // HP is settled first, so a change of max HP keeps the right share.
          save: advanceTutorial(
            id ? equip(settleHp(save, Date.now()), heroId, slot, id) : unequip(settleHp(save, Date.now()), heroId, slot),
          ),
        })),
      // Notifications follow the save: see `useNotifications`.
      dismissHero: (heroId) => set(({ save }) => ({ save: dismissHero(save, heroId) })),
      setKitFor: (porterId, heroId) => set(({ save }) => ({ save: setKitFor(save, porterId, heroId) })),
      seeClasses: (classIds) => {
        const next = markClassesSeen(get().save, classIds);
        if (next !== get().save) set({ save: next });
      },
      recruit: (offer, tavern, player) => set(({ save }) => ({ save: rollDailyApproaches(recruit(save, offer, tavern, player), Date.now()) })),
      closeTavernHint: () => set(({ save }) => ({ save: { ...save, tavernHintSeen: true } })),
      closeCookingHint: () => set(({ save }) => ({ save: { ...save, cookingHintSeen: true } })),
      drinkPotion: (heroId, itemId) => set(({ save }) => ({ save: drinkPotion(save, heroId, Date.now(), itemId) })),
      giveHomeCare: (heroId, itemId) => set(({ save }) => ({ save: giveHomeCare(save, heroId, itemId, Date.now()) })),
      pickApproach: (heroId, approach) => set(({ save }) => ({ save: pickApproach(save, heroId, approach) })),
      buySupply: (count, tavern, player) => set(({ save }) => ({ save: buySupply(save, count, tavern, player) })),
      buyAtPlace: (spawn, lineKey, count, player) => set(({ save }) => ({ save: buy(save, spawn, lineKey, count, player, Date.now()) })),
      sellGearAtPlace: (spawn, gearUid, player) => set(({ save }) => ({ save: sellGear(save, spawn, gearUid, player, Date.now()) })),
      sellMaterialAtPlace: (spawn, materialId, count, player) =>
        set(({ save }) => ({ save: sellMaterial(save, spawn, materialId, count, player, Date.now()) })),
      sellValuableAtPlace: (spawn, key, count, player) =>
        set(({ save }) => ({ save: sellValuable(save, spawn, key, count, player, Date.now()) })),
      sellValuableToTrader: (spawn, key, count, player) =>
        set(({ save }) => ({ save: sellValuableToTrader(save, spawn, key, count, player, Date.now()) })),
      setCollector: (valuableId) =>
        set(({ save }) => ({ save: { ...save, collectorOverride: { dayKey: localDayKey(Date.now()), valuableId } } })),
      chapelCare: (spawn, heroId, care, player) => set(({ save }) => ({ save: chapelCare(save, spawn, heroId, care, player, Date.now()) })),
      blessRelics: (spawn, player) => set(({ save }) => ({ save: blessRelics(save, spawn, player, Date.now()) })),
      takeChapelBlessing: (spawn, player) => set(({ save }) => ({ save: takeChapelBlessing(save, spawn, player, Date.now()) })),
      apothecaryCare: (spawn, heroId, care, player) =>
        set(({ save }) => ({ save: apothecaryCare(save, spawn, heroId, care, player, Date.now()) })),
      trainHero: (spawn, heroId, player) => set(({ save }) => ({ save: trainHero(save, spawn, heroId, player, Date.now()) })),
      engagePlaceFight: (spawn, heroIds, player) => set(({ save }) => ({ save: startPlaceFight(save, spawn, heroIds, player, Date.now()) })),
      startHeist: (spawn, heroId, player) => set(({ save }) => ({ save: startHeist(save, spawn, heroId, player, Date.now()) })),
      resolvePlaces: () => {
        const now = Date.now();
        const fights = resolvePlaceFights(get().save, now);
        const heists = resolveHeists(fights.save, now);
        if (heists.save !== get().save) set({ save: heists.save });
        noteTips([...fights.tips, ...heists.tips]);
        return { fights: fights.resolved, heists: heists.resolved };
      },
      digRuin: (spawn, player) => {
        const { save, reward, relic } = digRuin(get().save, spawn, player, Date.now());
        set({ save });
        return { reward, relic };
      },
      fish: (spawn, player) => {
        const { save, loot, tip } = fish(get().save, spawn, player, Date.now());
        set({ save });
        noteTips(tip ? [tip] : []);
        return loot;
      },
      enterSecret: (place, player) => set(({ save }) => ({ save: enterSecret(save, place, player, Date.now()) })),
      recruitAtSecret: (place, player) =>
        set(({ save }) => ({ save: rollDailyApproaches(recruitAtSecret(save, place, player, Date.now()), Date.now()) })),
      buyAtBlackMarket: (place, key, player) => set(({ save }) => ({ save: buyAtBlackMarket(save, place, key, player, Date.now()) })),
      launchUnderwater: (place, heroIds, player, loadout) =>
        set(({ save }) => ({ save: launchUnderwater(save, place, heroIds, player, Date.now(), loadout) })),
      giveTip: (source, position) => {
        const now = Date.now();
        const { save, outcome } = grantTip(get().save, { source, sourceId: `debug:${now}`, anchor: position }, now);
        set({ save });
        noteTips([outcome]);
      },
      buyRank: (trackId) => set(({ save }) => ({ save: buyRank(save, trackId) })),
      train: () => set(({ save }) => ({ save: applyTraining(save, Date.now()) })),
      startExpedition: (dungeonId, heroIds, durationScale, loadout) =>
        set(({ save }) => ({
          save: advanceTutorial(startExpedition(save, dungeonId, heroIds, Date.now(), durationScale, currentRotation(), loadout)),
        })),
      prune: () => {
        const pruned = rollDailyApproaches(pruneExpired(get().save, Date.now()), Date.now());
        if (pruned !== get().save) set({ save: pruned });
      },
      collectLoot: (expeditionId) => {
        const now = Date.now();
        const expedition = get().save.expeditions.find((e) => e.id === expeditionId);
        if (!expedition || expedition.endsAt > now) return null;
        const debug = useDebugStore.getState();
        const force = debug.forcedLootCategory ?? undefined;
        const { save, report } = resolveExpedition(get().save, expedition, { loot: { force } });
        if (force && report.success) debug.set({ forcedLootCategory: null });
        set({ save: advanceTutorial(rollDailyApproaches(pruneExpired(save, now), now)) });
        return report;
      },
      markReportsSeen: () =>
        set(({ save }) => ({
          save: advanceTutorial({ ...save, reports: save.reports.map((r) => ({ ...r, seen: true })) }),
        })),
      recordSteps: (day, newSteps) => set(({ save }) => ({ save: recordSteps(save, day, newSteps) })),
      syncSteps: (day, total) => set(({ save }) => ({ save: syncSteps(save, day, total) })),
      openChest: (chestId, steps) => {
        const { save, reward } = openChest(get().save, chestId, steps, dayKey(new Date()), Date.now());
        set({ save });
        return reward;
      },
      placeTutorialWood: (position) => set(({ save }) => ({ save: placeTutorialWood(save, position) })),
      challengeSanctum: (spawn, tier, heroIds, player) => {
        const { save, result } = challengeSanctum(get().save, spawn, tier, heroIds, player, Date.now());
        set({ save });
        return result;
      },
      readManual: (heroId, rarity) => set(({ save }) => ({ save: readManual(save, heroId, rarity) })),
      readTreasureMap: (mapId, position) =>
        set(({ save }) => ({ save: readTreasureMap(save, mapId, position, Date.now()) })),
      collectTreasure: (mapId, player, treasureAt) => {
        const { save, contents } = collectTreasure(get().save, mapId, player, treasureAt, Date.now());
        set({ save });
        return contents;
      },
      activateLure: (position) => set(({ save }) => ({ save: activateLure(save, position, Date.now()) })),
      startWalkEffect: (itemId, position) => set(({ save }) => ({ save: startWalkEffect(save, itemId, position, Date.now()) })),
      nextTutorialStep: (step) => set(({ save }) => ({ save: nextTutorialStep(save, step) })),
      finishTutorial: () => set(({ save }) => ({ save: finishTutorial(save) })),
      grantNextPickaxe: () =>
        set(({ save }) => {
          const pickaxe = items
            .flatMap((item) => (item.slot === 'tool' ? [item] : []))
            .sort((a, b) => a.tier - b.tier)
            .find((item) => !save.tools.includes(item.id));
          if (!pickaxe) return { save };
          const recipe = recipeById[pickaxe.id];
          const ready = { ...unlockRecipe(save, recipe.id), materials: addMaterials(save.materials, recipe.inputs) };
          return { save: craft(ready, recipe) };
        }),
      beatNextBoss: () =>
        set(({ save }) => {
          const boss = dungeons.find((d) => d.isBoss && !save.clearedDungeons.includes(d.id));
          return boss ? { save: { ...save, clearedDungeons: [...save.clearedDungeons, boss.id] } } : { save };
        }),
      addGold: (amount) => set(({ save }) => ({ save: { ...save, gold: save.gold + amount } })),
      refillPlaces: () => set(({ save }) => ({ save: { ...save, placePurchases: {}, usedPlaces: {} } })),
      setRuinsProgress: (progress) => set(({ save }) => ({ save: { ...save, ruinsProgress: progress } })),
      addAllMaterials: (amount) =>
        set(({ save }) => ({
          save: {
            ...save,
            materials: addMaterials(save.materials, materials.map((m) => ({ materialId: m.id, amount }))),
          },
        })),
      addSigil: (tier) => set(({ save }) => ({ save: { ...save, sigils: [...save.sigils, tier] } })),
      addElemental: (element, kind, amount) =>
        set(({ save }) => ({
          save: {
            ...save,
            materials: convertShards(
              addMaterials(save.materials, [{ materialId: kind === 'shard' ? shardId(element) : stoneId(element), amount }]),
            ),
          },
        })),
      debugGrantLoot: (loot) => set(({ save }) => ({ save: grantLoot(save, save.heroes.map((h) => h.id), loot, Date.now()) })),
      setMastery: (type, level) =>
        set(({ save }) => ({ save: { ...save, mastery: { ...save.mastery, [type]: { level, progress: 0 } } } })),
      addGear: (itemId, quality, element) =>
        set(({ save }) => ({
          save: {
            ...save,
            gear: [...save.gear, { uid: `g${save.nextUid}`, itemId, quality, roll: 1, ...(element ? { element } : {}) }],
            nextUid: save.nextUid + 1,
          },
        })),
      learnRecipe: (recipeId) => set(({ save }) => ({ save: unlockRecipe(save, recipeId) })),
      forgetRecipe: (recipeId) => set(({ save }) => ({ save: forgetRecipe(save, recipeId) })),
      learnAllRecipes: () => set(({ save }) => ({ save: learnAllRecipes(save) })),
      unlockAllPartRecipes: () => set(({ save }) => ({ save: unlockAllPartRecipes(save) })),
      learnTier: (tier) => set(({ save }) => ({ save: learnTier(save, tier) })),
      resetFirstWin: () => set(({ save }) => ({ save: { ...save, firstWinDay: null } })),
      addCharters: (amount) => set(({ save }) => ({ save: { ...save, charters: save.charters + amount } })),
      setGuildRank: (trackId, rank) => set(({ save }) => ({ save: { ...save, guild: { ...save.guild, [trackId]: rank } } })),
      resetGuild: () => set(({ save }) => ({ save: { ...save, guild: {} } })),
      addHero: (classId, level, trait, roll) =>
        set(({ save }) => ({
          save: rollDailyApproaches(
            {
              ...save,
              heroes: [...save.heroes, { ...newHero(`h${save.nextUid}`, `Debug ${classId}`, classId, trait, level), ...(roll ? { roll } : {}) }],
              nextUid: save.nextUid + 1,
            },
            Date.now(),
          ),
        })),
      debugSetHeroLevel: (heroId, level) =>
        set(({ save }) => {
          // The hero's HP keeps its share of the new max HP.
          const settled = settleHp(save, Date.now());
          const hero = settled.heroes.find((h) => h.id === heroId);
          if (!hero) return { save: settled };
          const clamped = Math.min(xpRules.maxLevel, Math.max(1, level));
          const next = {
            ...settled,
            heroes: settled.heroes.map((h) => (h.id === heroId ? { ...h, level: clamped, xp: 0 } : h)),
          };
          const updated = next.heroes.find((h) => h.id === heroId)!;
          return {
            save: {
              ...next,
              heroes: next.heroes.map((h) =>
                h.id === heroId ? keepHpShare(updated, heroStats(settled, hero).hp, heroStats(next, updated).hp) : h,
              ),
            },
          };
        }),
      addLure: () => set(({ save }) => ({ save: { ...save, lures: save.lures + 1 } })),
      resetSanctums: () => set(({ save }) => ({ save: { ...save, usedSanctums: {}, sigilPity: 0 } })),
      resetPatrols: () =>
        set(({ save }) => ({ save: { ...save, beatenPatrols: {}, helpedTravellers: {}, traderUses: {} } })),
      fastForwardExpeditions: () => set(({ save }) => ({ save: fastForward(save, Date.now()) })),
      setHeroHp: (heroId, share, exhausted) => set(({ save }) => ({ save: setHeroHp(save, heroId, share, Date.now(), exhausted) })),
      healAll: () => set(({ save }) => ({ save: healAll(save) })),
      addProvisions: (amount) =>
        set(({ save }) => {
          const consumables = { ...save.consumables };
          for (const item of items.filter((i) => i.slot === 'provision')) {
            consumables[item.id] = (consumables[item.id] ?? 0) + amount;
          }
          return { save: { ...save, consumables } };
        }),
      addKits: () =>
        set(({ save }) => {
          const consumables = { ...save.consumables };
          for (const item of items.filter((i) => i.slot === 'consumable' && (i.kit || i.protectsAgainst))) {
            consumables[item.id] = (consumables[item.id] ?? 0) + 1;
          }
          return { save: { ...save, consumables } };
        }),
      addConsumables: () =>
        set(({ save }) => {
          const consumables = { ...save.consumables };
          for (const item of items.filter((i) => (i.slot === 'consumable' && (i.elixir || i.charm)) || i.slot === 'provision' || i.slot === 'utility')) {
            consumables[item.id] = (consumables[item.id] ?? 0) + 1;
          }
          return { save: { ...save, consumables } };
        }),
      endWalkEffect: (itemId) => set(({ save }) => ({ save: endWalkEffect(save, itemId, Date.now()) })),
      fastForwardHealing: (minutes) => set(({ save }) => ({ save: fastForwardHealing(save, minutes) })),
      resetSave: () => {
        set({ save: createInitialSave() });
      },
    }),
    {
      name: 'pocket-quartermaster-save',
      version: 25,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ save: state.save }),
      // Until release, a save change starts fresh: saves before version 25 (secret tips) are reset.
      migrate: (persisted, version) => {
        const old = (persisted as { save?: SaveData } | undefined)?.save;
        if (!old || version < 25) return { save: createInitialSave() };
        return { save: old };
      },
      merge: (persisted, current) => ({
        ...current,
        save: { ...createInitialSave(), ...(persisted as { save?: Partial<SaveData> } | undefined)?.save },
      }),
    },
  ),
);
