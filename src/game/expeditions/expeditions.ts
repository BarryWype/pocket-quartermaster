import { expeditionRules } from '@/content/dungeons';
import { heroClasses } from '@/content/heroes';
import { dungeonById, itemById, recipeById } from '@/content/lookup';

import { unlockRecipe } from '../crafting/crafting';
import { createRng } from '../generation/rng';
import { addMaterials } from '../inventory';
import type { SaveData } from '../save';
import { addXp, heroPower, heroStats, isOnExpedition } from '../team/team';
import { rollLoot } from '../rewards/loot';
import type { ActiveExpedition, DungeonDef, ExpeditionReport, HeroState } from '../types';
import { buildLog, type LogInput } from './log';

type Rules = typeof expeditionRules;

function consumableOf(hero: HeroState) {
  const item = hero.equipment.consumable ? itemById[hero.equipment.consumable] : null;
  return item?.slot === 'consumable' ? item : null;
}

export function isProtected(hero: HeroState, dungeon: DungeonDef) {
  if (!dungeon.hazard) return true;
  if (heroClasses[hero.classId].resists?.includes(dungeon.hazard)) return true;
  return consumableOf(hero)?.protectsAgainst === dungeon.hazard;
}

/** Sum of hero power, reduced by unprotected hazards, plus consumable bonuses. */
export function teamPower(save: SaveData, heroIds: string[], dungeon: DungeonDef, rules: Rules = expeditionRules) {
  return save.heroes
    .filter((hero) => heroIds.includes(hero.id))
    .reduce((total, hero) => {
      const power = heroPower(heroStats(save, hero)) * (isProtected(hero, dungeon) ? 1 : rules.hazardPenalty);
      return total + power + (consumableOf(hero)?.power ?? 0);
    }, 0);
}

/** 50% when power equals difficulty, rising or falling along a logistic curve. */
export function successChance(power: number, difficulty: number, rules: Rules = expeditionRules) {
  const chance = 1 / (1 + Math.exp(-rules.steepness * (power / difficulty - 1)));
  return Math.min(rules.maxSuccessChance, Math.max(rules.minSuccessChance, chance));
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
    endsAt: now + dungeon.durationMinutes * 60_000 * durationScale,
    seed: `${id}:${now}`,
    notificationId: null,
  };
  return { ...save, expeditions: [...save.expeditions, expedition], nextUid: save.nextUid + 1 };
}

/** Applies an expedition's outcome: rewards, XP, wear, used consumables and a report. */
export function resolveExpedition(
  save: SaveData,
  expedition: ActiveExpedition,
  rules: Rules = expeditionRules,
): { save: SaveData; report: ExpeditionReport } {
  const dungeon = dungeonById[expedition.dungeonId];
  const rng = createRng(expedition.seed);
  const party = save.heroes.filter((h) => expedition.heroIds.includes(h.id));

  const success = rng.next() < successChance(teamPower(save, expedition.heroIds, dungeon, rules), dungeon.difficulty, rules);

  const gold = success ? rng.int(dungeon.gold[0], dungeon.gold[1]) : 0;
  const rolledLoot = rollLoot(rng, dungeon.loot);
  const materials = success ? rolledLoot : [];
  let recipeId: string | null = null;
  for (const drop of dungeon.recipeDrops) {
    const dropped = rng.chance(drop.chance);
    if (success && dropped && !recipeId && !save.knownRecipes.includes(drop.recipeId)) recipeId = drop.recipeId;
  }
  const xp = success ? dungeon.xp : Math.round(dungeon.xp * rules.failureXpShare);

  const gearEvents: LogInput['gearEvents'] = [];
  const brokenUids = new Set<string>();
  let gear = save.gear;
  for (const hero of party) {
    for (const slot of ['weapon', 'armor'] as const) {
      const piece = gear.find((g) => g.uid === hero.equipment[slot]);
      if (!piece) continue;
      const item = itemById[piece.itemId];
      if (item.slot === 'consumable') continue;
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

  const consumablesUsed = party.flatMap((hero) => (hero.equipment.consumable ? [hero.equipment.consumable] : []));
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

  const log = buildLog(
    {
      dungeon,
      heroes: party.map((hero) => {
        const weapon = save.gear.find((g) => g.uid === hero.equipment.weapon);
        return { name: hero.name, classId: hero.classId, weaponName: weapon ? itemById[weapon.itemId].name : null };
      }),
      consumables: party.flatMap((hero) => {
        const item = consumableOf(hero);
        return item ? [{ heroName: hero.name, itemName: item.name }] : [];
      }),
      hazardHit: party.filter((hero) => !isProtected(hero, dungeon)).map((hero) => hero.name),
      gearEvents,
      success,
      gold,
      recipeItemName: recipeId ? itemById[recipeById[recipeId].itemId].name : null,
    },
    rng,
  );

  const report: ExpeditionReport = {
    id: expedition.id,
    dungeonId: dungeon.id,
    heroIds: expedition.heroIds,
    finishedAt: expedition.endsAt,
    success,
    gold,
    materials,
    recipeId,
    xp,
    consumablesUsed,
    brokenGear: save.gear.filter((g) => brokenUids.has(g.uid)).map((g) => g.itemId),
    log,
    seen: false,
  };

  let next: SaveData = {
    ...save,
    gold: save.gold + gold,
    materials: addMaterials(save.materials, materials),
    gear: gear.filter((g) => !brokenUids.has(g.uid)),
    heroes,
    expeditions: save.expeditions.filter((e) => e.id !== expedition.id),
    reports: [report, ...save.reports].slice(0, rules.reportsKept),
  };
  if (recipeId) next = unlockRecipe(next, recipeId);
  return { save: next, report };
}

/** Resolves every expedition whose timer has ended, oldest first. */
export function resolveDue(save: SaveData, now: number): { save: SaveData; reports: ExpeditionReport[] } {
  const due = save.expeditions.filter((e) => e.endsAt <= now).sort((a, b) => a.endsAt - b.endsAt);
  return due.reduce<{ save: SaveData; reports: ExpeditionReport[] }>(
    (acc, expedition) => {
      const { save: next, report } = resolveExpedition(acc.save, expedition);
      return { save: next, reports: [...acc.reports, report] };
    },
    { save, reports: [] },
  );
}

/** Moves every running expedition's end time to now (debug). */
export function fastForward(save: SaveData, now: number): SaveData {
  return { ...save, expeditions: save.expeditions.map((e) => ({ ...e, endsAt: Math.min(e.endsAt, now) })) };
}
