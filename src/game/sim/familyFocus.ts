import { affixById } from '@/content/affixes';
import { dungeons } from '@/content/dungeons';
import { mobById } from '@/content/enemies';
import { familyById, families, type FamilyId } from '@/content/families';
import { heroClasses } from '@/content/heroes';
import { rosterRules } from '@/content/roster';
import { dungeonThreats } from '@/content/threats';

import { tierChain } from '../dungeons/unlock';
import { mobTags } from '../enemies/tags';
import { launchPlan, runProvisions } from '../expeditions/expeditions';
import { estimateOdds, estimatePartyOdds } from '../expeditions/odds';
import { EMPTY_BRIEFING, prepareParty, simulateRun, type PartyMember } from '../expeditions/simulate';
import type { SaveData } from '../save';
import { composeBriefing } from '../threats/compose';
import type { DungeonDef, HeroClassId, ThreatId } from '../types';
import { withLoadout } from './bot';
import { simConfig } from './config';
import { FIT_DAYS, FIT_NOW, rosterParty } from './difficultyOdds';
import { referenceSave, rosterSave } from './reference';
import { dressParty } from '../families/dress';
import { fillPotions } from './rules/loadout';
import { withFamilyCount } from './threatCosts';

// Family balance probes for the report and sim:quick: each family at levels
// 1, 2 and 3 against the same team with its tags stripped (same heroes, same
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

/** The tier's regular dungeons (no boss, no overnight run). */
const regular = (tier: number) => dungeons.filter((d) => d.tier === tier && !d.isBoss && !d.overnight);
const foesOf = (d: DungeonDef) => [d.boss, ...d.encounters.flatMap((e) => (e.type === 'fight' ? e.mobs.map((g) => mobById[g.mobId]) : []))];
const hasTag = (d: DungeonDef, tags: string[]) => foesOf(d).some((m) => mobTags(m).some((t) => tags.includes(t)));
const listsThreat = (d: DungeonDef, threat: ThreatId) => !!dungeonThreats[d.id]?.weights[threat];

/**
 * Where a threat family is measured: the tier's dungeons with its own foes
 * (undead or spirits, beasts, armoured or elemental ones), or for a threat no
 * foe carries, the dungeons that can roll it. Playstyle families: the tier's
 * medium dungeons.
 */
const OWN_FOES: Partial<Record<FamilyId, (d: DungeonDef) => boolean>> = {
  faith: (d) => hasTag(d, ['undead', 'spirit']),
  wild: (d) => hasTag(d, ['beast']),
  breaker: (d) => foesOf(d).some((m) => (m.armour ?? 0) > 0),
  warding: (d) => foesOf(d).some((m) => m.element !== undefined),
  watch: (d) => listsThreat(d, 'darkness'),
  cunning: (d) => listsThreat(d, 'traps'),
  venom: (d) => listsThreat(d, 'poison'),
};
/**
 * The difficulty a tier's focus teams are measured on: medium, but hard at
 * tier 5, where medium dungeons let the teams start too high (63–80%) to show
 * what a family adds.
 */
const FOCUS_DIFFICULTY: Partial<Record<number, DungeonDef['difficulty']>> = { 5: 'hard' };
export const focusDungeons = (family: FamilyId, tier: number): DungeonDef[] => {
  const difficulty = FOCUS_DIFFICULTY[tier] ?? 'medium';
  const own = OWN_FOES[family];
  if (!own) return regular(tier).filter((d) => d.difficulty === difficulty);
  const list = regular(tier).filter(own);
  const harder = list.filter((d) => d.difficulty === difficulty);
  return FOCUS_DIFFICULTY[tier] && harder.length > 0 ? harder : list;
};

/** Runs per level behind each "fires" share. */
export const FIRE_RUNS = 40;

export type FocusRow = {
  tier: number;
  family: FamilyId;
  classes: HeroClassId[];
  /** The level the team reaches in its own gear. */
  reached: number;
  /** Mean odds over the dungeons with 0, 2, 4 and 6 tags (none, level 1, 2, 3); null when the tier has none. */
  odds: [number, number, number, number] | null;
  /** The share of runs where each level's effect shows in the log, at that level. */
  fires: [number, number, number] | null;
  dungeons: number;
  runs: number;
};

/** The fitted party of each dungeon: picked from the reference roster at the tier's end with no briefing. */
const fitted = new Map<string, string[]>();
function fittedParty(dungeon: DungeonDef): string[] {
  let ids = fitted.get(dungeon.id);
  if (!ids) {
    ids = rosterParty(rosterSave(dungeon.tier, 'end'), dungeon, EMPTY_BRIEFING, rosterRules.partySize, FIT_NOW).heroIds;
    fitted.set(dungeon.id, ids);
  }
  return ids;
}

/**
 * A family's focus team for a dungeon: the fitted party, with the family's
 * carrier (its first class, kitted like the roster) swapped in for the member
 * whose loss costs the least, unless a member already is of the family's
 * classes; then dressed to push the family from the spare pieces.
 */
function focusTeam(family: FamilyId, dungeon: DungeonDef): { save: SaveData; ids: string[]; classes: HeroClassId[] } {
  const carrierClass = focusClasses(family)[0];
  const roster = rosterSave(dungeon.tier, 'end', [carrierClass]);
  const carrier = roster.heroes[roster.heroes.length - 1].id;
  let ids = fittedParty(dungeon);
  const own = (id: string) => heroClasses[roster.heroes.find((h) => h.id === id)!.classId].familyTag === family;
  if (!ids.some(own)) {
    const quick = (party: string[]) =>
      estimateOdds(withLoadout(roster, party, dungeon, EMPTY_BRIEFING), party, dungeon, simConfig.odds.searchRuns, { now: FIT_NOW, briefing: EMPTY_BRIEFING }).success;
    const swaps = ids.map((_, i) => ids.map((id, j) => (i === j ? carrier : id)));
    ids = swaps.reduce((best, party) => (quick(party) > quick(best) ? party : best));
  }
  const save = fillPotions(dressParty(roster, ids, EMPTY_BRIEFING, family), ids);
  return { save, ids, classes: ids.map((id) => save.heroes.find((h) => h.id === id)!.classId) };
}

/**
 * Each family's focus team at each tier's end (focusTeam) on the family's
 * dungeons (focusDungeons), with no briefing: its odds with the family's
 * tags set to 0, 2, 4 and 6, and how often each level fires.
 */
export function focusOdds(runs: number, tiers = [1, 2, 3, 4, 5], fireRuns = FIRE_RUNS): FocusRow[] {
  const rows: FocusRow[] = [];
  for (const tier of tiers) {
    for (const family of families.map((f) => f.id)) {
      const list = focusDungeons(family, tier);
      const per = list.map((dungeon) => {
        const { save, ids, classes } = focusTeam(family, dungeon);
        const count = prepareParty(save, ids).reduce((sum, m) => sum + m.familyTags.filter((t) => t.family === family).reduce((n, t) => n + t.count, 0), 0);
        const loaded = withLoadout(save, ids, dungeon, EMPTY_BRIEFING);
        const { hunger } = launchPlan(loaded, dungeon, ids, {}, EMPTY_BRIEFING);
        const party = prepareParty(loaded, ids, FIT_NOW, true);
        const options = runProvisions(hunger, {}, EMPTY_BRIEFING);
        const at = (n: number) => withFamilyCount(party, family, n);
        const fired = (level: number) => {
          let n = 0;
          for (let i = 0; i < fireRuns; i++) {
            const run = simulateRun(at(level * 2), dungeon, `focus-fire|${i}`, options);
            if (run.encounters.some((e) => e.effects.some((x) => x.key === 'family' && String(x.familyEffect).startsWith(`${family}${level}`)))) n++;
          }
          return n / fireRuns;
        };
        return {
          classes,
          reached: [2, 4, 6].filter((n) => count >= n).length,
          odds: [0, 2, 4, 6].map((n) => estimatePartyOdds(at(n), dungeon, runs, options).success),
          fires: [1, 2, 3].map(fired),
        };
      });
      rows.push({
        tier,
        family,
        classes: per[0]?.classes ?? [focusClasses(family)[0]],
        reached: per.length ? Math.min(...per.map((p) => p.reached)) : 0,
        odds: per.length ? ([0, 1, 2, 3].map((i) => mean(per.map((p) => p.odds[i]))) as FocusRow['odds']) : null,
        fires: per.length ? ([0, 1, 2].map((i) => mean(per.map((p) => p.fires[i]))) as FocusRow['fires']) : null,
        dungeons: list.length,
        runs,
      });
    }
  }
  return rows;
}

/** A family's lift at each level (odds at the level minus none), per tier where measured. */
export const levelLift = (row: FocusRow, level: 1 | 2 | 3) => (row.odds ? row.odds[level] - row.odds[0] : null);

/** A family's mean lift at a level over the tiers where it was measured. */
export const focusLift = (rows: FocusRow[], family: FamilyId, level: 1 | 2 | 3 = 3) =>
  mean(rows.filter((r) => r.family === family).flatMap((r) => (r.odds ? [levelLift(r, level)!] : [])));

/**
 * The flags: a lift above 1.5× the median lift of the playstyle families over
 * all tiers (Plunder, a loot family, is left out of the median and never
 * flagged; so is Cunning, whose levels 2 and 3 work outside fights), and a
 * family whose lift at one tier is above twice its own mean.
 */
export const FOCUS_FLAG = {
  above: 1.5,
  below: 0.5,
  spike: 2,
  fires: 0.6,
  loot: ['plunder', 'cunning'] as FamilyId[],
  /**
   * Level 3s left out of the firing check: Faith 3's revive needs a knockout;
   * Shadow 3 (45% each regular fight, never a boss) shows in about half the
   * runs because runs hold only 1.6–2.1 regular fights; Cunning 3 and Plunder 3
   * work outside fights.
   */
  firesExempt: ['faith3', 'shadow3', 'cunning3', 'plunder3'],
  /** Tiers left out of a family's spike check: tier 3 is the elemental tier, where Warding and Spellweave are meant to matter most. */
  spikeExempt: { warding: [3], spellweave: [3] } as Partial<Record<FamilyId, number[]>>,
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
};

export type FocusFlag = { family: FamilyId; lift: [number, number, number]; flags: string[] };

/** Each family's mean lift at levels 1–3 and its flags. */
export function focusFlags(rows: FocusRow[]): FocusFlag[] {
  const ids = [...new Set(rows.map((r) => r.family))];
  const lifts = ids.map((family) => ({ family, lift: [1, 2, 3].map((l) => focusLift(rows, family, l as 1 | 2 | 3)) as [number, number, number] }));
  const playstyle = lifts.filter((l) => familyById[l.family].kind === 'playstyle' && !FOCUS_FLAG.loot.includes(l.family));
  const mid = [0, 1, 2].map((i) => median(playstyle.map((l) => l.lift[i])));
  return lifts.map(({ family, lift }) => {
    const flags: string[] = [];
    if (!FOCUS_FLAG.loot.includes(family)) {
      for (const level of [2, 3] as const) {
        if (lift[level - 1] > FOCUS_FLAG.above * mid[level - 1]) flags.push(`L${level} above ${FOCUS_FLAG.above}× median`);
        const spiky = rows
          .filter((r) => r.family === family && r.odds && !FOCUS_FLAG.spikeExempt[family]?.includes(r.tier))
          .some((r) => levelLift(r, level)! > FOCUS_FLAG.spike * lift[level - 1] && lift[level - 1] > 0);
        if (spiky) flags.push(`L${level} above ${FOCUS_FLAG.spike}× its mean at a tier`);
      }
      const fires = rows.filter((r) => r.family === family && r.fires).map((r) => r.fires![2]);
      if (!FOCUS_FLAG.firesExempt.includes(`${family}3`) && fires.length && mean(fires) < FOCUS_FLAG.fires) flags.push('L3 fires in under 60% of runs');
    }
    return { family, lift, flags };
  });
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
