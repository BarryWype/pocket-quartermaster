import { gearProfiles } from '@/content/equipment';
import { families, familyRules, type FamilyId } from '@/content/families';
import { heroClasses } from '@/content/heroes';
import { itemById } from '@/content/lookup';

import { pieceDamageStat } from '../equipment/damageStat';
import type { SaveData } from '../save';
import { affinityOf, equip, heroDamageStat, heroStats } from '../team/team';
import { heroAnswers } from '../threats/answers';
import { familyCount } from '../threats/score';
import type { Briefing, GearDef, GearInstance, HeroState } from '../types';
import { familyLevel, gearFamilyTags, heroFamilyTagSources, partyFamilies } from './families';

// Dressing a party for a briefing (doc/design/simulator/README.md), shared by
// the Suggest button and the simulator bot: the party swaps spare pieces in to
// bring the tags the briefing's threats need, then pushes one playstyle family
// as high as it can. Pure: each rule takes a save and returns a save.

const SLOTS = ['weapon', 'armor', 'helmet', 'offhand'] as const;
type Slot = (typeof SLOTS)[number];

const defOf = (gear: GearInstance) => itemById[gear.itemId] as GearDef;

/** Spare pieces: weapons, armour, helmets and off-hands nobody wears (work tools left out). */
export function sparePieces(save: SaveData): GearInstance[] {
  const worn = new Set(save.heroes.flatMap((h) => SLOTS.map((slot) => h.equipment[slot])));
  return save.gear.filter((g) => {
    const item = defOf(g);
    return !worn.has(g.uid) && SLOTS.includes(item.slot as Slot) && !item.workTool;
  });
}

/**
 * Whether a hero would wear this spare piece for its family tag: never an unfit
 * weapon, armour or helmet type, a weapon or off-hand only when it rolls with the
 * hero's damage stat, and never more than `tierDrop` tiers below the piece it
 * replaces.
 */
function wearable(save: SaveData, hero: HeroState, slot: Slot, piece: GearInstance, tierDrop: number): boolean {
  const item = defOf(piece);
  if (item.slot !== slot || !item.gearType) return false;
  if (slot !== 'offhand' && affinityOf(hero.classId, item.gearType) === 'unfit') return false;
  const damageStat = heroClasses[hero.classId].damageStat;
  if (slot === 'weapon' && pieceDamageStat(item, hero.classId) !== damageStat) return false;
  if (slot === 'offhand' && gearProfiles[item.gearType].damageStat && gearProfiles[item.gearType].damageStat !== damageStat) return false;
  const worn = hero.equipment[slot] ? save.gear.find((g) => g.uid === hero.equipment[slot]) : undefined;
  return !worn || item.tier >= defOf(worn).tier - tierDrop;
}

/** A hero's stats rolled into one number: their damage stat, armour, resistance and a share of HP. */
export function statScore(save: SaveData, heroId: string): number {
  const hero = save.heroes.find((h) => h.id === heroId)!;
  const stats = heroStats(save, hero);
  return stats[heroDamageStat(save, hero)] + stats.armour + stats.resistance + stats.hp / 8;
}

/**
 * Every save one swap away: a party hero putting on one spare piece that
 * carries a tag of one of the `sought` families (no other piece can raise
 * their counts, so trying it is wasted work).
 */
function swaps(save: SaveData, heroIds: string[], tierDrop: number, sought: FamilyId[]): { save: SaveData; cost: number }[] {
  const out: { save: SaveData; cost: number }[] = [];
  const spares = sparePieces(save).filter((piece) => gearFamilyTags(defOf(piece), piece.relicId).some((tag) => sought.includes(tag.family)));
  for (const id of heroIds) {
    const hero = save.heroes.find((h) => h.id === id);
    if (!hero) continue;
    const before = statScore(save, id);
    for (const slot of SLOTS) {
      for (const piece of spares) {
        if (!wearable(save, hero, slot, piece, tierDrop)) continue;
        let next: SaveData;
        try {
          next = equip(save, id, slot, piece.uid);
        } catch {
          continue;
        }
        out.push({ save: next, cost: before - statScore(next, id) });
      }
    }
  }
  return out;
}

/**
 * Swaps spare pieces in while each swap moves `score` (lower is better) the
 * most, the cheapest in stats first; keeps the save where `level` (lower is
 * better) was last lowered, so swaps that reach no new level are dropped.
 */
function climb(save: SaveData, heroIds: string[], tierDrop: number, sought: FamilyId[], score: (s: SaveData) => number, level: (s: SaveData) => number): SaveData {
  let current = save;
  let best = save;
  for (let i = 0; i < 9; i++) {
    const now = score(current);
    if (now <= 0) break;
    let pick: { save: SaveData; score: number; cost: number } | null = null;
    for (const option of swaps(current, heroIds, tierDrop, sought)) {
      const s = score(option.save);
      if (s >= now) continue;
      if (!pick || s < pick.score || (s === pick.score && option.cost < pick.cost)) pick = { save: option.save, score: s, cost: option.cost };
    }
    if (!pick) break;
    current = pick.save;
    if (level(current) < level(best)) best = current;
  }
  return best;
}

/**
 * How far the party is from the briefing's threats, from its family tags alone
 * (restriction and class or trait bonuses included): the tags still missing,
 * one per threat level.
 */
function threatShortfall(save: SaveData, heroIds: string[], briefing: Briefing): number {
  const answers = save.heroes
    .filter((h) => heroIds.includes(h.id))
    .map((hero) => heroAnswers({ heroId: hero.id, classId: hero.classId, traitId: hero.trait, familyTags: heroFamilyTagSources(save, hero) }));
  let tags = 0;
  for (const threat of briefing.threats) {
    const family = families.find((f) => f.answers === threat.id)!.id;
    tags += Math.max(0, threat.level - familyCount(answers, family, threat.level));
  }
  return tags;
}

/** The party's playstyle family with the most tags, ties in `families` order; null when it has none. */
export function focusFamily(save: SaveData, heroIds: string[]): FamilyId | null {
  const counts = partyFamilies(save, heroIds);
  let pick: { family: FamilyId; count: number } | null = null;
  for (const family of families.filter((f) => f.kind === 'playstyle')) {
    const count = counts[family.id] ?? 0;
    if (count > 0 && (!pick || count > pick.count)) pick = { family: family.id, count };
  }
  return pick?.family ?? null;
}

/**
 * Dresses a party for a briefing from the spare pieces: first the swaps that
 * bring the threats' tags (a piece up to one tier below the one it
 * replaces), then the swaps that push the party's leading playstyle family
 * (`focus`, or the one with most tags) to its next level without losing a
 * threat answer (a piece of the same tier or better). Swaps that reach no new
 * level are dropped. `push` false stops after the threats.
 */
export function dressParty(save: SaveData, heroIds: string[], briefing: Briefing, focus: FamilyId | null = null, push = true): SaveData {
  const shortfall = (s: SaveData) => threatShortfall(s, heroIds, briefing);
  const answering = briefing.threats.map((threat) => families.find((f) => f.answers === threat.id)!.id);
  const threats = briefing.threats.length ? climb(save, heroIds, 1, answering, shortfall, shortfall) : save;
  const family = push ? (focus ?? focusFamily(threats, heroIds)) : null;
  if (!family) return threats;
  const missed = shortfall(threats);
  const count = (s: SaveData) => partyFamilies(s, heroIds)[family] ?? 0;
  // Lower is better: a threat tag lost costs more than any playstyle tag.
  const lost = (s: SaveData) => briefing.threats.length > 0 && shortfall(s) > missed;
  const short = (s: SaveData) => (lost(s) ? 100 : Math.max(0, familyRules.levels[2] - count(s)));
  return climb(threats, heroIds, 0, [family], short, (s) => (lost(s) ? 100 : -familyLevel(count(s))));
}
