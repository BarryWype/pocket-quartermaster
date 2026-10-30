import { gearProfiles } from '@/content/equipment';
import { heroClasses } from '@/content/heroes';
import { items } from '@/content/items';
import { itemById, opportunityById, recipeById, restrictionById, threatById } from '@/content/lookup';
import { rosterRules } from '@/content/roster';
import { dungeonThreats, narrowPartySize, surges, threatRules, type ThreatRules } from '@/content/threats';
import { traits } from '@/content/traits';
import { mobById } from '@/content/enemies';
import { mobTags } from '../enemies/tags';

import { createRng, type Rng } from '../generation/rng';
import type {
  ActiveThreat,
  Briefing,
  ConsumableDef,
  DungeonDef,
  GearType,
  HeroClassId,
  KitEffect,
  OpportunityId,
  RestrictionId,
  ThreatId,
  ThreatLevel,
} from '../types';
import { heroAnswers, type AnswersMember, type HeroAnswers } from './answers';
import { approachScore } from './score';

const kitItems: { itemId: string; effect: KitEffect }[] = items.flatMap((item) =>
  item.slot === 'consumable' && item.kit ? [{ itemId: item.id, effect: item.kit }] : [],
);

/** The tier a kit's recipe becomes available at (unlocked recipes count as tier 1). */
const kitFromTier = (itemId: string) => recipeById[itemId]?.availableFromTier ?? 1;

/** The lowest tier at which some kit answers the threat; null when no kit does. */
export function kitTier(id: ThreatId): number | null {
  const tiers = kitItems.filter((kit) => kit.effect.threats.includes(id)).map((kit) => kitFromTier(kit.itemId));
  return tiers.length > 0 ? Math.min(...tiers) : null;
}

/** Whether two threats are answered by the same kit: never both in one briefing. */
const sharesKit = (a: ThreatId, b: ThreatId) =>
  kitItems.some((kit) => kit.effect.threats.includes(a) && kit.effect.threats.includes(b));

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
 * What a dungeon shows today: threats drawn from its table (first-tier gated,
 * at most one obstacle, never two sharing a kit, locals only where its pool
 * has a locals encounter), an opportunity from tier 2 on, and from tier 4 a
 * restriction on some days — never on overnight expeditions, which read their
 * `overnight` flag here. Same day, same briefing for everyone.
 */
export function composeBriefing(dungeon: DungeonDef, day: number, rules: ThreatRules = threatRules): Briefing {
  const rng = createRng(`threats|${day}|${dungeon.id}`);
  const table = dungeonThreats[dungeon.id] ?? { weights: {} };
  const hasLocals = dungeon.encounters.some((e) => e.type === 'locals');
  const count = rules.compose.threatCount[dungeon.tier - 1];

  let eligible = (Object.entries(table.weights) as [ThreatId, number][])
    .filter(([id]) => threatById[id].firstTier <= dungeon.tier && (id !== 'locals' || hasLocals))
    .map(([id, weight]) => {
      const kit = kitTier(id);
      // A threat drawn before its kit's tier is rarer and capped at level 1.
      const beforeKit = kit !== null && kit > dungeon.tier;
      const tierWeight = rules.compose.tierWeights[dungeon.tier]?.[id] ?? 1;
      return { id, weight: weight * tierWeight * (beforeKit ? rules.compose.beforeKitWeight : 1), beforeKit };
    });

  const threats: ActiveThreat[] = [];
  while (threats.length < count && eligible.length > 0) {
    const pick = rng.weighted(eligible, (e) => e.weight);
    // A draw the briefing rejects is set aside, and another taken.
    eligible = eligible.filter((e) => e.id !== pick.id);
    const def = threatById[pick.id];
    const secondObstacle = def.category === 'obstacle' && threats.some((t) => threatById[t.id].category === 'obstacle');
    if (secondObstacle || threats.some((t) => sharesKit(t.id, pick.id))) continue;
    const max = pick.beforeKit ? 1 : maxThreatLevel(dungeon.tier, def.firstTier);
    threats.push({
      id: pick.id,
      level: rollLevel(rng, max, rules),
      ...(pick.id === 'element' && table.element ? { element: table.element } : {}),
    });
  }

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
      if (restrictionKeepsAnswers(threats, pick, possibleMembers(dungeon.tier), rules)) {
        restriction = pick;
        break;
      }
    }
  }

  return { threats, restriction, opportunity };
}

const possibleMembersCache = new Map<number, AnswersMember[]>();
const kitTopTier = Math.max(...kitItems.map((kit) => kitFromTier(kit.itemId)));

/**
 * Every hero shape that could be fielded: class, gear and kit combinations,
 * with the traits that add a keyword or a positive approach. Gear enters one
 * piece at a time (a keyword counts once per hero, gear only adds), so every
 * answer stays within reach. Only kits craftable at the tier can be held.
 * Restrictions then play against each shape through `heroAnswers`.
 */
export function possibleMembers(tier: number): AnswersMember[] {
  const cached = possibleMembersCache.get(tier);
  if (cached) return cached;
  const usefulTraits = [
    'none',
    ...traits
      .filter((t) => t.effects.some((e) => e.kind === 'keyword' || (e.kind === 'approach' && e.add > 0)))
      .map((t) => t.id),
  ];
  const gearTypes = [...Object.keys(gearProfiles) as GearType[], null];
  const members: AnswersMember[] = [];
  for (const classId of Object.keys(heroClasses) as HeroClassId[]) {
    const classResists = heroClasses[classId].resists ?? [];
    for (const gearType of gearTypes) {
      // One piece of this type: its keywords, marked when the piece rolls with Magic.
      const profile = gearType ? gearProfiles[gearType] : null;
      const gearKeywords = profile
        ? profile.keywords.map((keyword) => ({ keyword, magic: profile.damageStat === 'magic' }))
        : [];
      for (const kit of [null, ...kitItems.filter((k) => kitFromTier(k.itemId) <= tier)]) {
        const salveElement = kit ? ((itemById[kit.itemId] as ConsumableDef).protectsAgainst ?? null) : null;
        for (const traitId of usefulTraits) {
          members.push({
            heroId: `${classId}:${gearType ?? 'unarmed'}:${kit?.itemId ?? 'noKit'}:${traitId}`,
            classId,
            traitId,
            gearKeywords,
            kit,
            salveElement,
            classResists,
          });
        }
      }
    }
  }
  possibleMembersCache.set(tier, members);
  return members;
}

/**
 * Whether a restriction leaves every drawn threat answerable: some class,
 * trait, gear or kit must still answer each one. Narrow passages also
 * rejects a keyword threat that needs more heroes than the party may hold.
 */
export function restrictionKeepsAnswers(
  threats: ActiveThreat[],
  restriction: RestrictionId | null,
  members: AnswersMember[] = possibleMembers(kitTopTier),
  rules: ThreatRules = threatRules,
) {
  if (
    restriction === 'narrowPassages' &&
    threats.some((t) => {
      const def = threatById[t.id];
      return def.answer.kind === 'keyword' && rules.levels.keyword[t.level - 1] > narrowPartySize(rosterRules.partySize);
    })
  ) {
    return false;
  }
  const answers = answersUnder(members, restriction);
  return threats.every((threat) => answerable(threat, answers, rules));
}

const answersCache = new WeakMap<AnswersMember[], Map<RestrictionId | null, HeroAnswers[]>>();

/** Every possible hero's answers under a restriction; each tier's full set is worked out once per restriction. */
function answersUnder(members: AnswersMember[], restriction: RestrictionId | null) {
  if (![...possibleMembersCache.values()].includes(members)) return members.map((member) => heroAnswers(member, restriction));
  const byRestriction = answersCache.get(members) ?? new Map<RestrictionId | null, HeroAnswers[]>();
  answersCache.set(members, byRestriction);
  if (!byRestriction.has(restriction)) byRestriction.set(restriction, members.map((member) => heroAnswers(member, restriction)));
  return byRestriction.get(restriction)!;
}

/** Whether some possible hero answers the threat, kit bonuses included. */
function answerable(threat: ActiveThreat, answers: HeroAnswers[], rules: ThreatRules) {
  const def = threatById[threat.id];
  const { answer } = def;
  if (answer.kind === 'approach') {
    const needed = rules.levels.approach[threat.level - 1];
    return answers.some((a) => approachScore(a, threat.id, answer.approach, true) >= needed);
  }
  if (answer.kind === 'keyword') {
    return answers.some((a) => a.keywords.some((k) => k.keyword === answer.keyword));
  }
  return answers.some((a) => a.resists.includes(threat.element!));
}

export type Surge = { dungeonId: string; threatId: ThreatId };

/**
 * The day's surge for one tier: a 30% chance one of the open dungeons gets
 * its undead, traps or beasts threat raised. The dungeon is picked uniformly;
 * its first matching threat is the one raised.
 */
export function rollSurge(
  day: number,
  tier: number,
  briefings: Record<string, Briefing>,
  rules: ThreatRules = threatRules,
): Surge | null {
  const rng = createRng(`surge|${day}|${tier}`);
  if (!rng.chance(rules.compose.surgeChance)) return null;
  const candidates = Object.keys(briefings).filter((id) => briefings[id].threats.some((t) => surges[t.id]));
  if (candidates.length === 0) return null;
  const dungeonId = rng.weighted(candidates, () => 1);
  const threat = briefings[dungeonId].threats.find((t) => surges[t.id])!;
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
