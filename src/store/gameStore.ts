import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { dungeons } from '@/content/dungeons';
import { items } from '@/content/items';
import { dungeonById, recipeById } from '@/content/lookup';
import { materials } from '@/content/materials';
import { craft, unlockRecipe } from '@/game/crafting/crafting';
import { infuse, recycle } from '@/game/crafting/infusion';
import { convertShards, shardId, stoneId, type Element } from '@/game/elements';
import { fastForward, resolveDue, startExpedition } from '@/game/expeditions/expeditions';
import { collectSpawn, type CollectResult, type Gatherer } from '@/game/gathering/gathering';
import type { LatLng, Spawn } from '@/game/generation/types';
import { addMaterials } from '@/game/inventory';
import { dayKey, openChest, recordSteps, syncSteps, type ChestReward } from '@/game/rewards/chests';
import { activateLure } from '@/game/rewards/lures';
import { collectTreasure, readTreasureMap, type TreasureContents } from '@/game/rewards/treasure';
import { challengeSanctum, type SanctumResult, type SanctumSpawn } from '@/game/sanctums/sanctums';
import { createInitialSave, type SaveData } from '@/game/save';
import { equip, unequip } from '@/game/team/team';
import { advanceTutorial, finishTutorial, placeTutorialWood } from '@/game/tutorial/tutorial';
import { pruneExpired } from '@/game/upkeep';
import type { EquipmentSlot, ExpeditionReport } from '@/game/types';
import { deviceNotifications } from '@/services/notifications';

import { useDebugStore } from './debugStore';

type GameState = {
  save: SaveData;
  collect: (spawn: Spawn, gatherer: Gatherer, timeMs: number) => CollectResult;
  craft: (recipeId: string) => void;
  infuse: (gearUid: string, element: Element) => void;
  recycle: (gearUid: string) => void;
  /** Pass null to empty the slot. */
  equip: (heroId: string, slot: EquipmentSlot, id: string | null) => void;
  startExpedition: (dungeonId: string, heroIds: string[], durationScale: number) => Promise<void>;
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
  /** Closes the tutorial's last tip; from debug, skips the whole tutorial. */
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
  addLure: () => void;
  /** Forgets used Sanctums and the Sigil pity counter. */
  resetSanctums: () => void;
  fastForwardExpeditions: () => void;
  resetSave: () => void;
};

function cancelNotifications(save: SaveData) {
  for (const { notificationId } of save.expeditions) {
    if (notificationId) deviceNotifications.cancel(notificationId).catch(() => {});
  }
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      save: createInitialSave(),
      collect: (spawn, gatherer, timeMs) => {
        const result = collectSpawn(get().save, spawn, gatherer, timeMs);
        if (result.ok) set({ save: advanceTutorial(result.save) });
        return result;
      },
      craft: (recipeId) => set(({ save }) => ({ save: advanceTutorial(craft(save, recipeById[recipeId])) })),
      infuse: (gearUid, element) => set(({ save }) => ({ save: infuse(save, gearUid, element) })),
      recycle: (gearUid) => set(({ save }) => ({ save: recycle(save, gearUid) })),
      equip: (heroId, slot, id) =>
        set(({ save }) => ({
          save: advanceTutorial(id ? equip(save, heroId, slot, id) : unequip(save, heroId, slot)),
        })),
      startExpedition: async (dungeonId, heroIds, durationScale) => {
        const save = advanceTutorial(startExpedition(get().save, dungeonId, heroIds, Date.now(), durationScale));
        set({ save });
        const expedition = save.expeditions[save.expeditions.length - 1];
        const notificationId = await deviceNotifications
          .scheduleAt(
            new Date(expedition.endsAt),
            'Expedition finished',
            `Your heroes are back from ${dungeonById[dungeonId].name}.`,
          )
          .catch(() => null);
        set(({ save: current }) => ({
          save: {
            ...current,
            expeditions: current.expeditions.map((e) => (e.id === expedition.id ? { ...e, notificationId } : e)),
          },
        }));
      },
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
      addLure: () => set(({ save }) => ({ save: { ...save, lures: save.lures + 1 } })),
      resetSanctums: () => set(({ save }) => ({ save: { ...save, usedSanctums: {}, sigilPity: 0 } })),
      fastForwardExpeditions: () => {
        cancelNotifications(get().save);
        set(({ save }) => ({ save: fastForward(save, Date.now()) }));
        get().resolveDue();
      },
      resetSave: () => {
        cancelNotifications(get().save);
        set({ save: createInitialSave() });
      },
    }),
    {
      name: 'pocket-quartermaster-save',
      version: 5,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ save: state.save }),
      // Saves from older builds start fresh; new fields get their defaults.
      migrate: () => ({ save: createInitialSave() }),
      merge: (persisted, current) => ({
        ...current,
        save: { ...createInitialSave(), ...(persisted as { save?: Partial<SaveData> } | undefined)?.save },
      }),
    },
  ),
);
