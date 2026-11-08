import { familyOfThreat } from '@/content/families';
import { heroClasses } from '@/content/heroes';
import { opportunityById, restrictionById, threatById } from '@/content/lookup';
import { rosterRules } from '@/content/roster';
import { classAffinities, gearProfiles, type Affinity } from '@/content/equipment';
import { dungeonThreats, narrowPartySize, surges, threatRules, type ThreatRules } from '@/content/threats';
import { mobById } from '@/content/enemies';
import { mobTags } from '../enemies/tags';

import type { FamilyId } from '@/content/families';
import { createRng, type Rng } from '../generation/rng';
import type {
  ActiveThreat,
  Briefing,
  DungeonDef,
  GearType,
  HeroClassId,
  OpportunityId,
  RestrictionId,
  ThreatId,
  ThreatLevel,
} from '../types';

/** The highest level a threat reaches in a dungeon: one more per tier above its first. */
export const maxThreatLevel = (tier: number, firstTier: number): ThreatLevel =>
  Math.min(3, 1 + tier - firstTier) as ThreatLevel;

/** The threat's level: drawn among 1…max, the highest most likely (weights by rank from the top). */
function rollLevel(rng: Rng, max: number, rules: ThreatRules): ThreatLevel {
  const levels = Array.from({ length: max }, (_, i) => max - i);
  return rng.weighted(levels, (level) => rules.compose.levelWeights[max - level] ?? 0) as ThreatLevel;
}

/** Whether the dungeon's fights or its boss include a beast-tagged mob (for the Trophy beast opportunity). */
const hasBeasts = (dungeon: DungeonDef) =>
  dungeon.boss.tags.includes('beast') ||
  dungeon.encounters.some(
    (e) => e.type === 'fight' && e.mobs.some((group) => mobTags(mobById[group.mobId]).includes('beast')),
  );

/**
 * The dungeon's threats for a day, sharing composeBriefing's seeded stream:
 * the same seed and the same draw order, so the threats are the same.
 */
function rollThreats(dungeon: DungeonDef, day: number, salt: number, rules: ThreatRules): { threats: ActiveThreat[]; rng: Rng } {
  const rng = createRng(salt > 0 ? `threats|${day}|${dungeon.id}|${salt}` : `threats|${day}|${dungeon.id}`);
  const table = dungeonThreats[dungeon.id] ?? { weights: {} };
  const count = rules.compose.threatCount[dungeon.tier - 1];

  const eligible = (Object.entries(table.weights) as [ThreatId, number][])
    .filter(([id]) => threatById[id].firstTier <= dungeon.tier)
    .map(([id, weight]) => ({ id, weight: weight * (rules.compose.tierWeights[dungeon.tier]?.[id] ?? 1) }));

  const threats: ActiveThreat[] = [];
  while (threats.length < count && eligible.length > 0) {
    const pick = rng.weighted(eligible, (e) => e.weight);
    eligible.splice(eligible.indexOf(pick), 1);
    const def = threatById[pick.id];
    threats.push({
      id: pick.id,
      level: rollLevel(rng, maxThreatLevel(dungeon.tier, def.firstTier), rules),
      ...(pick.id === 'element' && table.element ? { element: table.element } : {}),
    });
  }
  return { threats, rng };
}

/**
 * The threats a dungeon shows today, without the opportunity and restriction
 * rolls: for callers that need only the threats (the rotation's surge). The
 * restriction roll is by far the briefing's most expensive part, and it can be
 * skipped wherever the rest of the briefing is never read.
 */
export function composeThreats(
  dungeon: DungeonDef,
  day: number,
  salt = 0,
  rules: ThreatRules = threatRules,
): ActiveThreat[] {
  return rollThreats(dungeon, day, salt, rules).threats;
}

/**
 * What a dungeon shows today: threats drawn from its table (first-tier gated),
 * an opportunity from tier 2 on, and from tier 4 a restriction on some days —
 * never on overnight expeditions, which read their `overnight` flag here. Same
 * day, same briefing for everyone.
 */
export function composeBriefing(dungeon: DungeonDef, day: number, salt = 0, rules: ThreatRules = threatRules): Briefing {
  const { threats, rng } = rollThreats(dungeon, day, salt, rules);

  let opportunity: OpportunityId | null = null;
  if (dungeon.tier >= rules.compose.opportunityFromTier) {
    const options = (Object.keys(opportunityById) as OpportunityId[]).filter(
      (id) => id !== 'trophyBeast' || hasBeasts(dungeon),
    );
    opportunity = options.length > 0 ? rng.weighted(options, (id) => opportunityById[id].weight ?? 1) : null;
  }

  let restriction: RestrictionId | null = null;
  if (dungeon.tier >= rules.compose.restrictionFromTier && !dungeon.overnight && rng.chance(rules.compose.restrictionChance)) {
    const candidates = Object.keys(restrictionById) as RestrictionId[];
    while (candidates.length > 0) {
      const pick = rng.weighted(candidates, () => 1);
      candidates.splice(candidates.indexOf(pick), 1);
      if (restrictionKeepsAnswers(threats, pick, rules)) {
        restriction = pick;
        break;
      }
    }
  }

  return { threats, restriction, opportunity };
}

const maxTagsCache = new Map<FamilyId, number>();

/**
 * The most tags of this family one hero can wear: their class's tag plus the
 * best weapon (its first or second tag), armour and off-hand of the family
 * their class can wear (a two-handed weapon counts 2 and takes the off-hand's
 * place).
 */
export function maxTagsPerHero(family: FamilyId): number {
  const cached = maxTagsCache.get(family);
  if (cached !== undefined) return cached;
  const best = (types: GearType[], twoHanded: boolean) =>
    Math.max(
      0,
      ...types
        .filter((type) => (twoHanded ? gearProfiles[type].twoHanded : !gearProfiles[type].twoHanded))
        .map((type) => (gearProfiles[type].twoHanded ? 2 : 1)),
    );
  let max = 0;
  for (const classId of Object.keys(heroClasses) as HeroClassId[]) {
    const def = heroClasses[classId];
    // Off-hands fit every class; weapons and armour by the class's affinities.
    const wearable = (type: GearType) =>
      gearProfiles[type].slot === 'offhand' || (classAffinities[classId] as Partial<Record<GearType, Affinity>>)[type] !== 'unfit';
    const ofFamily = (slot: 'weapon' | 'armor' | 'offhand') =>
      (Object.keys(gearProfiles) as GearType[]).filter(
        (type) =>
          gearProfiles[type].slot === slot &&
          (gearProfiles[type].familyTag === family || gearProfiles[type].secondFamily === family) &&
          wearable(type),
      );
    const classTag = def.familyTag === family ? 1 : 0;
    // A two-handed weapon counts 2 but leaves no hand for an off-hand.
    const hands = Math.max(best(ofFamily('weapon'), true), best(ofFamily('weapon'), false) + best(ofFamily('offhand'), false));
    max = Math.max(max, classTag + hands + best(ofFamily('armor'), false));
  }
  maxTagsCache.set(family, max);
  return max;
}

/**
 * Whether a restriction leaves every drawn threat answerable: the party must
 * be able to hold enough tags of each threat's family, one hero's best being
 * the ceiling. Only Narrow passages can break it, by shrinking the party.
 */
export function restrictionKeepsAnswers(
  threats: ActiveThreat[],
  restriction: RestrictionId | null,
  rules: ThreatRules = threatRules,
) {
  const size = restriction === 'narrowPassages' ? narrowPartySize(rosterRules.partySize) : rosterRules.partySize;
  return threats.every(
    (threat) => size * maxTagsPerHero(familyOfThreat(threat.id)) >= threat.level,
  );
}

export type Surge = { dungeonId: string; threatId: ThreatId };

/**
 * Whether the day's surge chance passes. rollSurge draws the same chance from
 * the same seed first, so composing threats only when this passes changes no
 * result — a rolled surge is still rolled when rollSurge runs.
 */
export function surgeRolled(day: number, tier: number, rules: ThreatRules = threatRules): boolean {
  return createRng(`surge|${day}|${tier}`).chance(rules.compose.surgeChance);
}

export function rollSurge(
  day: number,
  tier: number,
  threats: Record<string, ActiveThreat[]>,
  rules: ThreatRules = threatRules,
): Surge | null {
  const rng = createRng(`surge|${day}|${tier}`);
  if (!rng.chance(rules.compose.surgeChance)) return null;
  const candidates = Object.keys(threats).filter((id) => threats[id].some((t) => surges[t.id]));
  if (candidates.length === 0) return null;
  const dungeonId = rng.weighted(candidates, () => 1);
  const threat = threats[dungeonId].find((t) => surges[t.id])!;
  return { dungeonId, threatId: threat.id };
}

/** Raises a briefing's threat by one level, capped at 3, and marks it with the surge's name. */
export function withSurge(briefing: Briefing, threatId: ThreatId): Briefing {
  return {
    ...briefing,
    threats: briefing.threats.map((threat) =>
      threat.id !== threatId
        ? threat
        : { ...threat, level: Math.min(3, threat.level + 1) as ThreatLevel, surge: surges[threat.id] },
    ),
  };
}
