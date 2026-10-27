import { chests } from '@/content/chests';
import { expeditionRules } from '@/content/dungeons';
import { elementRules } from '@/content/elements';
import { forgeRules, masteryRules, salvageRules } from '@/content/forging';
import { guildRules, guildTrackById } from '@/content/guild';
import { healthRules } from '@/content/health';
import { heroClasses, xpRules } from '@/content/heroes';
import { dungeonById, itemById, recipeById } from '@/content/lookup';
import { mainRewardRules } from '@/content/mainRewards';
import { provisionRules } from '@/content/provisions';
import { recruitRules, rosterRules } from '@/content/roster';
import { firstClearRules, rotationRules } from '@/content/rotation';
import { sanctumRules } from '@/content/sanctums';
import { tavernRules } from '@/content/taverns';
import { treasureRules } from '@/content/treasure';

import { profiles, simConfig } from './config';
import { targets } from './targets';

/** Where `--set` paths start. Each is the live content object, so the game functions see the change. */
const roots: Record<string, unknown> = {
  guild: guildTrackById,
  guildRules,
  dungeons: dungeonById,
  expedition: expeditionRules,
  recipes: recipeById,
  items: itemById,
  heroes: heroClasses,
  xp: xpRules,
  health: healthRules,
  provisions: provisionRules,
  recruit: recruitRules,
  roster: rosterRules,
  taverns: tavernRules,
  forge: forgeRules,
  mastery: masteryRules,
  salvage: salvageRules,
  mainRewards: mainRewardRules,
  chests: Object.fromEntries(chests.map((c) => [c.id, c])),
  treasure: treasureRules,
  sanctums: sanctumRules,
  rotation: rotationRules,
  firstClear: firstClearRules,
  elements: elementRules,
  sim: simConfig,
  profiles,
  targets,
};

export type Override = { path: string; value: number | boolean };

/** Parses `guild.gold.baseCost=80`. */
export function parseOverride(text: string): Override {
  const [path, raw] = text.split('=');
  if (!path || raw === undefined) throw new Error(`Expected path=value, got "${text}"`);
  if (raw === 'true' || raw === 'false') return { path, value: raw === 'true' };
  const value = Number(raw);
  if (Number.isNaN(value)) throw new Error(`Only numbers and booleans can be set: "${text}"`);
  return { path, value };
}

/**
 * Sets each value in place and returns a function that puts the old values
 * back. Only existing numeric or boolean values can be changed. Values copied
 * when a module loads (e.g. the lure duration) don't follow.
 */
export function applyOverrides(overrides: Override[]): () => void {
  const undo: (() => void)[] = [];
  for (const { path, value } of overrides) {
    const keys = path.split('.');
    let target: unknown = roots;
    for (const key of keys.slice(0, -1)) {
      target = (target as Record<string, unknown> | undefined)?.[key];
      if (typeof target !== 'object' || target === null) throw new Error(`Unknown path ${path}`);
    }
    const object = target as Record<string, unknown>;
    const last = keys[keys.length - 1];
    const old = object[last];
    if (typeof old !== typeof value) throw new Error(`${path} is ${old === undefined ? 'unknown' : `a ${typeof old}`}, not a ${typeof value}`);
    object[last] = value;
    undo.unshift(() => {
      object[last] = old;
    });
  }
  return () => undo.forEach((restore) => restore());
}
