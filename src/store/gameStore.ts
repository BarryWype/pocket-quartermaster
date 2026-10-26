import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { dungeons } from '@/content/dungeons';
import { newHero } from '@/content/heroes';
import { items } from '@/content/items';
import { recipeById } from '@/content/lookup';
import { materials } from '@/content/materials';
import { craft, forgeResult, unlockRecipe, type ForgeResult } from '@/game/crafting/crafting';
import { infuse } from '@/game/crafting/infusion';
import { salvage } from '@/game/forging/salvage';
import { migrateV5Save, migrateV6Save, migrateV7Save, migrateV8Save } from '@/game/migrations';
import { convertShards, shardId, stoneId, type Element } from '@/game/elements';
import { fastForward, resolveDue, startExpedition } from '@/game/expeditions/expeditions';
import { collectSpawn, type CollectResult, type Gatherer } from '@/game/gathering/gathering';
import type { LatLng, Spawn } from '@/game/generation/types';
import { addMaterials } from '@/game/inventory';
import { dayKey, openChest, recordSteps, syncSteps, type ChestReward } from '@/game/rewards/chests';
import { activateLure } from '@/game/rewards/lures';
import { collectTreasure, readTreasureMap, type TreasureContents } from '@/game/rewards/treasure';
import { challengeSanctum, type SanctumResult, type SanctumSpawn } from '@/game/sanctums/sanctums';
import { createInitialSave, type SaveData, type TutorialStep } from '@/game/save';
import { dismissHero, equip, unequip } from '@/game/team/team';
import { learnWeaponTypes, recruit, type RecruitOffer } from '@/game/taverns/taverns';
import { buyRank } from '@/game/guild/guild';
import { applyTraining } from '@/game/guild/training';
import type { GuildTrackId } from '@/content/guild';
import { advanceTutorial, finishTutorial, nextTutorialStep, placeTutorialWood } from '@/game/tutorial/tutorial';
import { pruneExpired } from '@/game/upkeep';
import type { EquipmentSlot, ExpeditionReport, HeroClassId, MasteryType, Quality } from '@/game/types';

import { currentRotation, debugEnabled, useDebugStore } from './debugStore';

type GameState = {
  save: SaveData;
  collect: (spawn: Spawn, gatherer: Gatherer, timeMs: number) => CollectResult;
  /** Returns the forged gear piece and mastery change, for gear recipes. */
  craft: (recipeId: string) => ForgeResult | null;
  infuse: (gearUid: string, element: Element) => void;
  salvage: (gearUid: string) => void;
  /** Pass null to empty the slot. */
  equip: (heroId: string, slot: EquipmentSlot, id: string | null) => void;
  dismissHero: (heroId: string) => void;
  recruit: (offer: RecruitOffer, tavern: LatLng, player: LatLng) => void;
  closeTavernHint: () => void;
  buyRank: (trackId: GuildTrackId) => void;
  /** Credits Guild Hall training XP since the last check. */
  train: () => void;
  startExpedition: (dungeonId: string, heroIds: string[], durationScale: number) => void;
  resolveDue: () => ExpeditionReport[];
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
  addCharters: (amount: number) => void;
  setGuildRank: (trackId: GuildTrackId, rank: number) => void;
  resetGuild: () => void;
  setMastery: (type: MasteryType, level: number) => void;
  addGear: (itemId: string, quality: Quality, element: Element | null) => void;
  addLure: () => void;
  /** Forgets used Sanctums and the Sigil pity counter. */
  resetSanctums: () => void;
  fastForwardExpeditions: () => void;
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
      craft: (recipeId) => {
        const before = get().save;
        const debug = useDebugStore.getState();
        const quality = debugEnabled(debug) ? (debug.forcedQuality ?? undefined) : undefined;
        const save = advanceTutorial(craft(before, recipeById[recipeId], quality));
        set({ save });
        const result = forgeResult(before, save);
        if (result && quality) debug.set({ forcedQuality: null });
        return result;
      },
      infuse: (gearUid, element) => set(({ save }) => ({ save: infuse(save, gearUid, element) })),
      salvage: (gearUid) => set(({ save }) => ({ save: salvage(save, gearUid) })),
      equip: (heroId, slot, id) =>
        set(({ save }) => ({
          save: advanceTutorial(id ? equip(save, heroId, slot, id) : unequip(save, heroId, slot)),
        })),
      // Notifications follow the save: see `useNotifications`.
      dismissHero: (heroId) => set(({ save }) => ({ save: dismissHero(save, heroId) })),
      recruit: (offer, tavern, player) => set(({ save }) => ({ save: recruit(save, offer, tavern, player) })),
      closeTavernHint: () => set(({ save }) => ({ save: { ...save, tavernHintSeen: true } })),
      buyRank: (trackId) => set(({ save }) => ({ save: buyRank(save, trackId) })),
      train: () => set(({ save }) => ({ save: applyTraining(save, Date.now()) })),
      startExpedition: (dungeonId, heroIds, durationScale) =>
        set(({ save }) => ({
          save: advanceTutorial(startExpedition(save, dungeonId, heroIds, Date.now(), durationScale, currentRotation())),
        })),
      resolveDue: () => {
        const now = Date.now();
        const debug = useDebugStore.getState();
        const force = debug.forcedMainReward ?? undefined;
        const { save, reports } = resolveDue(get().save, now, { force });
        if (force && reports.some((r) => r.success)) debug.set({ forcedMainReward: null });
        // Also the moment to drop expired maps, lures and used Sanctums.
        const pruned = pruneExpired(save, now);
        if (reports.length > 0 || pruned !== get().save) set({ save: advanceTutorial(pruned) });
        return reports;
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
            gear: [...save.gear, { uid: `g${save.nextUid}`, itemId, quality, ...(element ? { element } : {}) }],
            nextUid: save.nextUid + 1,
          },
        })),
      resetFirstClears: () => set(({ save }) => ({ save: { ...save, firstClears: [] } })),
      addCharters: (amount) => set(({ save }) => ({ save: { ...save, charters: save.charters + amount } })),
      setGuildRank: (trackId, rank) => set(({ save }) => ({ save: { ...save, guild: { ...save.guild, [trackId]: rank } } })),
      resetGuild: () => set(({ save }) => ({ save: { ...save, guild: {} } })),
      addHero: (classId, level, trait) =>
        set(({ save }) => ({
          save: learnWeaponTypes(
            {
              ...save,
              heroes: [...save.heroes, newHero(`h${save.nextUid}`, `Debug ${classId}`, classId, trait, level)],
              nextUid: save.nextUid + 1,
            },
            classId,
          ),
        })),
      addLure: () => set(({ save }) => ({ save: { ...save, lures: save.lures + 1 } })),
      resetSanctums: () => set(({ save }) => ({ save: { ...save, usedSanctums: {}, sigilPity: 0 } })),
      fastForwardExpeditions: () => {
        set(({ save }) => ({ save: fastForward(save, Date.now()) }));
        get().resolveDue();
      },
      resetSave: () => {
        set({ save: createInitialSave() });
      },
    }),
    {
      name: 'pocket-quartermaster-save',
      version: 9,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ save: state.save }),
      // Saves from version 5 on are converted step by step; older ones start fresh. New fields get their defaults.
      migrate: (persisted, version) => {
        const old = (persisted as { save?: Parameters<typeof migrateV5Save>[0] } | undefined)?.save;
        if (!old || version < 5) return { save: createInitialSave() };
        let save: SaveData = version === 5 ? migrateV5Save(old) : (old as SaveData);
        if (version <= 6) save = migrateV6Save(save);
        if (version <= 7) save = migrateV7Save(save);
        return { save: migrateV8Save(save) };
      },
      merge: (persisted, current) => ({
        ...current,
        save: { ...createInitialSave(), ...(persisted as { save?: Partial<SaveData> } | undefined)?.save },
      }),
    },
  ),
);
