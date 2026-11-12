import { dungeons } from '@/content/dungeons';
import { familyOfThreat, families, type FamilyId } from '@/content/families';
import { rosterRules } from '@/content/roster';
import { dungeonThreats, threatDefs } from '@/content/threats';

import { launchPlan, runProvisions } from '../expeditions/expeditions';
import { estimatePartyOdds } from '../expeditions/odds';
import { EMPTY_BRIEFING, prepareParty, type PartyMember } from '../expeditions/simulate';
import { bitesHere, maxThreatLevel } from '../threats/compose';
import type { SaveData } from '../save';
import type { Briefing, DungeonDef, ThreatId, ThreatLevel } from '../types';
import { withLoadout } from './bot';
import { FIT_NOW, rosterParty } from './difficultyOdds';
import { rosterSave } from './reference';

// Measurement probes for sim:quick, on the party the bot would send from the
// reference roster at each tier's end (the team the dungeons are fitted to),
// picked with no briefing in mind: what each threat costs on its own, and
// what each family's levels add.

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);

/** The family's tags set to `count` on the party: stripped from everyone, then given to the first hero who had one (or the first hero). */
export function withFamilyCount(party: PartyMember[], family: FamilyId, count: number): PartyMember[] {
  const carrier = party.find((m) => m.familyTags.some((t) => t.family === family)) ?? party[0];
  return party.map((m) => {
    const tags = m.familyTags.filter((t) => t.family !== family);
    if (m === carrier && count > 0) tags.push({ family, count, source: 'gear' });
    return { ...m, familyTags: tags };
  });
}

/** The fitted party for a dungeon: picked from the reference roster at the tier's end with no briefing, once per dungeon. */
const parties = new Map<string, { save: SaveData; heroIds: string[] }>();
function fitParty(dungeon: DungeonDef) {
  let party = parties.get(dungeon.id);
  if (!party) {
    party = rosterParty(rosterSave(dungeon.tier, 'end'), dungeon, EMPTY_BRIEFING, rosterRules.partySize, FIT_NOW);
    parties.set(dungeon.id, party);
  }
  return party;
}

/** The fitted party's odds on a dungeon under a briefing, with a party tweak applied after it is prepared. */
function odds(dungeon: DungeonDef, briefing: Briefing, runs: number, tweak: (party: PartyMember[]) => PartyMember[]): number {
  const { save, heroIds: ids } = fitParty(dungeon);
  const loaded = withLoadout(save, ids, dungeon, briefing);
  const { hunger } = launchPlan(loaded, dungeon, ids, {}, briefing);
  const party = tweak(prepareParty(loaded, ids, FIT_NOW, true));
  return estimatePartyOdds(party, dungeon, runs, runProvisions(hunger, {}, briefing)).success;
}

/** A tier's regular dungeons of one difficulty (no boss, no overnight run). */
const tierDungeons = (tier: number, difficulty: DungeonDef['difficulty']) =>
  dungeons.filter((d) => d.tier === tier && d.difficulty === difficulty && !d.isBoss && !d.overnight);

export type ThreatCostRow = {
  tier: number;
  threat: ThreatId;
  level: ThreatLevel;
  /** Odds with the threat answered (no penalty) minus missed, on the dungeons that can roll it; null where none can. */
  medium: number | null;
  hard: number | null;
};

/**
 * Each threat alone, at each level it reaches in the tier: the fitted party with the
 * answering family stripped, on the tier's medium and hard dungeons whose
 * threat table lists it (and where it can bite), with no briefing (answered) and with only that
 * threat (missed). The difference is the penalty's worth in points of odds.
 */
export function threatCosts(runs: number, tiers = [1, 2, 3, 4, 5]): ThreatCostRow[] {
  const rows: ThreatCostRow[] = [];
  for (const tier of tiers) {
    for (const def of threatDefs.filter((t) => t.firstTier <= tier)) {
      const strip = (party: PartyMember[]) => withFamilyCount(party, familyOfThreat(def.id), 0);
      for (let level = 1; level <= maxThreatLevel(tier, def.firstTier); level++) {
        const cost = (difficulty: 'medium' | 'hard') => {
          const listed = tierDungeons(tier, difficulty).filter((d) => dungeonThreats[d.id]?.weights[def.id] && bitesHere(d, def.id));
          if (listed.length === 0) return null;
          return mean(
            listed.map((dungeon) => {
              const element = dungeonThreats[dungeon.id]?.element;
              const briefing: Briefing = {
                ...EMPTY_BRIEFING,
                threats: [{ id: def.id, level: level as ThreatLevel, ...(def.id === 'element' && element ? { element } : {}) }],
              };
              return odds(dungeon, EMPTY_BRIEFING, runs, strip) - odds(dungeon, briefing, runs, strip);
            }),
          );
        };
        rows.push({ tier, threat: def.id, level: level as ThreatLevel, medium: cost('medium'), hard: cost('hard') });
      }
    }
  }
  return rows;
}

export type LevelLiftRow = { tier: number; family: FamilyId; /** Odds with 0, 2, 4 and 6 tags (none, level 1, 2, 3). */ odds: [number, number, number, number] };

/**
 * Each family at levels 1, 2 and 3 against none: the fitted party on the tier's medium
 * dungeons with no briefing (so a threat family's answer counts for nothing
 * here: its worth is in threatCosts), the family's tags set to 0, 2, 4 and 6.
 */
export function levelLifts(runs: number, tiers = [1, 2, 3, 4, 5]): LevelLiftRow[] {
  return tiers.flatMap((tier) => {
    const list = tierDungeons(tier, 'medium');
    return families.map((f) => ({
      tier,
      family: f.id,
      odds: [0, 2, 4, 6].map((count) =>
        mean(list.map((dungeon) => odds(dungeon, EMPTY_BRIEFING, runs, (party) => withFamilyCount(party, f.id, count)))),
      ) as LevelLiftRow['odds'],
    }));
  });
}
