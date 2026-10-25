import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { dungeonById, recipeById } from '@/content/lookup';
import { materials } from '@/content/materials';
import { craft } from '@/game/crafting/crafting';
import { fastForward, resolveDue, startExpedition } from '@/game/expeditions/expeditions';
import { collectSpawn, type CollectResult, type Gatherer } from '@/game/gathering/gathering';
import type { Spawn } from '@/game/generation/types';
import { addMaterials } from '@/game/inventory';
import { dayKey, openChest, recordSteps, syncSteps, type ChestReward } from '@/game/rewards/chests';
import { createInitialSave, type SaveData } from '@/game/save';
import { equip, unequip } from '@/game/team/team';
import type { EquipmentSlot, ExpeditionReport } from '@/game/types';
import { deviceNotifications } from '@/services/notifications';

type GameState = {
  save: SaveData;
  collect: (spawn: Spawn, gatherer: Gatherer, timeMs: number) => CollectResult;
  craft: (recipeId: string) => void;
  /** Pass null to empty the slot. */
  equip: (heroId: string, slot: EquipmentSlot, id: string | null) => void;
  startExpedition: (dungeonId: string, heroIds: string[], durationScale: number) => Promise<void>;
  resolveDue: () => ExpeditionReport[];
  markReportsSeen: () => void;
  recordSteps: (day: string, newSteps: number) => void;
  syncSteps: (day: string, total: number) => void;
  openChest: (chestId: string, steps: number) => ChestReward;
  // Debug
  addGold: (amount: number) => void;
  addAllMaterials: (amount: number) => void;
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
        if (result.ok) set({ save: result.save });
        return result;
      },
      craft: (recipeId) => set(({ save }) => ({ save: craft(save, recipeById[recipeId]) })),
      equip: (heroId, slot, id) =>
        set(({ save }) => ({ save: id ? equip(save, heroId, slot, id) : unequip(save, heroId, slot) })),
      startExpedition: async (dungeonId, heroIds, durationScale) => {
        const save = startExpedition(get().save, dungeonId, heroIds, Date.now(), durationScale);
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
        const { save, reports } = resolveDue(get().save, Date.now());
        if (reports.length > 0) set({ save });
        return reports;
      },
      markReportsSeen: () =>
        set(({ save }) => ({ save: { ...save, reports: save.reports.map((r) => ({ ...r, seen: true })) } })),
      recordSteps: (day, newSteps) => set(({ save }) => ({ save: recordSteps(save, day, newSteps) })),
      syncSteps: (day, total) => set(({ save }) => ({ save: syncSteps(save, day, total) })),
      openChest: (chestId, steps) => {
        const { save, reward } = openChest(get().save, chestId, steps, dayKey(new Date()));
        set({ save });
        return reward;
      },
      addGold: (amount) => set(({ save }) => ({ save: { ...save, gold: save.gold + amount } })),
      addAllMaterials: (amount) =>
        set(({ save }) => ({
          save: {
            ...save,
            materials: addMaterials(save.materials, materials.map((m) => ({ materialId: m.id, amount }))),
          },
        })),
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
      version: 3,
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
