import { affixById } from '@/content/affixes';
import { classAffinities, gearId } from '@/content/equipment';
import { familyById, families, type FamilyId } from '@/content/families';
import { heroClasses } from '@/content/heroes';

import { tierChain } from '../dungeons/unlock';
import { launchPlan, runProvisions } from '../expeditions/expeditions';
import { estimatePartyOdds } from '../expeditions/odds';
import { EMPTY_BRIEFING, prepareParty, type PartyMember } from '../expeditions/simulate';
import type { SaveData } from '../save';
import { composeBriefing } from '../threats/compose';
import type { ArmourType, HeroClassId } from '../types';
import { withLoadout } from './bot';
import { expectedLevels } from './config';
import { FIT_DAYS, FIT_NOW } from './difficultyOdds';
import { averagePiece, referenceSave, referenceTeam, withSpares } from './reference';
import { dressParty } from './rules/families';
import { fillPotions } from './rules/loadout';

// Family balance probes for the report and sim:quick: a playstyle family at
// level 3 against the same team with its tags stripped (same heroes, same
// gear, so only the family's effects differ), and the Venomous affix against
// other weapon affixes outside Venom parties.

/** Runs per estimate when the full simulator measures the family probes for its summary. */
export const FAMILY_RUNS = 150;

const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);

const STARTERS: HeroClassId[] = ['warrior', 'ranger', 'fireMage'];

/** A family's focus team: its first two classes (in the class table's order), filled from the starting trio. */
export function focusClasses(family: FamilyId): HeroClassId[] {
  const own = (Object.keys(heroClasses) as HeroClassId[]).filter((id) => heroClasses[id].familyTag === family).slice(0, 2);
  return [...own, ...STARTERS.filter((id) => !own.includes(id))].slice(0, 3);
}

/** The family's tags set to `count` on the party: stripped from everyone, then given to the first hero who had one (or the first hero). */
function withFamilyCount(party: PartyMember[], family: FamilyId, count: number): PartyMember[] {
  const carrier = party.find((m) => m.familyTags.some((t) => t.family === family)) ?? party[0];
  return party.map((m) => {
    const tags = m.familyTags.filter((t) => t.family !== family);
    if (m === carrier && count > 0) tags.push({ family, count, magic: false, fromClass: false, source: 'gear' });
    return { ...m, familyTags: tags };
  });
}

/** Mean win odds of a save's party over a tier's chain dungeons (no boss) and the fitting days, with each party tweak. */
function chainOdds(save: SaveData, tier: number, runs: number, tweak: (party: PartyMember[]) => PartyMember[]): number {
  const ids = save.heroes.map((h) => h.id);
  const odds: number[] = [];
  for (const dungeon of tierChain(tier).filter((d) => (d.chainIndex ?? 6) < 6 && !d.isBoss)) {
    for (const day of FIT_DAYS) {
      const briefing = composeBriefing(dungeon, day);
      const loaded = withLoadout(save, ids, dungeon, briefing);
      const { hunger } = launchPlan(loaded, dungeon, ids, {}, briefing);
      const party = tweak(prepareParty(loaded, ids, FIT_NOW, true));
      odds.push(estimatePartyOdds(party, dungeon, runs, runProvisions(hunger, {}, briefing)).success);
    }
  }
  return mean(odds);
}

const ARMOURS: ArmourType[] = ['plate', 'mail', 'leather', 'robes'];

/** A reference team with each hero's armour (`a<i>`) remade as their class's first favoured armour type of the tier. */
function inFavouredArmour(save: SaveData, tier: number): SaveData {
  return {
    ...save,
    gear: save.gear.map((g) => {
      const hero = save.heroes.find((h) => h.equipment.armor === g.uid);
      const type = hero && ARMOURS.find((a) => classAffinities[hero.classId][a] === 'favoured');
      return type ? { ...averagePiece(g.uid, gearId(type, tier), g.rarity), uid: g.uid } : g;
    }),
  };
}

export type FocusRow = { tier: number; family: FamilyId; classes: HeroClassId[]; /** The level the team reaches in its own gear. */ reached: number; level3: number; none: number };

/**
 * Each playstyle family's focus team at the end of each tier (its classes at
 * the tier's top level in Uncommon gear of the tier, favoured weapon and
 * armour, dressed from a spare piece of every type per hero to push the
 * family), with the family set to 6 tags
 * (level 3) and with its tags stripped.
 */
export function focusOdds(runs: number, tiers = [1, 2, 3, 4, 5]): FocusRow[] {
  const rows: FocusRow[] = [];
  for (const tier of tiers) {
    for (const family of families.filter((f) => f.kind === 'playstyle').map((f) => f.id)) {
      const classes = focusClasses(family);
      const team = withSpares(inFavouredArmour(referenceTeam(classes, tier, 'uncommon', expectedLevels[tier - 1]), tier), tier, 'uncommon', false, classes.length);
      const ids = team.heroes.map((h) => h.id);
      const save = fillPotions(dressParty(team, ids, EMPTY_BRIEFING, family), ids);
      const count = prepareParty(save, ids).reduce((sum, m) => sum + m.familyTags.filter((t) => t.family === family).reduce((n, t) => n + t.count, 0), 0);
      rows.push({
        tier,
        family,
        classes,
        reached: [2, 4, 6].filter((n) => count >= n).length,
        level3: chainOdds(save, tier, runs, (party) => withFamilyCount(party, family, 6)),
        none: chainOdds(save, tier, runs, (party) => withFamilyCount(party, family, 0)),
      });
    }
  }
  return rows;
}

/** A family's lift: level 3 odds minus none, in points, averaged over the tiers. */
export const focusLift = (rows: FocusRow[], family: FamilyId) => mean(rows.filter((r) => r.family === family).map((r) => r.level3 - r.none));

/**
 * The flag bounds around the median lift. Loot families (Plunder: gold, parts
 * and rarity, nothing in a fight) are shown but neither flagged nor counted
 * in the median.
 */
export const FOCUS_FLAG = { above: 1.5, below: 0.5, loot: ['plunder'] as FamilyId[] };

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
};

/** Each playstyle family's lift and flag: above 1.5× the median lift, or below 0.5×; null for loot families. */
export function focusFlags(rows: FocusRow[]): { family: FamilyId; lift: number; flag: 'high' | 'low' | 'loot' | null }[] {
  const lifts = [...new Set(rows.map((r) => r.family))].map((family) => ({ family, lift: focusLift(rows, family) }));
  const mid = median(lifts.filter((l) => !FOCUS_FLAG.loot.includes(l.family)).map((l) => l.lift));
  return lifts.map(({ family, lift }) => ({
    family,
    lift,
    flag: FOCUS_FLAG.loot.includes(family) ? 'loot' : lift > FOCUS_FLAG.above * mid ? 'high' : lift < FOCUS_FLAG.below * mid ? 'low' : null,
  }));
}

/** The weapon affixes the Venomous one is measured against: those that help in every fight. */
export const VENOM_RIVALS = ['swift', 'opener', 'bloodthirsty'];

export type AffixRow = { tier: number; plain: number; venomous: number; venom2: number; rivals: Record<string, number> };

/**
 * The reference trio at each tier's end (as the dungeons are fitted, dressed
 * for its playstyle), each weapon with one more affix at the middle of its
 * range: Venomous outside a Venom party (its Venom tags stripped), Venomous
 * with Venom at level 2 (4 tags), and each rival affix.
 */
export function venomousOdds(runs: number, tiers = [1, 2, 3, 4, 5]): AffixRow[] {
  return tiers.map((tier) => {
    const base = referenceSave(tier, 'end', 3);
    const ids = base.heroes.map((h) => h.id);
    const dressed = dressParty(base, ids, EMPTY_BRIEFING);
    const withAffix = (affixId: string): SaveData => {
      const range = affixById[affixId].range!;
      const value = Math.round((range.min + range.max) / 2);
      const weapons = new Set(dressed.heroes.map((h) => h.equipment.weapon));
      return { ...dressed, gear: dressed.gear.map((g) => (weapons.has(g.uid) ? { ...g, affixes: [...g.affixes, { id: affixId, value }] } : g)) };
    };
    const outside = (party: PartyMember[]) => withFamilyCount(party, 'venom', 0);
    return {
      tier,
      plain: chainOdds(dressed, tier, runs, outside),
      venomous: chainOdds(withAffix('venomous'), tier, runs, outside),
      venom2: chainOdds(withAffix('venomous'), tier, runs, (party) => withFamilyCount(party, 'venom', 4)),
      rivals: Object.fromEntries(VENOM_RIVALS.map((id) => [id, chainOdds(withAffix(id), tier, runs, outside)])),
    };
  });
}

/** The family's display name, for tables. */
export const familyName = (family: FamilyId) => familyById[family].name;
