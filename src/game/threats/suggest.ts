import { rosterRules } from '@/content/roster';
import { narrowPartySize } from '@/content/threats';

import { dressParty, statScore } from '../families/dress';
import type { SaveData } from '../save';
import { equip, isBusy, unequip } from '../team/team';
import type { Briefing, HeroState } from '../types';
import { briefingCoverage } from './coverage';

// The Suggest button and the simulator bot's party pick (one source): heroes
// and gear that cover the briefing's threats first, then push one family a
// level, then the best odds.

/** The threat tags a party still misses on a briefing: each threat's shortfall, summed. */
export const uncovered = (save: SaveData, heroIds: string[], briefing: Briefing) =>
  briefingCoverage(save, heroIds, briefing).threats.reduce((sum, t) => sum + Math.max(0, t.needed - t.have), 0);

/** One piece a suggested hero puts on (null: the slot is emptied, as a two-handed weapon empties the off-hand). */
export type GearSwap = { heroId: string; slot: 'weapon' | 'armor' | 'offhand'; gearUid: string | null };

export type SuggestOptions = {
  /** The heroes to pick from; the free ones by default. */
  candidates?: string[];
  /** Ranks parties covering as much: higher is better. The heroes' stats by default. */
  odds?: (dressed: SaveData, heroIds: string[]) => number;
  /** Stops adding heroes once the party covers every threat and `odds` reaches this. */
  enough?: number;
  /** False keeps everyone's gear as worn. */
  dress?: boolean;
};

export type SuggestedParty = {
  heroIds: string[];
  swaps: GearSwap[];
  /** The save with the party dressed: the swaps applied. */
  save: SaveData;
};

const SLOTS = ['weapon', 'armor', 'offhand'] as const;

/** The gear changes between two saves, for these heroes. */
function swapsBetween(before: SaveData, after: SaveData, heroIds: string[]): GearSwap[] {
  const equipment = (save: SaveData, id: string) => save.heroes.find((h) => h.id === id)!.equipment;
  return heroIds.flatMap((heroId) =>
    SLOTS.filter((slot) => equipment(before, heroId)[slot] !== equipment(after, heroId)[slot]).map((slot) => ({
      heroId,
      slot,
      gearUid: equipment(after, heroId)[slot],
    })),
  );
}

/**
 * Up to `slots` heroes for a briefing: adds, one at a time, the hero who
 * leaves the fewest threat tags missing once the party is dressed for the
 * threats from the spare pieces, ties broken by `odds`. Narrow passages cap
 * the party one hero short unless a hero in it lifts them. The party found is
 * dressed in full (threats, then one family pushed a level; see
 * families/dress.ts).
 */
export function suggestParty(save: SaveData, briefing: Briefing, slots: number = rosterRules.partySize, options: SuggestOptions = {}): SuggestedParty {
  const candidates = options.candidates ?? save.heroes.filter((h: HeroState) => !isBusy(save, h.id)).map((h) => h.id);
  const odds = options.odds ?? ((dressed: SaveData, ids: string[]) => ids.reduce((sum, id) => sum + statScore(dressed, id), 0));
  const dress = options.dress ?? true;
  const threatsOnly = (ids: string[]) => (dress ? dressParty(save, ids, briefing, null, false) : save);
  const fits = (ids: string[]) =>
    briefing.restriction !== 'narrowPassages' ||
    ids.length <= narrowPartySize(rosterRules.partySize) ||
    briefingCoverage(save, ids, briefing).restriction?.cancelledBy != null;
  const party: string[] = [];
  while (party.length < slots) {
    const choices = candidates
      .filter((c) => !party.includes(c) && fits([...party, c]))
      .map((id) => {
        const ids = [...party, id];
        const dressed = threatsOnly(ids);
        return { id, ids, dressed, missing: uncovered(dressed, ids, briefing) };
      });
    if (choices.length === 0) break;
    const fewest = Math.min(...choices.map((o) => o.missing));
    let pick: { id: string; odds: number } | null = null;
    for (const option of choices.filter((o) => o.missing === fewest)) {
      const value = odds(option.dressed, option.ids);
      if (!pick || value > pick.odds) pick = { id: option.id, odds: value };
    }
    party.push(pick!.id);
    if (options.enough !== undefined && fewest === 0 && pick!.odds >= options.enough) break;
  }
  const dressed = dress ? dressParty(save, party, briefing) : save;
  return { heroIds: party, swaps: swapsBetween(save, dressed, party), save: dressed };
}

/** Puts a suggested party's swaps on, in order. */
export function applySwaps(save: SaveData, swaps: GearSwap[]): SaveData {
  return swaps.reduce((next, swap) => (swap.gearUid ? equip(next, swap.heroId, swap.slot, swap.gearUid) : unequip(next, swap.heroId, swap.slot)), save);
}
