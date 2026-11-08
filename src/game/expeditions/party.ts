import { familyOfThreat, families, type FamilyId } from '@/content/families';
import { gearProfiles } from '@/content/equipment';
import { itemById, recipeById } from '@/content/lookup';

import { forgeConfirmation, type ConfirmCost } from '../crafting/confirm';
import { canCraft, forgedItem } from '../crafting/crafting';
import { forgeList } from '../crafting/forgeList';
import { statScore } from '../families/dress';
import { familyLevel, gearFamilyTags, partyFamilies, type FamilyCounts } from '../families/families';
import { slotProblem } from '../equipment/slots';
import type { SaveData } from '../save';
import { isExhausted } from '../team/health';
import { affinityOf, equip, isAway, isWorking, unequip } from '../team/team';
import type { ActiveThreat, GearDef, GearInstance, GearType, HeroState } from '../types';
import type { ThreatCoverage } from '../threats/coverage';
import type { GearSwap } from '../threats/suggest';

// The party dialog's pure model (doc/design/expeditions/): the sockets a place
// needs and how the party lights them, the family banners, and the order and
// marks of the gear and hero pickers.

export const GEAR_SLOTS = ['helmet', 'weapon', 'armor', 'offhand'] as const;
export type GearSlot = (typeof GEAR_SLOTS)[number];

export type Socket = 'empty' | 'lit' | 'missing';

/** One threat's sockets: one per tag it needs. */
export type SocketGroup = {
  threat: Pick<ActiveThreat, 'id' | 'level'>;
  family: FamilyId;
  /** Empty: nobody picked yet. Short: the party misses `short` tags; `hint` names gear types carrying the family. */
  state: 'empty' | 'covered' | 'short';
  sockets: Socket[];
  short: number;
  hint: GearType[];
};

/** Helmets and armour first (their blueprints are known from the start), then off-hands, then weapons. */
const HINT_SLOT_ORDER = ['helmet', 'armor', 'offhand', 'weapon'] as const;

/** Up to three gear types whose own family is this one, for the "A sallet, tome or runestone adds it" hint. */
export function hintTypes(family: FamilyId): GearType[] {
  const types = Object.entries(gearProfiles) as [GearType, (typeof gearProfiles)[GearType]][];
  return HINT_SLOT_ORDER.flatMap((slot) => types.filter(([, p]) => p.slot === slot && p.familyTag === family).map(([type]) => type)).slice(0, 3);
}

/**
 * The sockets per threat: dashed while nobody is picked, lit when the party
 * covers the threat, and otherwise lit up to the tags the party has with the
 * rest red. `coverage` is briefingCoverage's threats for the party (null
 * without heroes): its scoring decides covered, as the run does.
 */
export function socketGroups(threats: Pick<ActiveThreat, 'id' | 'level'>[], coverage: ThreatCoverage[] | null): SocketGroup[] {
  return threats.map((threat) => {
    const family = familyOfThreat(threat.id);
    const scored = coverage?.find((c) => c.threat.id === threat.id);
    if (!scored) return { threat, family, state: 'empty', sockets: Array<Socket>(threat.level).fill('empty'), short: 0, hint: [] };
    const needed = Math.max(1, scored.needed);
    if (scored.state === 'met') return { threat, family, state: 'covered', sockets: Array<Socket>(needed).fill('lit'), short: 0, hint: [] };
    const lit = Math.min(needed - 1, Math.max(0, scored.have));
    const short = needed - lit;
    return {
      threat,
      family,
      state: 'short',
      sockets: [...Array<Socket>(lit).fill('lit'), ...Array<Socket>(short).fill('missing')],
      short,
      hint: hintTypes(family),
    };
  });
}

/** The families a party still misses, from its socket groups. */
export const shortFamilies = (groups: SocketGroup[]): FamilyId[] => [...new Set(groups.filter((g) => g.state === 'short').map((g) => g.family))];

export type Banner = { family: FamilyId; count: number; level: number };

/** One banner per family with 2 tags or more (most first), and the families with a single tag. */
export function partyBanners(counts: FamilyCounts): { banners: Banner[]; singles: FamilyId[] } {
  const order = new Map(families.map((f, i) => [f.id, i]));
  const held = (Object.entries(counts) as [FamilyId, number][])
    .filter(([, count]) => count > 0)
    .sort(([a, ca], [b, cb]) => cb - ca || order.get(a)! - order.get(b)!);
  return {
    banners: held.filter(([, count]) => count >= 2).map(([family, count]) => ({ family, count, level: familyLevel(count) })),
    singles: held.filter(([, count]) => count === 1).map(([family]) => family),
  };
}

/** The family counts that change between two parties' counts. */
export function familyChanges(before: FamilyCounts, after: FamilyCounts): { family: FamilyId; before: number; after: number }[] {
  const ids = new Set([...Object.keys(before), ...Object.keys(after)] as FamilyId[]);
  return families
    .filter((f) => ids.has(f.id) && (before[f.id] ?? 0) !== (after[f.id] ?? 0))
    .map((f) => ({ family: f.id, before: before[f.id] ?? 0, after: after[f.id] ?? 0 }));
}

/** What a change to the party does to its families: the short ones it adds to, and whether it raises one the party already has. */
function familyEffect(before: FamilyCounts, after: FamilyCounts, short: FamilyId[]) {
  const changes = familyChanges(before, after);
  const lights = changes.filter((c) => c.after > c.before && short.includes(c.family)).map((c) => c.family);
  const raises = changes.some((c) => c.after > c.before && c.before > 0 && familyLevel(c.before) < 3);
  return { changes, lights, raises };
}

export type GearChoice = {
  gear: GearInstance;
  item: GearDef;
  /** On this hero now. */
  worn: boolean;
  /** Another hero wearing it: equipping takes it from them. */
  holder: HeroState | null;
  /** The class can't use the type, or the slot refuses it (an off-hand beside a two-handed weapon): listed last. */
  unfit: boolean;
  /** The slot refuses it outright: it can't be picked. */
  blocked: boolean;
  /** The short families it adds to (▲), and whether it raises a family the party has toward its next level. */
  lights: FamilyId[];
  raises: boolean;
  changes: { family: FamilyId; before: number; after: number }[];
  /** The save with it equipped, or null when blocked. */
  after: SaveData | null;
  /** The hero's stats rolled into one, with it equipped: the odds proxy the order uses. */
  score: number;
};

/**
 * The owned pieces for a hero's slot, as the gear picker lists them: pieces
 * that light a short family first, then pieces raising a family toward a
 * level, then by the hero's stats with it on; unfit pieces last. Pieces worn
 * by a hero who is away are left out.
 */
export function gearChoices(save: SaveData, partyIds: string[], heroId: string, slot: GearSlot, short: FamilyId[]): GearChoice[] {
  const hero = save.heroes.find((h) => h.id === heroId);
  if (!hero) return [];
  const before = partyFamilies(save, partyIds);
  const choices = save.gear.flatMap((gear): GearChoice[] => {
    const item = itemById[gear.itemId] as GearDef;
    if (item.slot !== slot || item.workTool) return [];
    const holder = save.heroes.find((h) => h.id !== heroId && h.equipment[slot] === gear.uid) ?? null;
    if (holder && isAway(save, holder.id)) return [];
    const worn = hero.equipment[slot] === gear.uid;
    const blocked = slot !== 'weapon' && !worn && slotProblem(save, hero, slot, gear) !== null;
    const unfit = blocked || (slot !== 'offhand' && affinityOf(hero.classId, item.gearType) === 'unfit');
    const after = blocked ? null : worn ? save : equip(save, heroId, slot, gear.uid);
    const effect = after ? familyEffect(before, partyFamilies(after, partyIds), short) : { changes: [], lights: [], raises: false };
    return [{ gear, item, worn, holder, unfit, blocked, ...effect, after, score: after ? statScore(after, heroId) : 0 }];
  });
  return choices.sort(
    (a, b) =>
      Number(a.unfit) - Number(b.unfit) ||
      Number(b.lights.length > 0) - Number(a.lights.length > 0) ||
      Number(b.raises) - Number(a.raises) ||
      b.score - a.score,
  );
}

export type ForgeChoice = {
  recipeId: string;
  item: GearDef;
  tier: number;
  /** As for owned pieces: the class can't use the type, or the slot refuses it. */
  unfit: boolean;
  lights: FamilyId[];
  raises: boolean;
  cost: ConfirmCost;
  craftable: boolean;
};

/**
 * The blueprints the player knows for a hero's slot, at every tier they can
 * forge, as the gear picker's Forge section lists them: the same order as the
 * owned pieces (unfit last, then lighting a short family, raising one, then
 * the higher tier first). Work tools stay out.
 */
export function forgeChoices(save: SaveData, partyIds: string[], heroId: string, slot: GearSlot, short: FamilyId[]): ForgeChoice[] {
  const hero = save.heroes.find((h) => h.id === heroId);
  if (!hero) return [];
  const before = partyFamilies(save, partyIds);
  const choices = forgeList(save).tiers.flatMap(({ tier, recipeIds }) =>
    recipeIds.flatMap((recipeId): ForgeChoice[] => {
      const recipe = recipeById[recipeId];
      const item = forgedItem(recipe) as GearDef | null;
      const cost = forgeConfirmation(save, recipeId)?.cost;
      if (!item || item.slot !== slot || item.workTool || !cost) return [];
      // The piece as it would come out of the forge, only to see what it does to the party's families.
      const piece: GearInstance = { uid: 'forge-preview', itemId: item.id, rarity: 'common', roll: 10, affixes: [], rerolls: 0 };
      const withPiece = { ...save, gear: [...save.gear, piece] };
      const blocked = slot !== 'weapon' && slotProblem(withPiece, hero, slot, piece) !== null;
      const unfit = blocked || (slot !== 'offhand' && affinityOf(hero.classId, item.gearType) === 'unfit');
      const effect = blocked
        ? { lights: [], raises: false }
        : familyEffect(before, partyFamilies(equip(withPiece, heroId, slot, piece.uid), partyIds), short);
      return [{ recipeId, item, tier, unfit, lights: effect.lights, raises: effect.raises, cost, craftable: canCraft(save, recipe) }];
    }),
  );
  return choices.sort(
    (a, b) =>
      Number(a.unfit) - Number(b.unfit) ||
      Number(b.lights.length > 0) - Number(a.lights.length > 0) ||
      Number(b.raises) - Number(a.raises) ||
      b.tier - a.tier,
  );
}

/**
 * The party slots worth a look: a hero's slot glows when an owned piece the
 * hero can wear there lights a short family. Only pieces carrying a short
 * family are tried on, so it stays cheap on every party change.
 */
export function slotHints(save: SaveData, partyIds: string[], short: FamilyId[]): Set<string> {
  const hints = new Set<string>();
  if (short.length === 0) return hints;
  const before = partyFamilies(save, partyIds);
  const carriers = save.gear.filter((gear) => {
    const item = itemById[gear.itemId] as GearDef;
    return !item.workTool && gearFamilyTags(item, gear.relicId).some((tag) => short.includes(tag.family));
  });
  for (const heroId of partyIds) {
    const hero = save.heroes.find((h) => h.id === heroId);
    if (!hero) continue;
    for (const gear of carriers) {
      const item = itemById[gear.itemId] as GearDef;
      const slot = item.slot as GearSlot;
      if (!GEAR_SLOTS.includes(slot) || hints.has(`${heroId}:${slot}`) || hero.equipment[slot] === gear.uid) continue;
      const holder = save.heroes.find((h) => h.id !== heroId && h.equipment[slot] === gear.uid);
      if (holder && isAway(save, holder.id)) continue;
      if (slot !== 'offhand' && affinityOf(hero.classId, item.gearType) === 'unfit') continue;
      if (slot !== 'weapon' && slotProblem(save, hero, slot, gear)) continue;
      if (familyEffect(before, partyFamilies(equip(save, heroId, slot, gear.uid), partyIds), short).lights.length > 0) hints.add(`${heroId}:${slot}`);
    }
  }
  return hints;
}

export type HeroStatus = { kind: 'free' } | { kind: 'working' } | { kind: 'hurt'; ms: number } | { kind: 'out'; ms: number };

/** Whether a hero can join a party now, and if not, for how long they are out or hurt. */
export function heroStatus(save: SaveData, hero: HeroState, now: number): HeroStatus {
  if (isAway(save, hero.id)) {
    const ends = [
      ...save.expeditions.filter((e) => e.heroIds.includes(hero.id)),
      ...save.patrolFights.filter((f) => f.heroIds.includes(hero.id)),
      ...save.placeFights.filter((f) => f.heroIds.includes(hero.id)),
      ...save.heists.filter((h) => h.heroId === hero.id),
    ].map((e) => e.endsAt);
    return { kind: 'out', ms: Math.max(0, Math.max(...ends) - now) };
  }
  if (isExhausted(hero, now)) return { kind: 'hurt', ms: Math.max(0, (hero.exhaustedUntil ?? now) - now) };
  return isWorking(save, hero.id) ? { kind: 'working' } : { kind: 'free' };
}

export const canJoin = (status: HeroStatus) => status.kind === 'free' || status.kind === 'working';

export type HeroChoice = {
  hero: HeroState;
  status: HeroStatus;
  /** The short families the hero adds to as they are dressed (▲). */
  lights: FamilyId[];
  changes: { family: FamilyId; before: number; after: number }[];
  score: number;
};

/** The heroes not in the party, as the hero picker lists them: free ones first, those lighting a short family first among them, then by stats. */
export function heroChoices(save: SaveData, partyIds: string[], short: FamilyId[], now: number): HeroChoice[] {
  const before = partyFamilies(save, partyIds);
  return save.heroes
    .filter((hero) => !partyIds.includes(hero.id))
    .map((hero) => {
      const { lights, changes } = familyEffect(before, partyFamilies(save, [...partyIds, hero.id]), short);
      return { hero, status: heroStatus(save, hero, now), lights, changes, score: statScore(save, hero.id) };
    })
    .sort(
      (a, b) =>
        Number(canJoin(b.status)) - Number(canJoin(a.status)) ||
        Number(b.lights.length > 0) - Number(a.lights.length > 0) ||
        b.score - a.score,
    );
}

/**
 * The save with Suggest's swaps put on, skipping any that no longer fit (the
 * piece gone, its hero away, or the slot now refusing it).
 */
export function dressWith(save: SaveData, swaps: GearSwap[]): SaveData {
  return swaps.reduce((next, swap) => {
    if (isAway(next, swap.heroId)) return next;
    if (!swap.gearUid) return unequip(next, swap.heroId, swap.slot);
    const gear = next.gear.find((g) => g.uid === swap.gearUid);
    const hero = next.heroes.find((h) => h.id === swap.heroId);
    if (!gear || !hero) return next;
    const holder = next.heroes.find((h) => h.id !== swap.heroId && h.equipment[swap.slot] === gear.uid);
    if (holder && isAway(next, holder.id)) return next;
    if (swap.slot !== 'weapon' && slotProblem(next, hero, swap.slot, gear)) return next;
    return equip(next, swap.heroId, swap.slot, gear.uid);
  }, save);
}

/** Suggest's swaps still pending once the player equipped this slot by hand: theirs and any moving the same piece go. */
export const dropSwaps = (swaps: GearSwap[], heroId: string, slot: GearSlot, gearUid: string | null) =>
  swaps.filter((s) => !(s.heroId === heroId && s.slot === slot) && (gearUid === null || s.gearUid !== gearUid));
