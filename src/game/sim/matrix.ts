import { dungeons } from '@/content/dungeons';
import { classAffinities, gearProfiles } from '@/content/equipment';
import { heroClasses, newHero, startingHeroes } from '@/content/heroes';
import { items } from '@/content/items';
import type { DungeonDef, GearDef, HeroClassId, HeroState, Quality } from '@/game/types';

import { estimateOdds } from '../expeditions/odds';
import { heroAnswers, type AnswersMember } from '../threats/answers';
import { composeBriefing } from '../threats/compose';
import { scoreThreat } from '../threats/score';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import { expectedLevels, simConfig, type SimConfig } from './config';

const MATRIX_QUALITIES: Quality[] = ['crappy', 'normal', 'uncommon', 'rare'];

/** The day the matrix composes its briefings on: fixed, so the table is deterministic. */
const MATRIX_DAY = 0;

export type MatrixRow = {
  dungeonId: string;
  tier: number;
  boss: boolean;
  /** Success with the starting classes, by gear quality. */
  base: Record<string, number>;
  /** The same with the best threat-covering class swapped in, or null when none covers a drawn threat. */
  counter: { classId: HeroClassId; odds: Record<string, number> } | null;
};

/** The class's best weapon of a tier: a favoured type, first one found. */
function weaponFor(classId: HeroClassId, tier: number) {
  return items.find(
    (i): i is GearDef =>
      i.slot === 'weapon' && i.tier === tier && !!i.gearType && classAffinities[classId][i.gearType as keyof (typeof classAffinities)[HeroClassId]] === 'favoured',
  );
}

/** A reference member of a class, as threat scoring sees them. */
const memberOf = (classId: HeroClassId, tier: number): AnswersMember => {
  const gearType = weaponFor(classId, tier)?.gearType;
  const profile = gearType ? gearProfiles[gearType] : null;
  return {
    heroId: classId,
    classId,
    traitId: 'none',
    gearKeywords: profile
      ? profile.keywords.map((keyword) => ({ keyword, magic: profile.damageStat === 'magic' }))
      : [],
    kit: null,
    salveElement: null,
    classResists: heroClasses[classId].resists ?? [],
  };
};

/**
 * The classes whose answers turn one of the dungeon's drawn threats from
 * missed to met, that the starting trio misses (see threats/score.ts).
 */
function coveringClasses(dungeon: DungeonDef, base: HeroClassId[]): HeroClassId[] {
  const briefing = composeBriefing(dungeon, MATRIX_DAY);
  if (briefing.threats.length === 0) return [];
  const trio = base.map((classId) => heroAnswers(memberOf(classId, dungeon.tier), briefing.restriction));
  const missed = briefing.threats.filter((threat) => scoreThreat(threat, trio).state !== 'met');
  if (missed.length === 0) return [];
  return (Object.keys(heroClasses) as HeroClassId[]).filter((classId) => !base.includes(classId)).filter((classId) => {
    const offer = heroAnswers(memberOf(classId, dungeon.tier), briefing.restriction);
    return missed.some((threat) => scoreThreat(threat, [...trio, offer]).state === 'met');
  });
}

/**
 * The reference team for odds targets: these classes at a level, in a tier's
 * best weapons and armour at one quality, each with a healing potion, no traits.
 */
export function referenceTeam(classes: HeroClassId[], tier: number, quality: Quality, level: number): SaveData {
  const heroes: HeroState[] = classes.map((classId, i) => newHero(`h${i}`, classId, classId, '', level));
  const armour = items.find((i) => i.slot === 'armor' && i.tier === tier)!;
  let save: SaveData = {
    ...createInitialSave(),
    tutorial: { step: 'done', woodSpot: null },
    heroes,
    consumables: { ...createInitialSave().consumables, healingPotion: classes.length },
    gear: classes.flatMap((classId, i) => [
      { uid: `w${i}`, itemId: weaponFor(classId, tier)!.id, quality },
      { uid: `a${i}`, itemId: armour.id, quality },
    ]),
  };
  heroes.forEach((hero, i) => {
    save = equip(equip(equip(save, hero.id, 'weapon', `w${i}`), hero.id, 'armor', `a${i}`), hero.id, 'consumable', 'healingPotion');
  });
  return save;
}

function oddsByQuality(classes: HeroClassId[], dungeon: DungeonDef, level: number, runs: number) {
  return Object.fromEntries(
    MATRIX_QUALITIES.map((q) => {
      const save = referenceTeam(classes, dungeon.tier, q, level);
      return [q, estimateOdds(save, save.heroes.map((h) => h.id), dungeon, runs).success];
    }),
  );
}

/** Every dungeon against the starting classes in its tier's gear, with and without a threat-covering class. */
export function oddsMatrix(config: SimConfig = simConfig): MatrixRow[] {
  const base = startingHeroes.map((h) => h.classId);
  const { runs } = config.matrix;
  return dungeons.map((dungeon) => {
    const level = expectedLevels[dungeon.tier - 1];
    const counters = coveringClasses(dungeon, base);
    // The covering class and the starting hero it replaces that do best at Normal (quick estimate).
    let best: { classes: HeroClassId[]; odds: number } | null = null;
    for (const classId of counters) {
      for (let i = 0; i < base.length; i++) {
        const classes = base.map((c, j) => (j === i ? classId : c));
        const save = referenceTeam(classes, dungeon.tier, 'normal', level);
        const odds = estimateOdds(save, save.heroes.map((h) => h.id), dungeon, Math.ceil(runs / 4)).success;
        if (!best || odds > best.odds) best = { classes, odds };
      }
    }
    return {
      dungeonId: dungeon.id,
      tier: dungeon.tier,
      boss: !!dungeon.isBoss,
      base: oddsByQuality(base, dungeon, level, runs),
      counter: best ? { classId: best.classes.find((c) => !base.includes(c))!, odds: oddsByQuality(best.classes, dungeon, level, runs) } : null,
    };
  });
}
