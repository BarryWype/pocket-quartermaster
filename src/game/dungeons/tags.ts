import { mobById, mobTags } from '@/content/enemies';
import { TAG_ORDER, tagRules } from '@/content/rotation';

import type { DungeonDef, EncounterDef, Tag } from '../types';

type Rules = typeof tagRules;

/** The tags of one encounter: a fight's share of mobs per tag, or the trap, obstacle or locals tag. */
export function encounterTags(encounter: EncounterDef): Partial<Record<Tag, number>> {
  switch (encounter.type) {
    case 'fight': {
      const total = encounter.mobs.reduce((sum, g) => sum + g.count, 0);
      const shares: Partial<Record<Tag, number>> = {};
      for (const { mobId, count } of encounter.mobs) {
        for (const tag of mobTags(mobById[mobId])) shares[tag] = (shares[tag] ?? 0) + count / total;
      }
      return shares;
    }
    case 'trap':
      return encounter.element ? { trap: 1, [encounter.element]: 1 } : { trap: 1 };
    case 'obstacle':
      return { obstacle: 1 };
    case 'locals':
      return { locals: 1 };
    default:
      return {};
  }
}

/** How much of each tag a dungeon has, from its encounter weights and its boss. */
export function dungeonTagWeights(dungeon: DungeonDef, rules: Rules = tagRules): Partial<Record<Tag, number>> {
  const weights: Partial<Record<Tag, number>> = {};
  for (const encounter of dungeon.encounters) {
    for (const [tag, share] of Object.entries(encounterTags(encounter)) as [Tag, number][]) {
      weights[tag] = (weights[tag] ?? 0) + share * encounter.weight;
    }
  }
  for (const tag of mobTags(dungeon.boss)) weights[tag] = (weights[tag] ?? 0) + rules.bossWeight;
  return weights;
}

/** The dungeon's main tags, strongest first: what the card shows and what counters look at. */
export function dungeonTags(dungeon: DungeonDef, rules: Rules = tagRules): Tag[] {
  const weights = dungeonTagWeights(dungeon, rules);
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  return TAG_ORDER.filter((tag) => (weights[tag] ?? 0) > 0 && (weights[tag] ?? 0) >= total * rules.minShare)
    .sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0) || TAG_ORDER.indexOf(a) - TAG_ORDER.indexOf(b))
    .slice(0, rules.maxShown);
}

/** The strongest tag; two dungeons open on the same day must not share it. */
export const mainTag = (dungeon: DungeonDef) => dungeonTags(dungeon)[0] ?? null;
