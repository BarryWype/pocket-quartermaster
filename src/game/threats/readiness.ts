import { familyOfThreat, type FamilyId } from '@/content/families';
import { heroClasses } from '@/content/heroes';
import { itemById } from '@/content/lookup';
import { rosterRules } from '@/content/roster';
import { narrowPartySize } from '@/content/threats';

import { sparePieces } from '../families/dress';
import { gearFamilyTags, heroFamilyTagSources } from '../families/families';
import type { SaveData } from '../save';
import { affinityOf, isBusy } from '../team/team';
import type { ActiveThreat, Briefing, GearDef, GearInstance, HeroState } from '../types';
import { heroAnswers, type HeroAnswers } from './answers';

// The readiness stamp of the expedition list (doc/design/expeditions/): can
// the free heroes cover a briefing's threats as they are, with gear they own
// but nobody wears, or not at all. It runs for every place on the list, so
// the per-save work is done once per save and each briefing is a small search.

export type Readiness =
  /** Some free heroes, in the gear they wear now, cover every threat. */
  | { kind: 'ready' }
  /** Free heroes cover every threat once they put on owned, unworn gear they can use. */
  | { kind: 'needsGear' }
  /** The families nobody can bring: each threat's that no party reaches even alone, or all of them when only together they fall short. */
  | { kind: 'missing'; families: FamilyId[] };

const SLOTS = ['weapon', 'armor', 'helmet', 'offhand'] as const;
type Slot = (typeof SLOTS)[number];

type Piece = { uid: string; slot: Slot; twoHanded: boolean; tags: { family: FamilyId; count: number }[] };

type FreeHero = {
  hero: HeroState;
  /** As worn now: tags and familyVsThreat bonuses. */
  answers: HeroAnswers;
  /** The class's tag, and the worn piece per slot. */
  classFamily: FamilyId;
  worn: Record<Slot, Piece | null>;
  /** Spare pieces per slot the hero can use (no unfit weapon, armour or helmet). */
  spares: Record<Slot, Piece[]>;
};

const pieceOf = (gear: GearInstance): Piece => {
  const item = itemById[gear.itemId] as GearDef;
  return {
    uid: gear.uid,
    slot: item.slot as Slot,
    twoHanded: !!item.twoHanded,
    tags: gearFamilyTags(item, gear.relicId).map((t) => ({ family: t.family, count: t.count })),
  };
};

const contexts = new WeakMap<SaveData, { free: FreeHero[]; results: Map<string, Readiness> }>();

/** The save's free heroes and spare pieces, computed once per save. */
function contextOf(save: SaveData) {
  const cached = contexts.get(save);
  if (cached) return cached;
  const spares = sparePieces(save).map((gear) => ({ gear, piece: pieceOf(gear) }));
  const byUid = new Map(save.gear.map((g) => [g.uid, g]));
  const free = save.heroes
    .filter((hero) => !isBusy(save, hero.id))
    .map((hero): FreeHero => {
      const worn = Object.fromEntries(
        SLOTS.map((slot) => {
          const gear = hero.equipment[slot] ? byUid.get(hero.equipment[slot]!) : undefined;
          return [slot, gear && !(itemById[gear.itemId] as GearDef).workTool ? pieceOf(gear) : null];
        }),
      ) as Record<Slot, Piece | null>;
      const usable = ({ gear, piece }: (typeof spares)[number]) =>
        piece.slot === 'offhand' || affinityOf(hero.classId, (itemById[gear.itemId] as GearDef).gearType) !== 'unfit';
      return {
        hero,
        answers: heroAnswers({ heroId: hero.id, classId: hero.classId, traitId: hero.trait, familyTags: heroFamilyTagSources(save, hero) }),
        classFamily: heroClasses[hero.classId].familyTag,
        worn,
        spares: Object.fromEntries(SLOTS.map((slot) => [slot, spares.filter((s) => s.piece.slot === slot && usable(s)).map((s) => s.piece)])) as Record<Slot, Piece[]>,
      };
    });
  const context = { free, results: new Map<string, Readiness>() };
  contexts.set(save, context);
  return context;
}

/** What one hero brings to each threat, in one outfit, and the spare pieces it takes. */
type Option = { values: number[]; uses: string[] };

/** A hero's bonuses on each threat (class and trait familyVsThreat). */
const bonusesOn = (answers: HeroAnswers, threats: ActiveThreat[]) =>
  threats.map((threat) =>
    answers.bonuses
      .filter((b) => b.family === familyOfThreat(threat.id) && (!b.levels || b.levels.includes(threat.level)))
      .reduce((sum, b) => sum + b.add, 0),
  );

/** The hero as worn now. */
function wornOption(free: FreeHero, threats: ActiveThreat[]): Option {
  const bonuses = bonusesOn(free.answers, threats);
  const values = threats.map((threat, i) => {
    const family = familyOfThreat(threat.id);
    return free.answers.tags.filter((t) => t.family === family).reduce((n, t) => n + t.count, 0) + bonuses[i];
  });
  return { values, uses: [] };
}

/** Every outfit of the hero that swaps in spare pieces carrying a needed family, the worn piece kept otherwise. */
function gearOptions(free: FreeHero, threats: ActiveThreat[]): Option[] {
  const needed = threats.map((t) => familyOfThreat(t.id));
  const helps = (piece: Piece) => piece.tags.some((t) => needed.includes(t.family));
  const choices = (slot: Slot) => [{ piece: free.worn[slot], spare: false }, ...free.spares[slot].filter(helps).map((piece) => ({ piece, spare: true }))];
  const bonuses = bonusesOn(free.answers, threats);
  const options: Option[] = [];
  for (const weapon of choices('weapon')) {
    for (const armour of choices('armor')) {
      for (const helmet of choices('helmet')) {
        // A two-handed weapon leaves the off-hand empty.
        const offhands = weapon.piece?.twoHanded ? [{ piece: null, spare: false }] : choices('offhand');
        for (const offhand of offhands) {
          const picked = [weapon, armour, helmet, offhand];
          const values = needed.map((family, i) => {
            const gear = picked.reduce((sum, c) => sum + (c.piece?.tags.filter((t) => t.family === family).reduce((n, t) => n + t.count, 0) ?? 0), 0);
            return (free.classFamily === family ? 1 : 0) + gear + bonuses[i];
          });
          options.push({ values, uses: picked.filter((c) => c.spare).map((c) => c.piece!.uid) });
        }
      }
    }
  }
  return options;
}

/**
 * Whether up to `slots` heroes, one option each, with no spare piece taken
 * twice, cover every threat: a search over the heroes in order, keeping each
 * distinct (running counts, heroes taken, pieces taken) state once.
 */
function covers(options: Option[][], threats: ActiveThreat[], slots: number): boolean {
  const needs = threats.map((t) => t.level as number);
  const clamp = (value: number, i: number) => Math.max(-3, Math.min(needs[i], value));
  type State = { values: number[]; taken: number; uses: string[] };
  const keyOf = (s: State) => `${s.values.join(',')}|${s.taken}|${[...s.uses].sort().join(',')}`;
  let states = new Map<string, State>([['', { values: needs.map(() => 0), taken: 0, uses: [] }]]);
  const done = (s: State) => s.values.every((v, i) => v >= needs[i]);
  if ([...states.values()].some(done)) return true;
  for (const heroOptions of options) {
    const next = new Map(states);
    for (const state of states.values()) {
      if (state.taken >= slots) continue;
      for (const option of heroOptions) {
        if (option.uses.some((uid) => state.uses.includes(uid))) continue;
        const after: State = { values: state.values.map((v, i) => clamp(v + option.values[i], i)), taken: state.taken + 1, uses: [...state.uses, ...option.uses] };
        if (done(after)) return true;
        next.set(keyOf(after), after);
      }
    }
    states = next;
  }
  return false;
}

/**
 * Whether the free heroes can answer a briefing's threats (see Readiness):
 * `slots` heroes at most (the party size, one fewer in Narrow passages unless
 * a free hero lifts them). Threat signatures (a Scout's lowering) are left out.
 */
export function briefingReadiness(save: SaveData, briefing: Briefing, slots: number = rosterRules.partySize): Readiness {
  const context = contextOf(save);
  const key = `${slots}|${briefing.restriction ?? ''}|${briefing.threats.map((t) => `${t.id}${t.level}`).join(',')}`;
  const cached = context.results.get(key);
  if (cached) return cached;

  const lifts = context.free.some(({ hero }) =>
    heroClasses[hero.classId].abilities.some((a) => a.kind === 'cancelRestriction' && (!a.restriction || a.restriction === 'narrowPassages')),
  );
  const size = briefing.restriction === 'narrowPassages' && !lifts ? Math.min(slots, narrowPartySize(rosterRules.partySize)) : slots;
  const threats = briefing.threats;
  let result: Readiness;
  if (covers(context.free.map((f) => [wornOption(f, threats)]), threats, size)) result = { kind: 'ready' };
  else if (covers(context.free.map((f) => gearOptions(f, threats)), threats, size)) result = { kind: 'needsGear' };
  else {
    const alone = threats.filter((threat) => !covers(context.free.map((f) => gearOptions(f, [threat])), [threat], size));
    result = { kind: 'missing', families: (alone.length > 0 ? alone : threats).map((t) => familyOfThreat(t.id)) };
  }
  context.results.set(key, result);
  return result;
}
