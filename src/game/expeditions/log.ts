import { logTemplates } from '@/content/logTemplates';

import type { Rng } from '../generation/rng';
import type { DungeonDef, HeroClassId } from '../types';

const MAX_LINES = 6;

export type LogInput = {
  dungeon: DungeonDef;
  heroes: { name: string; classId: HeroClassId; weaponName: string | null }[];
  consumables: { heroName: string; itemName: string }[];
  hazardHit: string[];
  gearEvents: { heroName: string; gearName: string; kind: 'cracked' | 'broken' }[];
  success: boolean;
  gold: number;
  recipeItemName: string | null;
};

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => String(vars[key] ?? match));
}

const pick = <T>(rng: Rng, list: readonly T[]) => list[rng.int(0, list.length - 1)];

/** A 3-6 line narrative of an expedition, built from templates. */
export function buildLog(input: LogInput, rng: Rng): string[] {
  const { dungeon } = input;
  const base = { dungeon: dungeon.name, boss: dungeon.boss, gold: input.gold };

  const actors = input.heroes
    .map((hero) => ({ hero, key: rng.next() }))
    .sort((a, b) => a.key - b.key)
    .slice(0, 2)
    .map(({ hero }) => hero);
  const actions = actors.map((hero) =>
    fill(pick(rng, logTemplates.heroAction[hero.classId]), {
      ...base,
      hero: hero.name,
      enemy: pick(rng, dungeon.enemies),
      weapon: hero.weaponName ? `the ${hero.weaponName.toLowerCase()}` : logTemplates.noWeapon,
    }),
  );
  const gear = input.gearEvents.map((event) =>
    fill(pick(rng, logTemplates[event.kind]), { ...base, hero: event.heroName, gear: event.gearName.toLowerCase() }),
  );
  const consumable = input.consumables.slice(0, 1).map((used) =>
    fill(pick(rng, logTemplates.consumable), { ...base, hero: used.heroName, consumable: used.itemName.toLowerCase() }),
  );
  const hazard = input.hazardHit.slice(0, 1).map((name) => fill(pick(rng, logTemplates.hazard), { ...base, hero: name }));

  const intro = fill(pick(rng, logTemplates.intro), base);
  const outcome = fill(pick(rng, input.success ? logTemplates.success : logTemplates.failure), base);
  const recipe = input.recipeItemName
    ? [fill(pick(rng, logTemplates.recipe), { ...base, item: input.recipeItemName.toLowerCase() })]
    : [];

  // Keep the most important lines when there are too many, then tell them in story order.
  const room = MAX_LINES - 2 - recipe.length;
  const kept = new Set([actions[0], ...gear, ...consumable, ...hazard, ...actions.slice(1)].slice(0, room));
  const middle = [...actions, ...hazard, ...consumable, ...gear].filter((line) => kept.has(line));
  return [intro, ...middle, outcome, ...recipe];
}
