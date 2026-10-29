import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { dungeons } from '@/content/dungeons';
import { newHero, xpRules } from '@/content/heroes';
import { items } from '@/content/items';
import { recipeById } from '@/content/lookup';
import { materials } from '@/content/materials';
import { craft, craftMany, forgetRecipe, forgeResult, learnAllRecipes, unlockRecipe, type ForgeResult } from '@/game/crafting/crafting';
import { infuse } from '@/game/crafting/infusion';
import { salvage } from '@/game/forging/salvage';
import { migrateV10Save, migrateV11Save, migrateV12Save, migrateV13Save, migrateV14Save, migrateV15Save, migrateV16Save, migrateV17Save, migrateV5Save, migrateV6Save, migrateV7Save, migrateV8Save, migrateV9Save } from '@/game/migrations';
import { convertShards, shardId, stoneId, type Element } from '@/game/elements';
import { fastForward, resolveExpedition, startExpedition, type Loadout } from '@/game/expeditions/expeditions';
import { markWalksSeen, processWalkPath, recordWalk, type WalkFix, type WalkOptions, type WalkPatrols, type WalkSummary } from '@/game/gathering/autoGather';
import { collectSpawn, type CollectResult, type Gatherer } from '@/game/gathering/gathering';
import type { LatLng, Spawn } from '@/game/generation/types';
import { addMaterials } from '@/game/inventory';
import { dayKey, openChest, recordSteps, syncSteps, type ChestReward } from '@/game/rewards/chests';
import { activateLure } from '@/game/rewards/lures';
import { collectTreasure, readTreasureMap, type TreasureContents } from '@/game/rewards/treasure';
import { applyBackgroundResults, type BackgroundResult } from '@/game/patrols/escort';
import { isTravellerKind, type PatrolSpawn, type TravellerKind } from '@/game/patrols/generate';
import { resolvePatrolFights as resolveDueFights, startPatrolFight, type PatrolFight } from '@/game/patrols/fight';
import { acceptRecruit, helpTraveller as helpTravellerRule, trade, type TravellerRecruit, type TravellerReward } from '@/game/patrols/travellers';
import { addPatrolsToWalks, escortHpChange, walkPatrolsFrom } from '@/game/patrols/walkPatrols';
import { challengeSanctum, type SanctumResult, type SanctumSpawn } from '@/game/sanctums/sanctums';
import { createInitialSave, type SaveData, type TutorialStep } from '@/game/save';
import { drinkPotion, fastForwardHealing, healAll, setHeroHp, settleHp } from '@/game/team/health';
import { pickApproach } from '@/game/team/stats';
import { dismissHero, equip, heroStats, isAway, keepHpShare, unequip } from '@/game/team/team';
import { buySupply, recruit, type RecruitOffer } from '@/game/taverns/taverns';
import { buyRank } from '@/game/guild/guild';
import { applyTraining } from '@/game/guild/training';
import type { GuildTrackId } from '@/content/guild';
import { advanceTutorial, finishTutorial, nextTutorialStep, placeTutorialWood } from '@/game/tutorial/tutorial';
import { pruneExpired } from '@/game/upkeep';
import type { Approach, EquipmentSlot, ExpeditionReport, HeroClassId, MasteryType, Quality } from '@/game/types';

import { currentRotation, debugEnabled, useDebugStore } from './debugStore';

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
  ) => { reward: TravellerReward; rosterFull: boolean };
  /** Makes one of a trader's deals. */
  tradeWithTrader: (spawn: PatrolSpawn, tradeIndex: number, player: LatLng) => void;
  /** Takes a traveller up on joining the roster. */
  acceptTravellerRecruit: (offer: TravellerRecruit) => void;
  /** Sets the hero the background task sends at patrols by itself; null clears it. */
  setEscort: (heroId: string | null) => void;
  /** Returns the forged gear piece and mastery change, for gear recipes. Provisions can be made `count` at a time. */
  craft: (recipeId: string, count?: number) => ForgeResult | null;
  infuse: (gearUid: string, element: Element) => void;
  salvage: (gearUid: string) => void;
  /** Pass null to empty the slot. */
  equip: (heroId: string, slot: EquipmentSlot, id: string | null) => void;
  dismissHero: (heroId: string) => void;
  recruit: (offer: RecruitOffer, tavern: LatLng, player: LatLng) => void;
  closeTavernHint: () => void;
  closeCookingHint: () => void;
  /** Drinks a healing potion at home. */
  drinkPotion: (heroId: string) => void;
  /** Spends one of the hero's pending approach picks. */
  pickApproach: (heroId: string, approach: Approach) => void;
  buySupply: (count: number, tavern: LatLng, player: LatLng) => void;
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
  openChest: (chestId: string, steps: number) => ChestReward;
  placeTutorialWood: (position: LatLng) => void;
  challengeSanctum: (spawn: SanctumSpawn, tier: number, heroIds: string[], player: LatLng) => SanctumResult;
  readTreasureMap: (mapId: string, position: LatLng) => void;
  collectTreasure: (mapId: string, player: LatLng, treasureAt: LatLng) => TreasureContents;
  activateLure: (position: LatLng) => void;
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
  addAllMaterials: (amount: number) => void;
  addSigil: (tier: number) => void;
  addElemental: (element: Element, kind: 'shard' | 'stone', amount: number) => void;
  addTreasureMap: () => void;
  resetFirstClears: () => void;
  addHero: (classId: HeroClassId, level: number, trait: string) => void;
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
        const { save, reward, rosterFull } = helpTravellerRule(get().save, spawn, player, now, choice);
        const kind: TravellerKind = spawn.kind;
        const patrols: WalkPatrols = {
          fights: [],
          escortHp: null,
          travellers: [{ kind, reward: reward.kind }],
          gold: reward.kind === 'gold' ? reward.gold : 0,
          xp: 0,
          materials: reward.kind === 'shards' ? [{ materialId: shardId(reward.element), amount: reward.amount }] : [],
        };
        set({ save: addPatrolsToWalks(save, patrols, now) });
        return { reward, rosterFull };
      },
      tradeWithTrader: (spawn, tradeIndex, player) =>
        set(({ save }) => ({ save: trade(save, spawn, tradeIndex, player, Date.now()) })),
      acceptTravellerRecruit: (offer) => set(({ save }) => ({ save: acceptRecruit(save, offer) })),
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
      recruit: (offer, tavern, player) => set(({ save }) => ({ save: recruit(save, offer, tavern, player) })),
      closeTavernHint: () => set(({ save }) => ({ save: { ...save, tavernHintSeen: true } })),
      closeCookingHint: () => set(({ save }) => ({ save: { ...save, cookingHintSeen: true } })),
      drinkPotion: (heroId) => set(({ save }) => ({ save: drinkPotion(save, heroId, Date.now()) })),
      pickApproach: (heroId, approach) => set(({ save }) => ({ save: pickApproach(save, heroId, approach) })),
      buySupply: (count, tavern, player) => set(({ save }) => ({ save: buySupply(save, count, tavern, player) })),
      buyRank: (trackId) => set(({ save }) => ({ save: buyRank(save, trackId) })),
      train: () => set(({ save }) => ({ save: applyTraining(save, Date.now()) })),
      startExpedition: (dungeonId, heroIds, durationScale, loadout) =>
        set(({ save }) => ({
          save: advanceTutorial(startExpedition(save, dungeonId, heroIds, Date.now(), durationScale, currentRotation(), loadout)),
        })),
      prune: () => {
        const pruned = pruneExpired(get().save, Date.now());
        if (pruned !== get().save) set({ save: pruned });
      },
      collectLoot: (expeditionId) => {
        const now = Date.now();
        const expedition = get().save.expeditions.find((e) => e.id === expeditionId);
        if (!expedition || expedition.endsAt > now) return null;
        const debug = useDebugStore.getState();
        const force = debug.forcedMainReward ?? undefined;
        const { save, report } = resolveExpedition(get().save, expedition, { mainReward: { force } });
        if (force && report.success) debug.set({ forcedMainReward: null });
        set({ save: advanceTutorial(pruneExpired(save, now)) });
        return report;
      },
      markReportsSeen: () =>
        set(({ save }) => ({
          save: advanceTutorial({ ...save, reports: save.reports.map((r) => ({ ...r, seen: true })) }),
        })),
      recordSteps: (day, newSteps) => set(({ save }) => ({ save: recordSteps(save, day, newSteps) })),
      syncSteps: (day, total) => set(({ save }) => ({ save: syncSteps(save, day, total) })),
      openChest: (chestId, steps) => {
        const { save, reward } = openChest(get().save, chestId, steps, dayKey(new Date()));
        set({ save });
        return reward;
      },
      placeTutorialWood: (position) => set(({ save }) => ({ save: placeTutorialWood(save, position) })),
      challengeSanctum: (spawn, tier, heroIds, player) => {
        const { save, result } = challengeSanctum(get().save, spawn, tier, heroIds, player, Date.now());
        set({ save });
        return result;
      },
      readTreasureMap: (mapId, position) =>
        set(({ save }) => ({ save: readTreasureMap(save, mapId, position, Date.now()) })),
      collectTreasure: (mapId, player, treasureAt) => {
        const { save, contents } = collectTreasure(get().save, mapId, player, treasureAt, Date.now());
        set({ save });
        return contents;
      },
      activateLure: (position) => set(({ save }) => ({ save: activateLure(save, position, Date.now()) })),
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
      addTreasureMap: () =>
        set(({ save }) => ({
          save: {
            ...save,
            treasureMaps: [
              ...save.treasureMaps,
              { id: `map${save.nextUid}`, tier: 1, expiresAt: Date.now() + 48 * 3_600_000, location: null },
            ],
            nextUid: save.nextUid + 1,
          },
        })),
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
      resetFirstClears: () => set(({ save }) => ({ save: { ...save, firstClears: [] } })),
      addCharters: (amount) => set(({ save }) => ({ save: { ...save, charters: save.charters + amount } })),
      setGuildRank: (trackId, rank) => set(({ save }) => ({ save: { ...save, guild: { ...save.guild, [trackId]: rank } } })),
      resetGuild: () => set(({ save }) => ({ save: { ...save, guild: {} } })),
      addHero: (classId, level, trait) =>
        set(({ save }) => ({
          save: {
            ...save,
            heroes: [...save.heroes, newHero(`h${save.nextUid}`, `Debug ${classId}`, classId, trait, level)],
            nextUid: save.nextUid + 1,
          },
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
          for (const item of items.filter((i) => i.slot === 'provision' || (i.slot === 'consumable' && i.charm))) {
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
      fastForwardHealing: (minutes) => set(({ save }) => ({ save: fastForwardHealing(save, minutes) })),
      resetSave: () => {
        set({ save: createInitialSave() });
      },
    }),
    {
      name: 'pocket-quartermaster-save',
      version: 18,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ save: state.save }),
      // Saves from version 5 on are converted step by step; older ones start fresh. New fields get their defaults.
      migrate: (persisted, version) => {
        const old = (persisted as { save?: Parameters<typeof migrateV5Save>[0] } | undefined)?.save;
        if (!old || version < 5) return { save: createInitialSave() };
        let save: SaveData = version === 5 ? migrateV5Save(old) : (old as SaveData);
        if (version <= 6) save = migrateV6Save(save);
        if (version <= 7) save = migrateV7Save(save);
        if (version <= 8) save = migrateV8Save(save);
        if (version <= 9) save = migrateV9Save(save);
        save = migrateV10Save(save);
        if (version <= 11) save = migrateV11Save(save);
        if (version <= 12) save = migrateV12Save(save);
        if (version <= 13) save = migrateV13Save(save);
        if (version <= 14) save = migrateV14Save(save);
        if (version <= 15) save = migrateV15Save(save);
        if (version <= 16) save = migrateV16Save(save);
        if (version <= 17) save = migrateV17Save(save);
        return { save };
      },
      merge: (persisted, current) => ({
        ...current,
        save: { ...createInitialSave(), ...(persisted as { save?: Partial<SaveData> } | undefined)?.save },
      }),
    },
  ),
);
