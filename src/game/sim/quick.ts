import { dungeons } from '@/content/dungeons';
import { items } from '@/content/items';
import { placeFightRules, type FightPlaceKind } from '@/content/placeFights';
import { bossWeaknesses } from '@/content/weaknesses';

import { briefingFor, dailyRotation, rotationDay } from '../dungeons/rotation';
import { isDungeonAvailable } from '../expeditions/expeditions';
import { estimateOdds } from '../expeditions/odds';
import { EMPTY_BRIEFING } from '../expeditions/simulate';
import { placesWithin } from '../places/generate';
import { placeFightBriefing, placeFightDungeon } from '../places/fights';
import { PATROL_KINDS, patrolsAround } from '../patrols/generate';
import { patrolOdds } from '../patrols/fight';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import type { ConsumableDef } from '../types';
import { highestTier, withLoadout } from './bot';
import { expectedLevels, simConfig, type SimConfig } from './config';
import { fillPotions } from './rules/loadout';

const DAY = 86_400_000;
const NOON = 12 * 3_600_000;

/** One tier's means, or null where nothing was sampled. */
export type QuickTier = {
  tier: number;
  /** Open normal dungeons, prepared (kits, weakness item, potions). */
  prepared: number | null;
  /** The same dungeons with the briefing skipped when the party was picked (potions only). */
  notPrepared: number | null;
  /** The tier boss, prepared. */
  boss: number | null;
  /** Fight events around, prepared. */
  events: number | null;
  /** Patrols around, potions only. */
  patrols: number | null;
  /** Samples behind each mean (`notPrepared` counts as `normal`). */
  samples: { normal: number; boss: number; events: number; patrols: number };
};

/**
 * The reference team the dungeons are fitted to (see the comment above
 * TIER_SCALE): the starting trio in the tier's sword, bow and wand plus mail,
 * Normal quality, at the top of the tier's level band; every lower tier's
 * dungeons cleared (so this tier is unlocked), stocked with every kit, every
 * boss weakness item and three healing potions.
 */
function quickSave(tier: number): SaveData {
  const initial = createInitialSave();
  let save: SaveData = {
    ...initial,
    tutorial: { ...initial.tutorial, step: 'done' },
    heroes: initial.heroes.map((h) => ({ ...h, level: expectedLevels[tier - 1] })),
    gear: [`sword${tier}`, `bow${tier}`, `wand${tier}`, `mail${tier}`, `mail${tier}`, `mail${tier}`].map((itemId, i) => ({ uid: `g${i}`, itemId, quality: 'normal' as const })),
  };
  save.heroes.forEach((hero, i) => {
    save = equip(equip(save, hero.id, 'weapon', `g${i}`), hero.id, 'armor', `g${i + 3}`);
  });
  const kits = items.filter((i): i is ConsumableDef => i.slot === 'consumable' && !!i.kit);
  const next: SaveData = {
    ...save,
    clearedDungeons: dungeons.filter((d) => d.tier < tier).map((d) => d.id),
    consumables: {
      ...save.consumables,
      healingPotion: 3,
      ...Object.fromEntries(kits.map((k) => [k.id, 2])),
      ...Object.fromEntries(bossWeaknesses.map((w) => [w.itemId, 1])),
    },
  };
  if (highestTier(next) !== tier) throw new Error(`Tier ${tier} is not the highest unlocked one`);
  return next;
}

const mean = (values: number[]): number | null => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null);

/**
 * The odds-only probe (`npm run sim:quick`): for each tier, the reference team
 * against that tier's open normal dungeons (prepared and with the briefing
 * skipped), its boss, the fight events and the patrols around the reference
 * location, once per rotation day at noon. No full game, no rewards.
 */
export function quickProbe(config: SimConfig = simConfig): QuickTier[] {
  const runs = config.quick.runs;
  return [1, 2, 3, 4, 5].map((tier) => {
    const save = quickSave(tier);
    const ids = save.heroes.map((h) => h.id);
    const prepared: number[] = [];
    const plain: number[] = [];
    const boss: number[] = [];
    const events: number[] = [];
    const patrols: number[] = [];
    for (let day = 0; day < config.quick.days; day++) {
      const t = config.startDay + day * DAY + NOON;
      const rotation = dailyRotation(rotationDay(t));

      for (const dungeon of dungeons.filter((d) => d.tier === tier && !d.isBoss && !d.overnight && isDungeonAvailable(save, d, rotation))) {
        const briefing = briefingFor(rotation, dungeon);
        prepared.push(estimateOdds(withLoadout(save, ids, dungeon, briefing), ids, dungeon, runs, { now: t, briefing }).success);
        plain.push(estimateOdds(withLoadout(save, ids, dungeon, EMPTY_BRIEFING), ids, dungeon, runs, { now: t, briefing }).success);
      }

      const bossDungeon = dungeons.find((d) => d.tier === tier && d.isBoss && !d.overnight);
      if (bossDungeon) {
        const briefing = briefingFor(rotation, bossDungeon);
        boss.push(estimateOdds(withLoadout(save, ids, bossDungeon, briefing), ids, bossDungeon, runs, { now: t, briefing }).success);
      }

      const places = placesWithin(config.location, 2000, t);
      for (const kind of Object.keys(placeFightRules.kinds) as FightPlaceKind[]) {
        const spawn = places.find((p) => p.kind === kind);
        if (!spawn) continue;
        const dungeon = placeFightDungeon(spawn, tier);
        const briefing = placeFightBriefing(save, spawn);
        events.push(estimateOdds(withLoadout(save, ids, dungeon, briefing), ids, dungeon, runs, { now: t, briefing }).success);
      }

      const armed = fillPotions(save, ids);
      for (const kind of PATROL_KINDS) {
        const spawn = patrolsAround(config.location, t).find((p) => p.kind === kind && p.tierRoll === 'current');
        if (!spawn) continue;
        patrols.push(patrolOdds(armed, spawn, ids, t, runs).success);
      }
    }
    return {
      tier,
      prepared: mean(prepared),
      notPrepared: mean(plain),
      boss: mean(boss),
      events: mean(events),
      patrols: mean(patrols),
      samples: { normal: prepared.length, boss: boss.length, events: events.length, patrols: patrols.length },
    };
  });
}
