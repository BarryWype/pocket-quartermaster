import { affixById } from "@/content/affixes";
import type { Rarity } from "@/content/gear";
import { choiceOf, jobById, jobs } from "@/content/jobs";
import { itemById } from "@/content/lookup";
import { shopRules } from "@/content/shops";
import { ELEMENTS, stoneId, type Element } from "./elements";
import {
  LEGACY_COMPONENT_PART_COUNT,
  LEGACY_COMPONENT_PARTS,
  LEGACY_KEYWORD_AFFIXES,
  LEGACY_STEADY,
} from "./legacyComponents";
import { LEGACY_KIT_REFUNDS, LEGACY_TALISMAN, LEGACY_THREAT_MAP } from "./legacyThreats";
import { affixPool, affixSlotOf, rollAffixes } from "./gear/affixes";
import { createRng } from "./generation/rng";
import { makeGearPiece } from "./gear/make";
import { statFactor } from "./gear/stats";
import { jobMaterials } from "./jobs/jobs";
import type { Loot } from "./loot/types";
import { todaysCollector } from "./loot/valuables";
import type { JobOutput, SaveData } from "./save";
import type { ActiveThreat, Briefing, ExpeditionReport, GearDef, GearInstance, HeroState, MaterialStack } from "./types";
import { sellGoodsAmount } from "./quests/unlocks";
import type { Quest } from "./quests/types";
import { rolledSpecial } from "./team/specials";

/**
 * Version 31: the collector quest now names the valuable it wants, chosen from
 * those held when it arrives. Open collector quests keep their objective when
 * the market's wanted valuable is held (its id becomes their `itemId`); the
 * rest become a sellGoods quest, which needs no item and no target.
 */
export function toV31(save: SaveData, now: number): SaveData {
  const list = save.quests.list.map((quest): Quest => {
    if (
      quest.objective !== "collector" ||
      quest.doneAt !== null ||
      quest.itemId !== undefined
    )
      return quest;
    if (quest.target) {
      const wanted = todaysCollector(save, quest.target.placeId, now);
      const held = Object.entries(save.valuables).some(
        ([key, count]) =>
          key.slice(0, key.lastIndexOf(":")) === wanted && count > 0,
      );
      if (held) return { ...quest, itemId: wanted };
    }
    return {
      ...quest,
      objective: "sellGoods",
      amount: sellGoodsAmount(save),
      progress: 0,
      target: null,
      itemId: undefined,
    };
  });
  if (list.every((quest, i) => quest === save.quests.list[i])) return save;
  return { ...save, quests: { ...save.quests, list } };
}

/** Version 32: the personal tavern check (see taverns/personal.ts) starts unset. */
export function toV32(save: SaveData): SaveData {
  if (save.personalTavern !== undefined) return save;
  return { ...save, personalTavern: null };
}

/**
 * Version 33: every hero now has a special (see game/team/specials.ts).
 * Heroes without one roll it from their own id, so it never changes.
 */
export function toV33(save: SaveData): SaveData {
  const heroes = save.heroes.map((hero) =>
    hero.special
      ? hero
      : { ...hero, special: rolledSpecial(hero.id, hero.classId) },
  );
  if (heroes.every((hero, i) => hero === save.heroes[i])) return save;
  return { ...save, heroes };
}

/**
 * Version 35: jobs (see game/jobs/jobs.ts). Every hero starts free, at full
 * energy, and no job holds any output yet.
 */
export function toV35(save: SaveData, now: number): SaveData {
  const heroes = save.heroes.map((hero) =>
    hero.energy
      ? hero
      : { ...hero, job: null, energy: { value: 100, at: now } },
  );
  const unchanged = heroes.every((hero, i) => hero === save.heroes[i]);
  if (unchanged && save.jobOutput) return save;
  return { ...save, heroes, jobOutput: save.jobOutput ?? {} };
}

/**
 * Version 36: gathering jobs with rolls and choices (see game/jobs/jobs.ts).
 * Output entries now count whole units per material; a version 35 entry's
 * single amount becomes whole units of its job's material plus the fraction.
 * Choice jobs get their picked material, unset until the player chooses.
 */
export function toV36(save: SaveData): SaveData {
  const jobOutput: Record<string, JobOutput> = {};
  let changed = !save.jobChoice;
  for (const [id, raw] of Object.entries(save.jobOutput ?? {})) {
    if (raw && typeof raw === "object" && "amount" in raw) {
      const entry = raw as unknown as { amount: number; since: number };
      const job = jobById[id];
      if (!job) continue;
      const whole = Math.floor(entry.amount);
      jobOutput[id] = {
        amounts: whole > 0 ? { [jobMaterials(job)[0]]: whole } : {},
        fraction: entry.amount - whole,
        units: whole,
        since: entry.since,
      };
      changed = true;
    } else {
      jobOutput[id] = raw;
    }
  }
  const jobChoice: Record<string, string | null> = {};
  for (const job of jobs)
    if (choiceOf(job)) jobChoice[job.id] = save.jobChoice?.[job.id] ?? null;
  if (!changed) return save;
  return { ...save, jobOutput, jobChoice };
}

/**
 * Version 37: the outdoor gatherer (see game/jobs/gatherer.ts). The new state
 * is all optional — no camp until the player sets one, and the gatherer's new
 * output fields only appear once it gathers — so only the job choices are
 * given their defaults.
 */
export function toV37(save: SaveData): SaveData {
  if (save.jobChoice) return save;
  const jobChoice: Record<string, string | null> = {};
  for (const job of jobs) if (choiceOf(job)) jobChoice[job.id] = null;
  return { ...save, jobChoice };
}

/** A version 37 gear piece: quality multipliers, and element, luck and component as fields. */
type LegacyGear = {
  uid: string;
  itemId: string;
  quality: "crappy" | "normal" | "uncommon" | "rare" | "legendary";
  roll?: number;
  element?: Element;
  luck?: number;
  component?: string;
  relicId?: string;
};

/** The old quality multipliers, to keep each piece's stats where they were. */
const LEGACY_MULTIPLIERS: Record<LegacyGear["quality"], number> = {
  crappy: 0.85,
  normal: 1,
  uncommon: 1.07,
  rare: 1.15,
  legendary: 1.3,
};
const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "legendary"];
const capitalised = (element: Element) =>
  `${element[0].toUpperCase()}${element.slice(1)}`;

/** The dice total whose factor at `rarity` is nearest the old one (ties go to the higher total). */
function nearestRoll(oldFactor: number, rarity: Rarity): number {
  let best = 18;
  for (let total = 18; total >= 3; total--) {
    if (
      Math.abs(statFactor(total, rarity) - oldFactor) <
      Math.abs(statFactor(best, rarity) - oldFactor)
    )
      best = total;
  }
  return best;
}

/**
 * One piece in the new model. Crappy and Normal become Common. What the piece
 * carried becomes its first affixes: a component its affix (a heart, or an
 * infused element, the stone affix of the piece's slot), +1 Luck a Lucky
 * affix. A Common piece with one becomes Uncommon. The rest of the affixes,
 * the unique of a non-relic Legendary and the values roll from the uid. The
 * dice total keeps the stats nearest to the old quality × roll. An element on
 * a trinket can't stay: its stone is refunded.
 */
function migrateGear(old: LegacyGear): {
  gear: ReturnType<typeof makeGearPiece>;
  refund?: Element;
} {
  const item = itemById[old.itemId];
  const forced: { id: string; value?: number }[] = [];
  const heart = old.component?.endsWith("Heart")
    ? (old.component.replace(/Heart$/, "") as Element)
    : undefined;
  const element =
    old.element ?? (heart && ELEMENTS.includes(heart) ? heart : undefined);
  // Component affixes are gone: the closest part affix for the piece's slot takes their place.
  const componentAffix = Object.values(LEGACY_KEYWORD_AFFIXES).find(
    (legacy) => legacy.componentId === old.component,
  );
  const slot = affixSlotOf((item as GearDef).gearType);
  if (componentAffix && slot !== "any") forced.push({ id: componentAffix[slot] });
  let refund: Element | undefined;
  if (element && item.slot === "weapon")
    forced.push({ id: `infused${capitalised(element)}` });
  else if (element && (item.slot === "armor" || item.slot === "offhand"))
    forced.push({ id: `warding${capitalised(element)}` });
  else if (element) refund = element;
  if (old.luck) forced.push({ id: "lucky", value: Math.max(1, old.luck) });

  const mapped: Rarity =
    old.quality === "crappy" || old.quality === "normal"
      ? "common"
      : old.quality;
  const rarity =
    RARITY_ORDER[
      Math.max(RARITY_ORDER.indexOf(mapped), Math.min(forced.length, 3))
    ];
  const oldFactor =
    LEGACY_MULTIPLIERS[old.quality] *
    (item.slot === "trinket" ? 1 : (old.roll ?? 1));
  const gear = makeGearPiece(old.uid, old.itemId, rarity, undefined, {
    forced,
    roll: nearestRoll(oldFactor, rarity),
    ...(old.relicId ? { relicId: old.relicId } : {}),
  });
  return { gear, ...(refund ? { refund } : {}) };
}

/**
 * Version 38: the gear rework (doc/design/gear/). Gear moves from quality
 * multipliers to rolled stats and rarity with affixes (see migrateGear).
 * Held elemental hearts become stones of their element, and crafting mastery
 * is dropped. Components stay in the inventory as forge ingredients.
 */
export function toV38(save: SaveData): SaveData {
  const legacy = save.gear.some((piece) => "quality" in piece);
  const hearts = ELEMENTS.some(
    (element) => save.materials[`${element}Heart`] !== undefined,
  );
  if (!legacy && !hearts && !("mastery" in save)) return save;
  const materials = { ...save.materials };
  const gear = save.gear.map((piece) => {
    if (!("quality" in piece)) return piece;
    const { gear: migrated, refund } = migrateGear(
      piece as unknown as LegacyGear,
    );
    if (refund)
      materials[stoneId(refund)] = (materials[stoneId(refund)] ?? 0) + 1;
    return migrated;
  });
  for (const element of ELEMENTS) {
    const held = materials[`${element}Heart`];
    if (held === undefined) continue;
    materials[stoneId(element)] = (materials[stoneId(element)] ?? 0) + held;
    delete materials[`${element}Heart`];
  }
  const next: SaveData & { mastery?: unknown } = { ...save, gear, materials };
  delete next.mastery;
  return next;
}

/**
 * Version 39: the outdoor gatherer works around the player. The camp leaves
 * the hero's job (a hero already on the gatherer stays on it), and the anchor
 * history starts empty with no focus. Uncollected gatherer output is kept.
 */
export function toV39(save: SaveData): SaveData {
  const camped = save.heroes.some((hero) => hero.job && "camp" in hero.job);
  if (save.gatherer && !camped) return save;
  const heroes = save.heroes.map((hero) => {
    if (!hero.job || !("camp" in hero.job)) return hero;
    const { camp: _camp, ...job } = hero.job as typeof hero.job & { camp?: unknown };
    return { ...hero, job };
  });
  return { ...save, heroes, gatherer: save.gatherer ?? { anchors: [], focus: "any" } };
}

/** The threats of an old briefing, mapped onto the seven: merged ones keep the highest level, Locals is dropped. */
function mapThreats<T extends { id: string; level: ActiveThreat["level"]; element?: Element }>(threats: T[]): T[] {
  const mapped: T[] = [];
  for (const threat of threats) {
    const id = LEGACY_THREAT_MAP[threat.id];
    if (!id) continue;
    const same = mapped.findIndex((t) => t.id === id);
    const next = { ...threat, id, ...(id === "element" && !threat.element ? { element: "water" as Element } : {}) };
    if (same === -1) mapped.push(next);
    else if (next.level > mapped[same].level) mapped[same] = { ...next, element: mapped[same].element ?? next.element };
  }
  return mapped;
}

const mapBriefing = (briefing: Briefing): Briefing => ({ ...briefing, threats: mapThreats(briefing.threats) });

const STATE_RANK = { met: 0, half: 1, full: 2 } as const;

type OldHero = HeroState & {
  approachPicks?: unknown;
  gamble?: unknown;
  kitFor?: unknown;
  roll?: HeroState["roll"] & { approach?: unknown };
};

/**
 * Version 40: threats are answered by families. Approach picks, the recruit
 * roll's approach, the Gambler's rolled approaches and the Porter's carried
 * kit go. Kits, held or in a slot, are refunded as the materials of their
 * recipe; talismans are sold to the smithy at its price. Running expeditions
 * and reports have their threats mapped onto the seven (see LEGACY_THREAT_MAP),
 * and kit recipes and quests asking for a kit are dropped.
 */
export function toV40(save: SaveData): SaveData {
  const isKit = (id: string | null | undefined) => !!id && id in LEGACY_KIT_REFUNDS;
  const oldThreats = (threats: { id: string }[] = []) => threats.some((t) => LEGACY_THREAT_MAP[t.id] !== t.id);
  const legacy =
    Object.keys(save.consumables).some(isKit) ||
    save.gear.some((piece) => LEGACY_TALISMAN.test(piece.itemId)) ||
    (save.heroes as OldHero[]).some(
      (h) =>
        "approachPicks" in h || "gamble" in h || "kitFor" in h || (h.roll && "approach" in h.roll) ||
        isKit(h.equipment.consumable) || isKit(h.equipment.potion),
    ) ||
    save.expeditions.some((e) => oldThreats(e.briefing?.threats)) ||
    save.reports.some((r) => oldThreats(r.threats) || oldThreats(r.briefing?.threats) || (r.salvaged ?? []).some((e) => isKit(e.itemId))) ||
    save.knownRecipes.some(isKit) ||
    save.partRecipes.some(isKit) ||
    save.quests.list.some((q) => isKit(q.itemId));
  if (!legacy) return save;
  const materials = { ...save.materials };
  const refund = (id: string, count: number) => {
    for (const [materialId, amount] of Object.entries(LEGACY_KIT_REFUNDS[id]))
      materials[materialId] = (materials[materialId] ?? 0) + amount * count;
  };

  const consumables = { ...save.consumables };
  for (const id of Object.keys(consumables)) {
    if (!isKit(id)) continue;
    refund(id, consumables[id]);
    delete consumables[id];
  }

  let gold = save.gold;
  const talismans = new Set<string>();
  const gear = save.gear.filter((piece) => {
    const match = LEGACY_TALISMAN.exec(piece.itemId);
    if (!match) return true;
    const price = Math.round(shopRules.gearPrice[Number(match[2]) - 1] * shopRules.rarityPrice[piece.rarity]);
    gold += Math.round(price * shopRules.gearSellShare);
    talismans.add(piece.uid);
    return false;
  });

  const heroes = (save.heroes as OldHero[]).map((old) => {
    const { approachPicks: _picks, gamble: _gamble, kitFor: _kitFor, ...hero } = old;
    const equipment = { ...hero.equipment };
    for (const slot of ["consumable", "potion"] as const) {
      const id = equipment[slot];
      if (id && isKit(id)) {
        refund(id, 1);
        equipment[slot] = null;
      }
    }
    if (equipment.trinket && talismans.has(equipment.trinket)) equipment.trinket = null;
    const { approach: _approach, ...roll } = (hero.roll ?? {}) as NonNullable<OldHero["roll"]>;
    return { ...hero, equipment, ...(hero.roll ? { roll } : {}) } as HeroState;
  });

  const reports = save.reports.map((report): ExpeditionReport => {
    const threats: ExpeditionReport["threats"] = [];
    for (const threat of report.threats ?? []) {
      const [mapped] = mapThreats([threat]);
      if (!mapped) continue;
      const same = threats.findIndex((t) => t.id === mapped.id);
      if (same === -1) threats.push(mapped);
      else if (STATE_RANK[mapped.state] > STATE_RANK[threats[same].state]) threats[same] = mapped;
    }
    return {
      ...report,
      threats,
      ...(report.briefing ? { briefing: mapBriefing(report.briefing) } : {}),
      salvaged: (report.salvaged ?? []).filter((entry) => !isKit(entry.itemId)),
    };
  });

  return {
    ...save,
    gold,
    materials,
    consumables,
    gear,
    heroes,
    reports,
    expeditions: save.expeditions.map((e) => (e.briefing ? { ...e, briefing: mapBriefing(e.briefing) } : e)),
    knownRecipes: save.knownRecipes.filter((id) => !isKit(id)),
    partRecipes: save.partRecipes.filter((id) => !isKit(id)),
    quests: { ...save.quests, list: save.quests.list.filter((quest) => !isKit(quest.itemId)) },
  };
}

const isLegacyAffix = (id: string) => id in LEGACY_KEYWORD_AFFIXES || LEGACY_STEADY.test(id);

/**
 * A piece's affixes without components: a keyword affix becomes the closest
 * part affix for the piece's slot (offensive or defensive), at the same place
 * in its range (a fixed one in the middle); a Steady affix, or a keyword one
 * whose part affix the piece already has, rerolls from the slot's pool,
 * seeded by the uid.
 */
function migrateAffixes(piece: GearInstance): GearInstance {
  if (!piece.affixes.some((affix) => isLegacyAffix(affix.id))) return piece;
  const slot = affixSlotOf((itemById[piece.itemId] as GearDef).gearType);
  const taken = new Set(piece.affixes.filter((affix) => !isLegacyAffix(affix.id)).map((affix) => affix.id));
  const converted = piece.affixes.map((affix) => {
    if (!isLegacyAffix(affix.id)) return affix;
    const legacy = LEGACY_KEYWORD_AFFIXES[affix.id];
    if (!legacy || slot === "any" || taken.has(legacy[slot])) return null;
    const target = affixById[legacy[slot]];
    taken.add(target.id);
    const share = legacy.range
      ? Math.min(1, Math.max(0, (affix.value - legacy.range.min) / (legacy.range.max - legacy.range.min)))
      : 0.5;
    const value = target.range ? Math.round(target.range.min + share * (target.range.max - target.range.min)) : 0;
    return { id: target.id, value };
  });
  const rng = createRng(`${piece.uid}|v41`);
  const affixes: GearInstance["affixes"] = [];
  converted.forEach((affix, i) => {
    if (affix) {
      affixes.push(affix);
      return;
    }
    const held = [...affixes, ...converted.slice(i + 1).filter((next) => next !== null)];
    affixes.push(...rollAffixes(rng, { ...piece, affixes: held }, 1, affixPool(piece)));
  });
  return { ...piece, affixes };
}

/** Material stacks without components: each held one becomes two monster parts of its enemy's family. */
function migrateStacks(stacks: MaterialStack[]): MaterialStack[] {
  if (!stacks.some((stack) => stack.materialId in LEGACY_COMPONENT_PARTS)) return stacks;
  const merged: MaterialStack[] = [];
  for (const stack of stacks) {
    const part = LEGACY_COMPONENT_PARTS[stack.materialId];
    const next = part ? { materialId: part, amount: stack.amount * LEGACY_COMPONENT_PART_COUNT } : stack;
    const same = merged.find((m) => m.materialId === next.materialId);
    if (same) same.amount += next.amount;
    else merged.push({ ...next });
  }
  return merged;
}

/** Loot not yet granted (or kept in a report) without components, the old category renamed; its gear rolls affixes when granted. */
const migrateLoot = (loot: Loot): Loot => ({
  ...loot,
  materials: migrateStacks(loot.materials),
  dropped: loot.dropped.map((category) => ((category as string) === "components" ? "trophies" : category)),
});

/**
 * Version 41: components, their keyword affixes and the Steady affix are gone
 * (families rework). Held components become two monster parts each (see
 * LEGACY_COMPONENT_PARTS), there and in the loot of fights and heists still
 * under way and of kept reports; gear affixes change as in migrateAffixes.
 */
export function toV41(save: SaveData): SaveData {
  const oldStacks = (stacks: MaterialStack[]) => stacks.some((stack) => stack.materialId in LEGACY_COMPONENT_PARTS);
  const oldLoot = (loot: Loot | undefined) =>
    !!loot && (oldStacks(loot.materials) || loot.dropped.includes("components" as Loot["dropped"][number]));
  const legacy =
    Object.keys(save.materials).some((id) => id in LEGACY_COMPONENT_PARTS) ||
    save.gear.some((piece) => piece.affixes.some((affix) => isLegacyAffix(affix.id))) ||
    save.placeFights.some((fight) => oldLoot(fight.reward)) ||
    save.heists.some((heist) => oldLoot(heist.reward)) ||
    save.reports.some(
      (report) => oldLoot(report.loot) || oldLoot(report.prize) || (report.salvaged ?? []).some((entry) => oldStacks(entry.materials)),
    );
  if (!legacy) return save;
  const materials = { ...save.materials };
  for (const [componentId, part] of Object.entries(LEGACY_COMPONENT_PARTS)) {
    const held = materials[componentId];
    if (held === undefined) continue;
    delete materials[componentId];
    if (held > 0) materials[part] = (materials[part] ?? 0) + held * LEGACY_COMPONENT_PART_COUNT;
  }
  return {
    ...save,
    materials,
    gear: save.gear.map(migrateAffixes),
    placeFights: save.placeFights.map((fight) => ({ ...fight, reward: migrateLoot(fight.reward) })),
    heists: save.heists.map((heist) => ({ ...heist, reward: migrateLoot(heist.reward) })),
    reports: save.reports.map((report) => ({
      ...report,
      loot: migrateLoot(report.loot),
      ...(report.prize ? { prize: migrateLoot(report.prize) } : {}),
      salvaged: (report.salvaged ?? []).map((entry) => ({ ...entry, materials: migrateStacks(entry.materials) })),
    })),
  };
}

/** Version 42: the party strip's tip merged into the threats tip; its id leaves the tip lists. */
export function toV42(save: SaveData): SaveData {
  const removed = (id: string) => id === "familyStrip";
  if (!save.tips.seen.some(removed) && !save.tips.pending.some(removed)) return save;
  return { ...save, tips: { seen: save.tips.seen.filter((id) => !removed(id)), pending: save.tips.pending.filter((id) => !removed(id)) } };
}

/** Applies the migration steps in order, from the save's own version on. */
export function migrateSave(
  save: SaveData,
  fromVersion: number,
  now: number,
): SaveData {
  let next = save;
  if (fromVersion < 31) next = toV31(next, now);
  if (fromVersion < 32) next = toV32(next);
  // Version 34 runs the special roll again: builds of other branches stamped saves 33 without giving heroes a special.
  if (fromVersion < 34) next = toV33(next);
  if (fromVersion < 35) next = toV35(next, now);
  if (fromVersion < 36) next = toV36(next);
  if (fromVersion < 37) next = toV37(next);
  if (fromVersion < 38) next = toV38(next);
  if (fromVersion < 39) next = toV39(next);
  if (fromVersion < 40) next = toV40(next);
  if (fromVersion < 41) next = toV41(next);
  if (fromVersion < 42) next = toV42(next);
  return next;
}
