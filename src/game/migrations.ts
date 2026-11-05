import { affixes } from "@/content/affixes";
import type { Rarity } from "@/content/gear";
import { choiceOf, jobById, jobs } from "@/content/jobs";
import { itemById } from "@/content/lookup";
import { ELEMENTS, stoneId, type Element } from "./elements";
import { makeGearPiece } from "./gear/make";
import { statFactor } from "./gear/stats";
import { jobMaterials } from "./jobs/jobs";
import { todaysCollector } from "./loot/valuables";
import type { JobOutput, SaveData } from "./save";
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
  const componentAffix = old.component
    ? affixes.find(
        (affix) =>
          affix.source.kind === "component" &&
          affix.source.componentId === old.component,
      )
    : undefined;
  if (componentAffix) forced.push({ id: componentAffix.id });
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
  return next;
}
