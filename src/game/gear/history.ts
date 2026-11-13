// Gear with a history: each expedition report adds to the pieces the party
// wore (runs, the boss beaten) and to each hero's weapon (their kills, by
// enemy tag). A piece earns "<hero>'s <epithet>" once (content/gearNames.ts)
// and its weapon's later kill milestones grow that epithet a step. Names give
// no stats.

import { bossEpithets, gearNameRules, tagEpithets } from '@/content/gearNames';

import type { SaveData } from '../save';
import { equippedGear } from '../team/team';
import type { GearEarnedName, GearHistory, GearInstance, Tag } from '../types';

type Rules = typeof gearNameRules;

export const emptyHistory = (): GearHistory => ({ runs: 0, kills: 0, killTags: {}, bosses: [] });

/** How far a weapon's epithet has grown: the later kill milestones it has reached. */
export const nameStep = (kills: number, rules: Rules = gearNameRules) => rules.killMilestones.slice(1).filter((m) => kills >= m).length;

/** The kill milestone's epithet: the tag the weapon killed most of, the table's order breaking ties; a plain one when none counts. */
export function killEpithetId(killTags: Partial<Record<Tag, number>>): string {
  let best: string | null = null;
  let most = 0;
  for (const tag of Object.keys(tagEpithets) as Tag[]) {
    const n = killTags[tag] ?? 0;
    if (n > most) {
      most = n;
      best = tag;
    }
  }
  return best ? `tag:${best}` : 'kills';
}

/** One party hero's part in the run, from the report's tally. */
export type RunPart = { heroId: string; kills: number; killTags?: Partial<Record<Tag, number>>; bossKill: boolean };

export type RunOnGear = {
  party: RunPart[];
  /** The boss the party beat, if it did. */
  bossBeaten: string | null;
  /** Whether that boss is a tier boss: its killing blow names the weapon. */
  tierBoss: boolean;
  now: number;
};

export type NamedPiece = { uid: string; itemId: string; name: GearEarnedName; grew: boolean };

/** The name a piece earns now, if it has none: a tier boss's killing blow, then its first kill milestone, then many runs. */
function earnedEpithet(history: GearHistory, weapon: boolean, part: RunPart, run: RunOnGear, rules: Rules): string | null {
  if (weapon && part.bossKill && run.tierBoss && run.bossBeaten && bossEpithets[run.bossBeaten]) return `boss:${run.bossBeaten}`;
  if (weapon && history.kills >= rules.killMilestones[0]) return killEpithetId(history.killTags);
  return history.runs >= rules.runs ? 'runs' : null;
}

/**
 * After an expedition: every piece each party hero wore counts the run and the
 * boss beaten, their weapon their kills; pieces earn or grow their names.
 * Pure: returns the new save and the pieces named.
 */
export function noteRunOnGear(save: SaveData, run: RunOnGear, rules: Rules = gearNameRules): { save: SaveData; named: NamedPiece[] } {
  const updated = new Map<string, GearInstance>();
  const named: NamedPiece[] = [];
  for (const part of run.party) {
    const hero = save.heroes.find((h) => h.id === part.heroId);
    if (!hero) continue;
    for (const piece of equippedGear(save, hero)) {
      const weapon = piece.uid === hero.equipment.weapon;
      const was = piece.history ?? emptyHistory();
      const killTags = { ...was.killTags };
      if (weapon) for (const [tag, n] of Object.entries(part.killTags ?? {}) as [Tag, number][]) killTags[tag] = (killTags[tag] ?? 0) + n;
      const history: GearHistory = {
        runs: was.runs + 1,
        kills: was.kills + (weapon ? part.kills : 0),
        killTags,
        bosses: run.bossBeaten && !was.bosses.includes(run.bossBeaten) ? [...was.bosses, run.bossBeaten] : was.bosses,
      };
      let earnedName = piece.earnedName;
      if (!earnedName) {
        const epithet = earnedEpithet(history, weapon, part, run, rules);
        if (epithet) {
          earnedName = { epithet, step: weapon ? nameStep(history.kills, rules) : 0, hero: hero.name, at: run.now };
          named.push({ uid: piece.uid, itemId: piece.itemId, name: earnedName, grew: false });
        }
      } else if (weapon && nameStep(history.kills, rules) > earnedName.step) {
        earnedName = { ...earnedName, step: nameStep(history.kills, rules) };
        named.push({ uid: piece.uid, itemId: piece.itemId, name: earnedName, grew: true });
      }
      updated.set(piece.uid, { ...piece, history, ...(earnedName ? { earnedName } : {}) });
    }
  }
  if (updated.size === 0) return { save, named };
  return { save: { ...save, gear: save.gear.map((g) => updated.get(g.uid) ?? g) }, named };
}
