import { classSpecials } from "@/content/classSpecials";
import { questRules } from "@/content/quests";

import { itemById } from "@/content/lookup";
import { gearRules } from "@/content/gear";
import { affixById } from "@/content/affixes";
import { gearStats } from "./gear/stats";
import { uniquePool } from "./gear/uniques";
import { migrateSave, toV36, toV37, toV38, toV39, toV40, toV41, toV42, toV43, toV44, toV47, toV48, toV49, toV50, toV52, toV53, toV54, toV55, toV56, toV57, toV58, toV59, toV60 } from "./migrations";
import { affixPool } from "./gear/affixes";
import { emptyLoot } from "./loot/types";
import type { Briefing, ExpeditionReport, GearDef, GearInstance } from "./types";
import { createInitialSave, type SaveData } from "./save";
import type { Quest } from "./quests/types";
import { rolledSpecial } from "./team/specials";
import { rolledTrade } from "./supply/trades";
import { emptySupply } from "./supply/state";
import { cellAt } from "./discovery/cells";
import { offsetPosition } from "./generation/geo";
import { tileCenter } from "./generation/tiles";
import type { Building } from "./supply/types";
import { rosterCap } from "./guild/guild";
import { rosterRules } from "@/content/roster";

const DAY = 86_400_000;
const origin = { latitude: 0, longitude: 0 };
const marketId = "place:market:tile:0:1";

describe("save migrations", () => {
  const collector = (id: string, overrides: Partial<Quest> = {}): Quest => ({
    id,
    objective: "collector" as Quest["objective"],
    band: "short",
    arrivedAt: 100,
    expiresAt: 2 * DAY,
    acceptedAt: 200,
    amount: 1,
    progress: 0,
    target: {
      placeId: marketId,
      kind: "market",
      position: origin,
      from: origin,
      expiresAt: 5 * DAY,
    },
    doneAt: null,
    seen: true,
    ...overrides,
  });

  const walk: Quest = {
    id: "walk-1",
    objective: "walk",
    band: "medium",
    arrivedAt: 300,
    expiresAt: 2 * DAY,
    acceptedAt: 400,
    amount: 1000,
    progress: 120,
    stepsAtArrive: 10,
    target: null,
    doneAt: null,
    seen: true,
  };

  const withQuests = (...list: Quest[]): SaveData => {
    const save = createInitialSave();
    return { ...save, quests: { ...save.quests, list } };
  };

  it("turns an open collector without its valuable into a sell goods quest", () => {
    const save = withQuests(collector("q-1"));
    const now = 10 * DAY;
    const next = migrateSave(save, 30, now);
    const quest = next.quests.list[0];
    expect(quest.id).toBe("q-1");
    expect(quest.objective).toBe("sellGoods");
    expect(quest.band).toBe("short");
    expect(quest.arrivedAt).toBe(100);
    expect(quest.expiresAt).toBe(2 * DAY);
    expect(quest.acceptedAt).toBe(200);
    expect(quest.seen).toBe(true);
    expect(quest.amount).toBe(questRules.sellGoodsGold[0]);
    expect(quest.progress).toBe(0);
    expect(quest.target).toBe(null);
    expect(quest.itemId).toBeUndefined();
  });

  it("turns every other collector into sell goods too, keeping a done one done", () => {
    const now = 10 * DAY;
    const named = collector("q-1", { itemId: "oldCoins" });
    const done = collector("q-2", { doneAt: 1000 });
    const save = withQuests(named, done, walk);
    const next = migrateSave(save, 30, now);
    const [first, second, third] = next.quests.list;
    expect(first.objective).toBe("sellGoods");
    expect(first.progress).toBe(0);
    expect(first.target).toBe(null);
    expect(second.objective).toBe("sellGoods");
    expect(second.amount).toBe(questRules.sellGoodsGold[0]);
    expect(second.progress).toBe(questRules.sellGoodsGold[0]);
    expect(second.doneAt).toBe(1000);
    expect(third).toEqual(walk);
  });

  it("does nothing for a save already at version 32", () => {
    const save = withQuests(walk);
    expect(migrateSave(save, 32, 10 * DAY)).toBe(save);
  });

  it("starts the personal tavern check unset for a version 31 save", () => {
    const { personalTavern, ...save } = createInitialSave();
    const next = migrateSave(save as unknown as SaveData, 31, 10 * DAY);
    expect(next.personalTavern).toBeNull();
    expect(next).toEqual({ ...save, personalTavern: null });
  });

  // A version 32 save: its heroes have no special yet.
  const save = createInitialSave();
  const v32 = {
    ...save,
    heroes: save.heroes.map(({ special: _special, ...hero }) => hero),
  } as unknown as SaveData;

  it("rolls every hero a special from its class pool, and changes nothing else", () => {
    const next = migrateSave(v32, 32, 10 * DAY);
    expect(next).toEqual(save);
    for (const hero of next.heroes) {
      const pool = classSpecials[hero.classId];
      expect([...pool.common, pool.rare]).toContain(hero.special);
      expect(hero.special).toBe(rolledSpecial(hero.id, hero.classId));
    }
  });

  it("rolls the missing specials of a save another build already stamped 33", () => {
    expect(migrateSave(v32, 33, 10 * DAY)).toEqual(save);
  });

  it("rolls the same special for the same hero id", () => {
    expect(migrateSave(v32, 32, 10 * DAY)).toEqual(
      migrateSave(v32, 32, 20 * DAY),
    );
  });

  it("leaves heroes that already have a special alone", () => {
    const rare = classSpecials[v32.heroes[0].classId].rare;
    const withSpecial = {
      ...v32,
      heroes: [{ ...v32.heroes[0], special: rare }, ...v32.heroes.slice(1)],
    } as SaveData;
    const next = migrateSave(withSpecial, 32, 10 * DAY);
    expect(next.heroes[0]).toBe(withSpecial.heroes[0]);
    expect(next.heroes.slice(1).every((hero) => hero.special)).toBe(true);
  });

  describe("version 35: jobs", () => {
    // A version 34 save: no jobs, no energy, no job output.
    const save = createInitialSave();
    const { jobOutput: _jobOutput, ...rest } = save;
    const v34 = {
      ...rest,
      heroes: save.heroes.map(
        ({ job: _job, energy: _energy, ...hero }) => hero,
      ),
    } as unknown as SaveData;

    it("gives every hero no job and full energy, and the save no job output", () => {
      const next = migrateSave(v34, 34, 10 * DAY);
      for (const hero of next.heroes) {
        expect(hero.job).toBeNull();
        expect(hero.energy).toEqual({ value: 100, at: 10 * DAY });
      }
      expect(next.jobOutput).toEqual({});
    });

    it("keeps everything else the player has", () => {
      const next = migrateSave(v34, 34, 10 * DAY);
      expect({
        ...next,
        heroes: next.heroes.map((h) => ({
          ...h,
          energy: save.heroes[0].energy,
        })),
      }).toEqual(save);
    });

    it("leaves a save already at version 35 alone", () => {
      expect(migrateSave(save, 35, 10 * DAY)).toBe(save);
    });
  });

  describe("version 36: gathering jobs", () => {
    // A version 35 save: output was one amount per station, and choices were not saved yet.
    const fresh = createInitialSave();
    const { jobOutput: _jobOutput, jobChoice: _jobChoice, ...rest } = fresh;
    const v35 = {
      ...rest,
      jobOutput: { woodcutter: { amount: 2.5, since: 5 * DAY } },
    } as unknown as SaveData;

    it("turns a station amount into whole units of its material plus the fraction", () => {
      const next = toV36(v35);
      expect(next.jobOutput.woodcutter).toEqual({
        amounts: { wood: 2 },
        fraction: 0.5,
        units: 2,
        since: 5 * DAY,
      });
      expect(next.jobChoice).toEqual({ miner: null });
    });

    it("keeps nothing but the fraction of an amount below one unit", () => {
      const subUnit = {
        ...v35,
        jobOutput: { woodcutter: { amount: 0.25, since: 6 * DAY } },
      } as unknown as SaveData;
      expect(toV36(subUnit).jobOutput.woodcutter).toEqual({
        amounts: {},
        fraction: 0.25,
        units: 0,
        since: 6 * DAY,
      });
    });

    it("keeps a choice the save already had", () => {
      const withChoice = {
        ...v35,
        jobChoice: { miner: "stone" },
      } as unknown as SaveData;
      expect(toV36(withChoice).jobChoice).toEqual({
        miner: "stone",
      });
    });

    it("carries a version 34 save through both job migrations", () => {
      const save = createInitialSave();
      const {
        jobOutput: _out,
        jobChoice: _choice,
        heroes: heroesWithJobs,
        ...restOf
      } = save;
      const v34 = {
        ...restOf,
        heroes: heroesWithJobs.map(
          ({ job: _job, energy: _energy, ...hero }) => hero,
        ),
      } as unknown as SaveData;
      const next = migrateSave(v34, 34, 10 * DAY);
      expect(next.jobOutput).toEqual({});
      // Version 60 drops the miner's choice with the guild jobs.
      expect(next.jobChoice).toEqual({});
      for (const hero of next.heroes) {
        expect(hero.job).toBeNull();
        expect(hero.energy.value).toBe(100);
      }
    });

    it("leaves a save already at version 36 alone", () => {
      const save = createInitialSave();
      expect(migrateSave(save, 36, 10 * DAY)).toBe(save);
    });
  });

  describe("version 37: the outdoor gatherer", () => {
    // A version 36 save: heroes could work jobs, an entry could hold output.
    const v36 = () => {
      const fresh = createInitialSave();
      return {
        ...fresh,
        heroes: fresh.heroes.map((h) =>
          h.id === "bram"
            ? {
                ...h,
                job: { jobId: "woodcutter", since: 10 * DAY, tired: false },
              }
            : h,
        ),
        jobOutput: {
          woodcutter: {
            amounts: { wood: 2 },
            fraction: 0.5,
            units: 2,
            since: 10 * DAY,
          },
        },
        jobChoice: { miner: null },
      } as SaveData;
    };

    it("migrates without a camp, gatherer output or new counters", () => {
      const next = toV37(v36());
      expect(next.jobOutput.woodcutter).toEqual({
        amounts: { wood: 2 },
        fraction: 0.5,
        units: 2,
        since: 10 * DAY,
      });
      expect(next.jobOutput.gatherer).toBeUndefined();
      expect(next.jobChoice.miner).toBeNull();
    });

    it("leaves a save already carrying its choices alone", () => {
      const save = v36();
      expect(toV37(save)).toBe(save);
    });
  });

  describe("version 38: the gear rework", () => {
    // A version 37 save: quality multipliers, element/luck/component fields, hearts and mastery.
    const legacyGear = [
      { uid: "g1", itemId: "sword1", quality: "crappy", roll: 0.94 },
      { uid: "g2", itemId: "sword1", quality: "normal", roll: 1 },
      { uid: "g3", itemId: "plate1", quality: "uncommon", roll: 1.03 },
      {
        uid: "g4",
        itemId: "sword1",
        quality: "rare",
        roll: 1.06,
        component: "dragonClaw",
      },
      {
        uid: "g5",
        itemId: "sword1",
        quality: "legendary",
        roll: 1.02,
        luck: 1,
        element: "fire",
      },
      {
        uid: "g6",
        itemId: "sword1",
        quality: "normal",
        roll: 0.97,
        element: "water",
      },
      { uid: "g7", itemId: "plate1", quality: "normal", element: "stone" },
      {
        uid: "g8",
        itemId: "bow1",
        quality: "legendary",
        roll: 1,
        relicId: "poachersLongbow",
      },
      { uid: "g9", itemId: "hawkEyeRing2", quality: "rare" },
      {
        uid: "g10",
        itemId: "mace1",
        quality: "rare",
        roll: 1,
        component: "fireHeart",
        element: "fire",
      },
      {
        uid: "g11",
        itemId: "hawkEyeRing1",
        quality: "normal",
        element: "grass",
      },
    ];
    const multipliers: Record<string, number> = {
      crappy: 0.85,
      normal: 1,
      uncommon: 1.07,
      rare: 1.15,
      legendary: 1.3,
    };
    const v37 = () =>
      ({
        ...createInitialSave(),
        gear: legacyGear,
        materials: { waterHeart: 2, waterStone: 1, dragonClaw: 1 },
        mastery: { sword: { level: 4, progress: 1 } },
      }) as unknown as SaveData;
    const byUid = (save: SaveData, uid: string) =>
      save.gear.find((g) => g.uid === uid)!;

    it("maps qualities to rarities with the right number of affixes", () => {
      const next = migrateSave(v37(), 37, 0);
      expect(next.gear.map((g) => g.rarity)).toEqual([
        "common",
        "common",
        "uncommon",
        "rare",
        "legendary",
        "uncommon",
        "uncommon",
        "legendary",
        "rare",
        "rare",
        "common",
      ]);
      for (const piece of next.gear) {
        expect(piece.affixes).toHaveLength(gearRules.affixCount[piece.rarity]);
        expect(new Set(piece.affixes.map((a) => a.id)).size).toBe(
          piece.affixes.length,
        );
        expect(piece.rerolls).toBe(0);
        expect("quality" in piece).toBe(false);
      }
    });

    it("turns components, infusions and Luck into affixes", () => {
      const next = migrateSave(v37(), 37, 0);
      // Component affixes are gone: the dragon claw's Cleaving became the closest part affix.
      expect(byUid(next, "g4").affixes.map((a) => a.id)).toContain("bloodthirsty");
      expect(byUid(next, "g5").affixes.map((a) => a.id)).toEqual(
        expect.arrayContaining(["infusedFire", "lucky"]),
      );
      expect(
        byUid(next, "g5").affixes.find((a) => a.id === "lucky")!.value,
      ).toBe(1);
      expect(byUid(next, "g6").affixes.map((a) => a.id)).toEqual([
        "infusedWater",
      ]);
      expect(byUid(next, "g7").affixes.map((a) => a.id)).toEqual([
        "wardingStone",
      ]);
      expect(
        byUid(next, "g10")
          .affixes.map((a) => a.id)
          .filter((id) => affixById[id].group === "element"),
      ).toEqual(["infusedFire"]);
    });

    it("gives a non-relic Legendary one fitting unique, and keeps a relic as its own", () => {
      const next = migrateSave(v37(), 37, 0);
      const legendary = byUid(next, "g5");
      expect(uniquePool(legendary).map((r) => r.id)).toContain(
        legendary.unique,
      );
      expect(byUid(next, "g8").relicId).toBe("poachersLongbow");
      expect(byUid(next, "g8").unique).toBeUndefined();
      expect(byUid(next, "g2").unique).toBeUndefined();
    });

    it("keeps every piece close to its old stats", () => {
      const next = migrateSave(v37(), 37, 0);
      for (const old of legacyGear) {
        if (itemById[old.itemId].slot === "trinket" || old.relicId) continue;
        const base = (itemById[old.itemId] as GearDef).stats;
        const now = gearStats(byUid(next, old.uid));
        for (const key of ["power", "armour", "hp"] as const) {
          if (!base[key]) continue;
          const before =
            base[key]! * multipliers[old.quality] * (old.roll ?? 1);
          expect(Math.abs(now[key]! - before) / before).toBeLessThan(0.03);
        }
      }
    });

    it("turns hearts into stones, refunds an element on a trinket and drops mastery", () => {
      const next = migrateSave(v37(), 37, 0);
      expect(next.materials.waterHeart).toBeUndefined();
      expect(next.materials.waterStone).toBe(3);
      expect(next.materials.grassStone).toBe(1);
      // The dragon claw stays a component until version 41 turns it into two scales.
      expect(next.materials.dragonClaw).toBeUndefined();
      expect(next.materials.scale).toBe(2);
      expect("mastery" in next).toBe(false);
    });

    it("is deterministic and leaves a migrated save alone", () => {
      const once = migrateSave(v37(), 37, 0);
      const again = migrateSave(v37(), 37, 0);
      expect(again.gear).toEqual(once.gear);
      expect(again.materials).toEqual(once.materials);
      expect(toV38(once)).toBe(once);
    });
  });

  describe("version 39: the gatherer works around the player", () => {
    // A version 38 save: Bram camped as the gatherer, with output waiting.
    const v38 = () => {
      const fresh = createInitialSave();
      const { gatherer: _gatherer, ...rest } = fresh;
      return {
        ...rest,
        heroes: fresh.heroes.map((h) =>
          h.id === "bram"
            ? {
                ...h,
                job: {
                  jobId: "gatherer",
                  since: 10 * DAY,
                  tired: false,
                  camp: { position: { latitude: 48.85, longitude: 2.35 }, since: 10 * DAY },
                },
              }
            : h,
        ),
        jobOutput: {
          gatherer: {
            amounts: { wood: 3, herb: 1 },
            fraction: 0,
            units: 4,
            nodes: 4,
            lastNodeAt: 11 * DAY,
            wounds: [{ at: 11 * DAY, heroId: "bram", hp: 2 }],
            since: 11 * DAY,
          },
        },
      } as unknown as SaveData;
    };

    it("drops the camp, keeps the hero on the gatherer and its output, and starts an empty anchor history", () => {
      const old = v38();
      const next = migrateSave(old, 38, 12 * DAY);
      const bram = next.heroes.find((h) => h.id === "bram")!;
      expect(bram.job).toEqual({ jobId: "gatherer", since: 10 * DAY, tired: false });
      expect(next.jobOutput.gatherer).toEqual(old.jobOutput.gatherer);
      expect(next.gatherer).toEqual({ anchors: [], focus: "any" });
    });

    it("leaves a save already at version 39 alone", () => {
      const save = createInitialSave();
      expect(toV39(save).gatherer).toBe(save.gatherer);
      expect(migrateSave(save, 40, 12 * DAY)).toBe(save);
    });
  });

  describe("version 40: threats answered by families", () => {
    // A version 39 save: approach picks, kits held and in slots, a talisman worn, a run under way and a report under the old threats.
    const v39 = () => {
      const fresh = createInitialSave();
      const [bram, lyra, ...rest] = fresh.heroes;
      return {
        ...fresh,
        gold: 0,
        materials: { bone: 1 },
        consumables: { healingPotion: 2, roguesRoll: 2, blessedRelics: 1 },
        knownRecipes: [...fresh.knownRecipes, "roguesRoll"],
        gear: [
          ...fresh.gear,
          { uid: "t1", itemId: "oxTalisman3", rarity: "rare", roll: 10, affixes: [], rerolls: 0 },
        ],
        heroes: [
          {
            ...bram,
            level: 10,
            approachPicks: ["might", "wits"],
            roll: { ...bram.roll, approach: "faith" },
            equipment: { ...bram.equipment, consumable: "huntersPack", trinket: "t1" },
          },
          { ...lyra, kitFor: "bram", gamble: { day: 3, approaches: { might: 2, finesse: 2, wits: 2, faith: 1, presence: 1 } } },
          ...rest,
        ],
        expeditions: [
          {
            id: "e1",
            dungeonId: "ratCellar",
            heroIds: ["bram"],
            startedAt: 0,
            endsAt: DAY,
            seed: "s",
            notificationId: null,
            briefing: {
              threats: [
                { id: "undead", level: 1 },
                { id: "desecrated", level: 2 },
                { id: "locals", level: 1 },
                { id: "casters", level: 2 },
              ],
              restriction: null,
              opportunity: "bounty",
            },
          },
        ],
        reports: [
          {
            ...({} as SaveData["reports"][number]),
            id: "r1",
            threats: [
              { id: "rubble", level: 1, state: "met" },
              { id: "locked", level: 2, state: "full" },
            ],
            salvaged: [
              { heroId: "bram", itemId: "lantern", materials: [{ materialId: "copper", amount: 1 }], gold: 0 },
              { heroId: "bram", itemId: "healingPotion", materials: [{ materialId: "herb", amount: 1 }], gold: 0 },
            ],
          },
        ],
        quests: {
          ...fresh.quests,
          list: [
            { id: "q1", objective: "deliver", itemId: "roguesRoll" },
            { id: "q2", objective: "deliver", itemId: "healingPotion" },
          ],
        },
      } as unknown as SaveData;
    };

    it("drops approach picks, the roll's approach, the Gambler's roll and the Porter's pick", () => {
      const next = migrateSave(v39(), 39, 12 * DAY);
      const [bram, lyra] = next.heroes;
      expect(bram).not.toHaveProperty("approachPicks");
      expect(bram.roll).not.toHaveProperty("approach");
      expect(bram.roll?.base).toEqual(v39().heroes[0].roll?.base);
      expect(bram.level).toBe(10);
      expect(lyra).not.toHaveProperty("gamble");
      expect(lyra).not.toHaveProperty("kitFor");
    });

    it("refunds kits held and worn as their recipe's materials", () => {
      const next = migrateSave(v39(), 39, 12 * DAY);
      // Two Rogue's rolls (bone 2, hide 1), a Hunter's pack in Bram's slot (bone, meat, hide), blessed symbols (copper, herb, stone).
      expect(next.materials).toEqual({ bone: 1 + 4 + 1, hide: 2 + 1, meat: 1, copper: 1, herb: 1, stone: 1 });
      expect(next.consumables).toEqual({ healingPotion: 2 });
      expect(next.heroes[0].equipment.consumable).toBeNull();
      expect(next.knownRecipes).not.toContain("roguesRoll");
      expect(next.quests.list.map((q) => q.id)).toEqual(["q2"]);
    });

    it("sells talismans to the smithy, taking them off", () => {
      const next = migrateSave(v39(), 39, 12 * DAY);
      // A tier 3 Rare piece: round(40 × 2) × 0.3 = 24.
      expect(next.gold).toBe(24);
      expect(next.gear.some((g) => g.uid === "t1")).toBe(false);
      expect(next.heroes[0].equipment.trinket).toBeNull();
    });

    it("maps a running expedition's threats onto the seven", () => {
      const next = migrateSave(v39(), 39, 12 * DAY);
      expect(next.expeditions[0].briefing).toEqual({
        threats: [
          { id: "holy", level: 2 },
          { id: "element", level: 2, element: "water" },
        ],
        restriction: null,
        opportunity: "bounty",
      });
    });

    it("maps a report's threats, keeping the worst state, and drops kit salvage lines", () => {
      const [report] = migrateSave(v39(), 39, 12 * DAY).reports;
      expect(report.threats).toEqual([{ id: "traps", level: 2, state: "full" }]);
      expect(report.salvaged.map((s) => s.itemId)).toEqual(["healingPotion"]);
    });

    it("leaves a save with nothing of the old answers alone", () => {
      const save = createInitialSave();
      expect(toV40(save)).toBe(save);
    });
  });

  describe("version 41: components, keyword affixes and Steady removed", () => {
    const piece = (uid: string, itemId: string, affixes: GearInstance["affixes"]): GearInstance => ({
      uid,
      itemId,
      rarity: affixes.length === 1 ? "uncommon" : "rare",
      roll: 10,
      affixes,
      rerolls: 0,
    });
    const report = (loot: ExpeditionReport["loot"]) =>
      ({ id: "r1", loot, salvaged: [{ heroId: "bram", itemId: "sword1", materials: [{ materialId: "golemCore", amount: 1 }], gold: 0 }] }) as unknown as ExpeditionReport;
    // A version 40 save: components held, in a kept report and in a fight under way; gear with keyword and Steady affixes.
    const v40 = (): SaveData => {
      const fresh = createInitialSave();
      return {
        ...fresh,
        materials: { bone: 3, scale: 1, dragonClaw: 1, spiderSilk: 2, captainsSpurs: 0 },
        gear: [
          piece("g1", "sword1", [{ id: "cleaving", value: 0 }]),
          piece("g2", "leather2", [{ id: "silken", value: 8 }, { id: "thickHide", value: 20 }]),
          piece("g3", "mail2", [{ id: "fleet", value: 3 }]),
          piece("g4", "shield1", [{ id: "bulwark", value: 5 }, { id: "guarding", value: 0 }]),
          piece("g5", "plate1", [{ id: "steadyPoison", value: 20 }]),
          piece("g6", "mace1", [{ id: "hallowed", value: 20 }]),
        ],
        reports: [report({ ...emptyLoot(), materials: [{ materialId: "dragonClaw", amount: 1 }, { materialId: "scale", amount: 2 }], dropped: ["components" as never] })],
        placeFights: [{ id: "f1", reward: { ...emptyLoot(), materials: [{ materialId: "drakeFang", amount: 1 }] } } as unknown as SaveData["placeFights"][number]],
      };
    };
    const affixesOf = (save: SaveData, uid: string) => save.gear.find((g) => g.uid === uid)!.affixes;

    it("turns each held component into two monster parts of its enemy's family", () => {
      const next = migrateSave(v40(), 40, 0);
      expect(next.materials).toEqual({ bone: 3, scale: 3, venomSac: 4 });
    });

    it("turns a keyword affix into the closest part affix for the slot, at the same place in its range", () => {
      const next = migrateSave(v40(), 40, 0);
      // Fixed Cleaving sits mid-range: Bloodthirsty 2–5 gives 4.
      expect(affixesOf(next, "g1")).toEqual([{ id: "bloodthirsty", value: 4 }]);
      // Silken at its top (8 of 4–8) gives Light at its top (6); the other affix stays.
      expect(affixesOf(next, "g2")).toEqual([{ id: "light", value: 6 }, { id: "thickHide", value: 20 }]);
      // Fleet mid-range (3 of 2–4) gives Light mid-range (4).
      expect(affixesOf(next, "g3")).toEqual([{ id: "light", value: 4 }]);
      expect(affixesOf(next, "g6")).toEqual([{ id: "hallowed", value: 20 }]);
    });

    it("rerolls Steady, and a keyword affix whose part affix is already there, from the slot's pool by uid", () => {
      const next = migrateSave(v40(), 40, 0);
      for (const uid of ["g4", "g5"]) {
        const piece = next.gear.find((g) => g.uid === uid)!;
        const before = v40().gear.find((g) => g.uid === uid)!;
        expect(piece.affixes).toHaveLength(before.affixes.length);
        expect(new Set(piece.affixes.map((a) => a.id)).size).toBe(piece.affixes.length);
        const pool = affixPool(piece).map((a) => a.id);
        for (const affix of piece.affixes) expect(pool).toContain(affix.id);
      }
      expect(affixesOf(next, "g4")[0]).toEqual({ id: "bulwark", value: 5 });
      expect(affixesOf(next, "g4")[1].id).not.toBe("guarding");
      expect(affixesOf(migrateSave(v40(), 40, 0), "g5")).toEqual(affixesOf(next, "g5"));
    });

    it("converts components in kept reports and in loot still to be granted", () => {
      const next = migrateSave(v40(), 40, 0);
      expect(next.reports[0].loot.materials).toEqual([{ materialId: "scale", amount: 4 }]);
      expect(next.reports[0].loot.dropped).toEqual(["trophies"]);
      expect(next.reports[0].salvaged[0].materials).toEqual([{ materialId: "cog", amount: 2 }]);
      expect(next.placeFights[0].reward.materials).toEqual([{ materialId: "fangOrHorn", amount: 2 }]);
    });

    it("leaves a save without components alone, and a migrated one too", () => {
      const save = createInitialSave();
      expect(toV41(save)).toBe(save);
      const once = toV41(v40());
      expect(toV41(once)).toBe(once);
    });
  });
});

describe("toV42", () => {
  it("drops the party strip tip a version 41 save saw or still waits on, and keeps the rest", () => {
    const base = createInitialSave();
    const v41 = { ...base, tips: { seen: ["specials", "familyStrip", "families"], pending: ["familyStrip", "threats"] } } as unknown as SaveData;
    const next = migrateSave(v41, 41, 0);
    expect(next.tips).toEqual({ seen: ["specials", "families"], pending: ["threats"] });
    expect(toV42(base)).toBe(base);
  });
});

describe("toV43", () => {
  const v42 = (): SaveData => {
    const base = createInitialSave();
    const fog = { threats: [{ id: "darkness", level: 2 }], restriction: "thickFog", opportunity: null } as unknown as Briefing;
    const cursed: Briefing = { threats: [], restriction: "cursedLuck", opportunity: null };
    return {
      ...base,
      knownRecipes: ["sword1", "mail1", "axe2"],
      expeditions: [{ id: "e1", briefing: fog }, { id: "e2", briefing: cursed }, { id: "e3" }] as unknown as SaveData["expeditions"],
      reports: [{ id: "r1", briefing: fog }] as unknown as SaveData["reports"],
    };
  };

  it("learns the new starting blueprints and keeps the known ones", () => {
    const next = toV43(v42());
    expect(next.knownRecipes).toEqual(["sword1", "mail1", "axe2", "spear1", "lute1", "flasks1", "focus1", "knuckles1"]);
    expect(toV43(next).knownRecipes).toEqual(next.knownRecipes);
  });

  it("lifts Thick fog from running expeditions and reports, and leaves other restrictions", () => {
    const next = migrateSave(v42(), 42, 0);
    expect(next.expeditions.map((e) => e.briefing?.restriction)).toEqual([null, "cursedLuck", undefined]);
    expect(next.expeditions[0].briefing!.threats).toEqual([{ id: "darkness", level: 2 }]);
    expect(next.reports[0].briefing!.restriction).toBeNull();
  });
});

describe("toV44", () => {
  /** A version 43 save: heroes without a helmet slot, no launched count, two reported runs and one running. */
  const v43 = (): SaveData => {
    const base = createInitialSave();
    return {
      ...base,
      heroes: base.heroes.map(({ equipment: { helmet: _helmet, ...equipment }, ...hero }) => ({ ...hero, equipment })),
      stats: { patrolsWon: 1, questsDone: 2 },
      knownRecipes: ["sword1", "mail1", "axe2"],
      gear: [{ uid: "g1", itemId: "plate2", rarity: "rare", roll: 9, affixes: [{ id: "thickHide", value: 20 }, { id: "light", value: 3 }], rerolls: 1 }],
      expeditions: [{ id: "e1", dungeonId: "goblinWarren" }] as unknown as SaveData["expeditions"],
      reports: [{ id: "r1", dungeonId: "wolfDen" }, { id: "r2", dungeonId: "goblinWarren" }, { id: "r0", dungeonId: "ratCellar" }] as unknown as SaveData["reports"],
    } as unknown as SaveData;
  };

  it("gives every hero an empty helmet slot and keeps what they wear", () => {
    const old = v43();
    const next = migrateSave(old, 43, 0);
    expect(next.heroes.map((h) => h.equipment.helmet)).toEqual(old.heroes.map(() => null));
    expect(next.heroes.map(({ equipment: { helmet: _helmet, ...rest } }) => rest)).toEqual(old.heroes.map((h) => h.equipment));
    // Version 50 then starts the gear's history.
    expect(next.gear.map(({ history: _history, ...piece }) => piece)).toEqual(old.gear);
  });

  it("learns every armour and helmet type at tier 1 and keeps the known blueprints", () => {
    const next = migrateSave(v43(), 43, 0);
    expect(next.knownRecipes).toEqual([
      "sword1", "mail1", "axe2",
      "plate1", "leather1", "robes1", "greatHelm1", "sallet1", "hood1", "plagueMask1", "runeCirclet1",
    ]);
  });

  it("counts the launched expeditions, the tutorial's left out, at least 2, so no threat-free runs follow", () => {
    expect(migrateSave(v43(), 43, 0).stats).toEqual({ patrolsWon: 1, questsDone: 2, expeditionsLaunched: 3 });
    const fresh = { ...v43(), expeditions: [], reports: [] } as SaveData;
    expect(migrateSave(fresh, 43, 0).stats.expeditionsLaunched).toBe(2);
  });

  it("leaves a version 44 save as it is", () => {
    const save = createInitialSave();
    expect(toV44(save)).toBe(save);
  });
});

describe("toV45", () => {
  type V44Save = SaveData & {
    valuables: Record<string, number>;
    collectorOverride?: { dayKey: string; valuableId: string };
  };

  const collector = (id: string, overrides: Partial<Quest> = {}): Quest => ({
    id,
    objective: "collector" as Quest["objective"],
    band: "short",
    arrivedAt: 100,
    expiresAt: 2 * DAY,
    acceptedAt: 200,
    amount: 1,
    progress: 0,
    target: {
      placeId: marketId,
      kind: "market",
      position: origin,
      from: origin,
      expiresAt: 5 * DAY,
    },
    doneAt: null,
    seen: true,
    ...overrides,
  });

  const v44 = (): V44Save => {
    const save = createInitialSave() as V44Save;
    save.gold = 100;
    save.valuables = { "oldCoins:1": 2, "jadeIdol:3": 1, "cutGem:5": 1, "unknown:2": 1 };
    save.guild = { collector: 2 } as never;
    save.collectorOverride = { dayKey: "2026-11-12", valuableId: "oldCoins" };
    const open = collector("q-open");
    const done = collector("q-done", { doneAt: 1000 });
    save.quests = { ...save.quests, list: [open, done] };
    save.patrolFights = [
      {
        id: "f1", patrolId: "p1", kind: "goblins", tier: 1, elite: false, heroIds: ["lyra"],
        startedAt: 0, endsAt: DAY, windowEndsAt: DAY, won: true, hp: [], salvaged: [],
        rewards: { ...emptyLoot(), gold: 5, valuables: [{ valuableId: "roughGem", tier: 2, amount: 2 }] } as never,
      },
    ];
    return save;
  };

  it("sells the held valuables, refunds the collector ranks and turns the quests into sell goods", () => {
    const next = migrateSave(v44(), 44, 0);
    // Held: 2 × (5 × 1) + 30 × 3 + 30 × 5.6 = 268; ranks 1 and 2 refund 150 + 270 = 420.
    expect(next.gold).toBe(100 + 268 + 420);
    expect(next.soldTreasureGold).toBe(268);
    expect((next.guild as Record<string, number>).collector).toBeUndefined();
    expect((next as Record<string, unknown>).valuables).toBeUndefined();
    expect((next as Record<string, unknown>).collectorOverride).toBeUndefined();
    const [open, done] = next.quests.list;
    expect(open.objective).toBe("sellGoods");
    expect(open.amount).toBe(questRules.sellGoodsGold[0]);
    expect(open.progress).toBe(0);
    expect(open.target).toBeNull();
    expect(done.objective).toBe("sellGoods");
    expect(done.amount).toBe(questRules.sellGoodsGold[0]);
    expect(done.progress).toBe(questRules.sellGoodsGold[0]);
    expect(done.doneAt).toBe(1000);
  });

  it("pays a stored, not-yet-granted loot's valuables as gold inside it", () => {
    const next = migrateSave(v44(), 44, 0);
    // 2 × round(5 × 1.9) = 20, on top of the 5 the loot already held.
    expect(next.patrolFights[0].rewards.gold).toBe(5 + 20);
    expect((next.patrolFights[0].rewards as Record<string, unknown>).valuables).toBeUndefined();
  });

  it("leaves a save without valuables alone, apart from the removed fields", () => {
    const save = createInitialSave();
    expect(migrateSave(save, 44, 0)).toEqual(save);
  });
});

describe("toV46", () => {
  /** A version 45 save: two held charms, one worn at home, one worn on a running expedition. */
  const v45 = (): SaveData => {
    const save = createInitialSave();
    save.gold = 100;
    save.materials = { ...save.materials, wood: 7, fireShard: 2, waterShard: 5 };
    save.consumables = { ...save.consumables, bountyToken: 4, luckyEar: 2 };
    save.heroes = save.heroes.map((hero, i) => ({
      ...hero,
      equipment: { ...hero.equipment, consumable: i === 0 ? "prismCharm" : i === 1 ? "ghostLantern" : null },
    }));
    save.expeditions = [{ id: "e1", dungeonId: "wolfDen", heroIds: ["lyra"] }] as unknown as SaveData["expeditions"];
    save.knownRecipes = [...save.knownRecipes, "luckyEar"];
    save.partRecipes = ["luckyEar"];
    save.gear = [{ uid: "g1", itemId: "testCharm", rarity: "common", roll: 10, affixes: [], rerolls: 0 }];
    save.tips = { seen: ["charms" as never], pending: [] };
    save.nextUid = 9;
    return save;
  };

  it("pays held charms as one loot trinket per three copies and parts for the rest", () => {
    const next = migrateSave(v45(), 45, 0);
    // Four Bounty tokens: one trinket, one copy left = three insignia.
    expect(next.gear).toContainEqual(expect.objectContaining({ uid: "g9", itemId: "bountyToken", rarity: "common" }));
    expect(next.materials.tatteredInsignia).toBe(3);
    // Two Lucky ears: no trinket, six goblin ears.
    expect(next.gear.some((piece) => piece.itemId === "luckyEar")).toBe(false);
    expect(next.materials.goblinEar).toBe(6);
    // One Prism charm worn at home: three shards of the most-held element (water).
    expect(next.materials.waterShard).toBe(8);
    expect(next.materials.fireShard).toBe(2);
    // The Ghost lantern went to its run, not to the stock.
    expect(next.materials.ectoplasm).toBeUndefined();
    expect(next.nextUid).toBe(10);
    expect(next.consumables).not.toHaveProperty("bountyToken");
    expect(next.consumables).not.toHaveProperty("luckyEar");
    expect(next.gold).toBe(100);
    expect(next.materials.wood).toBe(7);
  });

  it("keeps a charm worn on a running expedition as that run's loot modifier and frees the slot", () => {
    const next = migrateSave(v45(), 45, 0);
    expect(next.expeditions[0].lootModifiers).toEqual([
      { id: "ghostLantern", kind: "chance", category: "keyFragments", multiplier: 1.5 },
    ]);
    expect(next.heroes.map((hero) => hero.equipment.consumable)).toEqual([null, null, null]);
  });

  it("clears the lucky ear's recipes, renames the test charm and drops the charms tip", () => {
    const next = migrateSave(v45(), 45, 0);
    expect(next.knownRecipes).not.toContain("luckyEar");
    expect(next.partRecipes).toEqual([]);
    expect(next.gear.some((piece) => piece.itemId === "testTrinket")).toBe(true);
    expect(next.gear.some((piece) => piece.itemId === "testCharm")).toBe(false);
    expect(next.tips.seen).toEqual([]);
  });

  it("counts a charm waiting in stored loot as held and drops a quest asking for one", () => {
    const save = v45();
    save.patrolFights = [
      {
        id: "f1", patrolId: "p1", kind: "goblins", tier: 1, elite: false, heroIds: ["lyra"],
        startedAt: 0, endsAt: DAY, windowEndsAt: DAY, won: true, hp: [], salvaged: [],
        rewards: { ...emptyLoot(), consumables: [{ itemId: "scarabCharm", amount: 1 }] } as never,
      },
    ];
    save.quests = {
      ...save.quests,
      list: [{ id: "q-1", objective: "deliver", itemId: "seersCandle" } as unknown as Quest],
    };
    const next = migrateSave(save, 45, 0);
    expect(next.patrolFights[0].rewards.consumables).toEqual([]);
    expect(next.quests.list).toEqual([]);
    // The Scarab charm from the loot counts as held: three chitin. The dropped
    // quest asked for a candle the player never handed in, so nothing is lost.
    expect(next.materials.ritualCandle).toBeUndefined();
    expect(next.materials.chitin).toBe(3);
  });

  it("leaves a save without charms alone", () => {
    const save = createInitialSave();
    expect(migrateSave(save, 45, 0)).toBe(save);
  });
});

describe("toV47", () => {
  it("moves the roster slot ranks to slots 13 and 14", () => {
    const save = { ...createInitialSave(), guild: { rosterSlot7: 1, rosterSlot8: 1, heroXp: 2 } as never };
    const next = migrateSave(save, 46, 0);
    expect(next.guild).toEqual({ heroXp: 2, rosterSlot13: 1, rosterSlot14: 1 });
    // The two Barracks slots on top of the starting cap (no tier boss beaten here).
    expect(rosterCap(next)).toBe(rosterRules.startCap + 2);
  });

  it("leaves a save without roster slot ranks alone", () => {
    const save = createInitialSave();
    expect(toV47(save)).toBe(save);
  });
});


describe("toV48", () => {
  const v47 = (extra: Partial<SaveData> = {}) => {
    const { freePick: _drop, ...rest } = { ...createInitialSave(), ...extra };
    return rest as SaveData;
  };

  it("gives a save past the first tier boss the free recruit it would have had", () => {
    const next = migrateSave(v47({ clearedDungeons: ["banditStockade"] }), 47, 0);
    expect(next.freePick).toHaveLength(3);
  });

  it("gives none yet to a save before it, and keeps a save already on version 48 as it is", () => {
    expect(migrateSave(v47(), 47, 0).freePick).toBeNull();
    const taken = { ...createInitialSave(), clearedDungeons: ["banditStockade"], freePick: null };
    expect(toV48(taken)).toBe(taken);
  });
});

describe("toV49", () => {
  const v48 = (extra: Partial<SaveData> = {}) => {
    const { seenFinds: _drop, ...rest } = { ...createInitialSave(), ...extra };
    return rest as SaveData;
  };

  it("counts the gear, trinkets, relics and monster parts the save holds as found", () => {
    const next = migrateSave(
      v48({
        gear: [
          { uid: "g1", itemId: "sword2", rarity: "common", roll: 8, affixes: [], rerolls: 0 },
          { uid: "g2", itemId: "bountyToken", rarity: "common", roll: 8, affixes: [], rerolls: 0 },
        ],
        relics: [{ uid: "r1", relicId: "poachersLongbow" }],
        materials: { goblinEar: 2, feather: 0, wood: 5 },
      }),
      48,
      0,
    );
    expect(next.seenFinds.sort()).toEqual(["gear:sword", "item:bountyToken", "relic:poachersLongbow"]);
    expect(next.seenParts).toEqual(["goblinEar"]);
  });

  it("keeps a save already on version 49 as it is", () => {
    const save = createInitialSave();
    expect(toV49(save)).toBe(save);
  });
});

describe("toV50", () => {
  it("starts existing gear at zero runs, kills and bosses, its origin unknown", () => {
    const piece = { uid: "g1", itemId: "sword2", rarity: "common" as const, roll: 8, affixes: [], rerolls: 0 };
    const next = migrateSave({ ...createInitialSave(), gear: [piece] }, 49, 0);
    expect(next.gear).toEqual([{ ...piece, history: { runs: 0, kills: 0, killTags: {}, bosses: [] } }]);
    expect(next.gear[0].forged).toBeUndefined();
  });

  it("keeps a save already on version 50 as it is", () => {
    const save = toV50({ ...createInitialSave(), gear: [] });
    expect(toV50(save)).toBe(save);
  });
});

describe("toV52", () => {
  const NOW = 123_456;

  /** A version 51 save: no supply state, and heroes without a trade. */
  const v51 = (): SaveData => {
    const base = createInitialSave();
    const heroes = base.heroes.map(({ trade: _trade, ...hero }) => hero);
    const other = { ...heroes[0], id: "h9", name: "Other" };
    const { supply: _supply, ...rest } = { ...base, heroes: [...heroes, other] } as SaveData;
    return rest as SaveData;
  };

  it("gives the trio their starting trades, anyone else a roll from their own id", () => {
    const next = migrateSave(v51(), 51, NOW);
    const byId = Object.fromEntries(next.heroes.map((hero) => [hero.id, hero]));
    expect(byId.bram.trade).toEqual({ id: "herbalist", hours: 0 });
    expect(byId.lyra.trade).toEqual({ id: "farmer", hours: 0 });
    expect(byId.mira.trade).toEqual({ id: "teamster", hours: 0 });
    expect(byId.h9.trade).toEqual({ id: rolledTrade("h9"), hours: 0 });
  });

  it("adds the empty supply state and changes nothing else", () => {
    const save = v51();
    const next = migrateSave(save, 51, NOW);
    expect(next.supply).toEqual(emptySupply(NOW));
    expect(next.heroes).toHaveLength(save.heroes.length);
    next.heroes.forEach((hero, i) => {
      const { trade: _trade, ...rest } = hero;
      expect(rest).toEqual(save.heroes[i]);
    });
    const { supply: _supply, heroes: _heroes, ...rest } = next;
    const old: Partial<SaveData> = { ...save };
    delete old.supply;
    delete old.heroes;
    expect(rest).toEqual(old);
  });

  it("is a no-op the second time", () => {
    const once = migrateSave(v51(), 51, NOW);
    expect(toV52(once, NOW)).toBe(once);
  });
});

describe("toV53", () => {
  const NOW = 500 * DAY;
  const hallCell = cellAt(origin);
  const campCell = cellAt(offsetPosition(origin, 800, 0));
  const waypointCell = cellAt(offsetPosition(origin, 400, 90));

  /** A version 52 save: a moved hall, scouted cells, two camps (one posted), a cart mid-loop with cargo, and a pending raid. */
  const v52 = (): SaveData => {
    const base = createInitialSave();
    const camp = (id: string, heroId: string | null) => ({
      id,
      kind: "timber" as const,
      cell: campCell,
      terrain: "green",
      quality: 2,
      foundedAt: NOW - DAY,
      heroId,
      postedAt: heroId ? NOW - DAY : null,
      stock: { wood: id === "c1" ? 7 : 0 },
      progress: 0,
      made: 3,
      settledAt: NOW - DAY,
      inspectedUntil: 0,
      closedUntil: 0,
    });
    const loop = {
      n: 1,
      startedAt: NOW - 3_600_000,
      endsAt: NOW + 3_600_000,
      points: [origin, offsetPosition(origin, 800, 0), origin],
      speedMps: 1,
      capacity: 20,
      events: [],
    };
    return {
      ...base,
      materials: { ...base.materials, wood: 2 },
      tips: { seen: ["supplyHall", "supplyScout"], pending: ["supplyCamps", "supplyBuildingSheet"] },
      supply: {
        ...emptySupply(NOW),
        hall: { cell: hallCell, movedAt: NOW - 2 * DAY },
        scouted: { [hallCell.slice(0, 5)]: { 4: hallCell.slice(-2) } },
        slotsFreeAt: [NOW + DAY],
        camps: [camp("c1", "bram"), camp("c2", null)],
        cart: {
          ...emptySupply(NOW).cart,
          route: [{ camp: "c1" }, { cell: waypointCell }],
          nextRoute: [{ camp: "c2" }, { cell: waypointCell }],
          crew: { driver: "mira", escorts: ["lyra"] },
          loop,
          cargo: { wood: 4 },
          waitingForCrew: true,
        },
        raid: {
          campId: "c1",
          kind: "goblins",
          tier: 1,
          landsAt: NOW + 2 * 3_600_000,
          defenders: [{ heroId: "lyra", sentAt: NOW, arrivesAt: NOW + 3_600_000 }],
          result: null,
        },
      },
    } as unknown as SaveData;
  };

  it("pays every camp's stock and the cart's cargo into the materials, and frees the posted heroes", () => {
    const before = v52();
    const next = toV53(before);
    expect(next.materials.wood).toBe(2 + 7 + 4);
    expect((next.supply as unknown as { camps: unknown[] }).camps).toEqual([]);
    // The posted hero's camp is gone, so they are free.
    expect(next.supply.cart.crew).toEqual({ driver: "mira", escorts: ["lyra"] });
  });

  it("parks the cart: no loop, no cargo, no waiting, and a route with nothing to run", () => {
    const next = toV53(v52());
    expect(next.supply.cart.loop).toBeNull();
    expect(next.supply.cart.cargo).toEqual({});
    expect(next.supply.cart.waitingForCrew).toBe(false);
    expect(next.supply.cart.route).toEqual([]);
    expect(next.supply.cart.nextRoute).toBeNull();
  });

  it("drops the raid, keeps the hall with its move, and drops the scouted cells, slots and removed tips", () => {
    const before = v52();
    const next = toV53(before);
    expect(next.supply.raid).toBeNull();
    expect(next.supply.hall).toEqual({ cell: hallCell, moves: [NOW - 2 * DAY] });
    expect((next.supply as Record<string, unknown>).scouted).toBeUndefined();
    expect((next.supply as Record<string, unknown>).slotsFreeAt).toBeUndefined();
    expect(next.tips).toEqual({ seen: [], pending: ["supplyBuildingSheet"] });
  });

  it("keeps a hall never moved as one with no moves, and is a no-op the second time", () => {
    const once = toV53(v52());
    expect(toV53(once)).toBe(once);
    const fresh = v52();
    const unmoved = toV53({ ...fresh, supply: { ...fresh.supply, hall: { cell: hallCell, movedAt: 0 } } } as unknown as SaveData);
    expect(unmoved.supply.hall).toEqual({ cell: hallCell, moves: [] });
  });
});

describe("toV54", () => {
  const NOW = 500 * DAY;
  const at = { latitude: 0, longitude: 0 };

  /** A quest pointing at a place, with its own expiry and progress kept by the step. */
  const placeQuest = (id: string, overrides: Partial<Quest> = {}): Quest => ({
    id,
    objective: "chapel",
    band: "short",
    arrivedAt: 100,
    expiresAt: NOW + DAY,
    acceptedAt: 200,
    amount: 1,
    progress: 0,
    target: { placeId: "place:chapel:tile:0:1", kind: "chapel", position: at, from: at, expiresAt: NOW + 3 * DAY },
    doneAt: null,
    seen: true,
    ...overrides,
  });

  /** A version 53 save: a personal tavern checked by rotation day, an open place-target quest, a done one and a mark quest. */
  const v53 = (): SaveData => {
    const base = createInitialSave();
    return {
      ...base,
      personalTavern: { day: 250, spot: { id: "tavern:personal:seed:250", position: at } },
      quests: {
        ...base.quests,
        list: [
          placeQuest("open"),
          placeQuest("done", { doneAt: NOW - DAY }),
          placeQuest("mark", { objective: "mark", target: { placeId: "mark:mark", kind: "mark", position: at, from: at, expiresAt: NOW + DAY } }),
        ],
      },
    } as unknown as SaveData;
  };

  it("drops the personal tavern, so it rechecks under the new period", () => {
    expect(toV54(v53()).personalTavern).toBeNull();
  });

  it("expires the target of every open place quest, keeping progress and the quest's own expiry", () => {
    const next = toV54(v53());
    const [open, done, mark] = next.quests.list;
    expect(open.target?.expiresAt).toBe(0);
    expect(open.target?.placeId).toBe("place:chapel:tile:0:1");
    expect(open.expiresAt).toBe(NOW + DAY);
    expect(open.progress).toBe(0);
    // A done quest and a mark quest keep their targets.
    expect(done.target?.expiresAt).toBe(NOW + 3 * DAY);
    expect(mark.target?.expiresAt).toBe(NOW + DAY);
  });

  it("returns the same save when nothing changes", () => {
    const base = createInitialSave();
    const quiet = { ...base, quests: { ...base.quests, list: [placeQuest("done", { doneAt: NOW })] } };
    expect(toV54(quiet)).toBe(quiet);
  });
});

describe("toV55", () => {
  /** A version 54 save: its supply has no `discovered` map yet. */
  const v54 = (): SaveData => {
    const base = createInitialSave();
    const supply = { ...base.supply } as Omit<typeof base.supply, 'discovered'> & { discovered?: Record<string, number> };
    delete supply.discovered;
    return { ...base, supply } as unknown as SaveData;
  };

  it("adds an empty discovered map to the supply", () => {
    expect(toV55(v54()).supply.discovered).toEqual({});
  });

  it("returns the same save when the map is already there", () => {
    const save = createInitialSave();
    expect(toV55(save)).toBe(save);
  });

  it("runs from migrateSave on a version 54 save", () => {
    expect(migrateSave(v54(), 54, 0).supply.discovered).toEqual({});
  });
});

describe("toV56", () => {
  /** A version 55 save: its supply still holds camps, camp route points, camp events and camp raid lines. */
  const v55 = (): SaveData => {
    const base = createInitialSave();
    const supply = base.supply as unknown as Record<string, unknown>;
    delete supply.buildings;
    delete supply.personalSite;
    supply.camps = [{ id: "c1", stock: { wood: 4 } }];
    supply.cart = {
      ...base.supply.cart,
      route: [{ camp: "c1" }, { cell: "abc" }],
      nextRoute: [{ camp: "c1" }],
      loop: {
        n: 1,
        startedAt: 0,
        endsAt: 1,
        points: [],
        speedMps: 1,
        capacity: 20,
        events: [{ at: 0, kind: "camp", campId: "c1" }],
      },
      cargo: { wood: 2 },
    };
    supply.raid = { campId: "c1", kind: "goblins", tier: 1, landsAt: 10, defenders: [], result: null };
    supply.raidLog = [{ campId: "c1", landsAt: 5, kind: "goblins", won: true, lost: {} }];
    return {
      ...base,
      heroes: base.heroes.map((hero) =>
        hero.id === "bram"
          ? { ...hero, trade: { id: "woodcutter" as unknown as never, hours: 12 } }
          : hero.id === "lyra"
            ? { ...hero, trade: { id: "trapper" as unknown as never, hours: 40 } }
            : hero,
      ),
      supply: supply as unknown as SaveData["supply"],
    };
  };

  it("closes the remaining camps into the materials and starts the buildings empty", () => {
    const next = toV56(v55());
    expect(next.supply.buildings).toEqual([]);
    expect(next.supply.personalSite).toBeNull();
    expect(next.materials.wood).toBe(4);
  });

  it("keeps only waypoint cells in the routes, and parks a loop that held camp events", () => {
    const next = toV56(v55());
    expect(next.supply.cart.route).toEqual([{ cell: "abc" }]);
    expect(next.supply.cart.nextRoute).toEqual([]);
    expect(next.supply.cart.loop).toBeNull();
    expect(next.supply.cart.cargo).toEqual({});
  });

  it("drops the pending raid and points the raid log's lines at building ids", () => {
    const next = toV56(v55());
    expect(next.supply.raid).toBeNull();
    expect(next.supply.raidLog).toEqual([{ buildingId: "c1", landsAt: 5, kind: "goblins", won: true, lost: {} }]);
  });

  it("turns a Woodcutter into an Herbalist and a Trapper into a Farmer, hours kept", () => {
    const next = toV56(v55());
    const tradeOf = (heroId: string) => next.heroes.find((h) => h.id === heroId)!.trade;
    expect(tradeOf("bram")).toMatchObject({ id: "herbalist", hours: 12 });
    expect(tradeOf("lyra")).toMatchObject({ id: "farmer", hours: 40 });
  });

  it("returns the same save when it has no camps left", () => {
    const save = createInitialSave();
    expect(toV56(save)).toBe(save);
  });

  it("runs from migrateSave on a version 55 save", () => {
    expect(migrateSave(v55(), 55, 0).supply.buildings).toEqual([]);
  });
});

describe("toV57", () => {
  /** A version 56 save: its supply has no `orders` map yet. */
  const v56 = (): SaveData => {
    const base = createInitialSave();
    const supply = { ...base.supply } as Omit<typeof base.supply, "orders"> & { orders?: Record<string, unknown> };
    delete supply.orders;
    return { ...base, supply } as unknown as SaveData;
  };

  it("adds an empty orders map to the supply", () => {
    expect(toV57(v56()).supply.orders).toEqual({});
  });

  it("returns the same save when the map is already there", () => {
    const save = createInitialSave();
    expect(toV57(save)).toBe(save);
  });

  it("runs from migrateSave on a version 56 save", () => {
    expect(migrateSave(v56(), 56, 0).supply.orders).toEqual({});
  });
});

describe("toV58", () => {
  const origin = { latitude: -41.2865, longitude: 174.7762 };

  /** A version 57 save: its cart's routes hold waypoint cells and no street paths. */
  const v57 = (): SaveData => {
    const base = createInitialSave();
    const hallCell = cellAt(origin);
    const building: Building = {
      id: "b1",
      kind: "farm",
      siteId: "s1",
      position: offsetPosition(origin, 300, 0),
      quality: 2,
      builtAt: 0,
      expiresAt: 6 * 86_400_000,
      heroId: null,
      postedAt: null,
      stock: {},
      progress: 0,
      made: 0,
      settledAt: 0,
      inspectedUntil: 0,
      closedUntil: 0,
    };
    const cart = { ...base.supply.cart } as Record<string, unknown>;
    delete cart.path;
    delete cart.nextPath;
    cart.route = [{ building: "b1" }, { cell: cellAt(offsetPosition(origin, 400, 90)) }];
    cart.nextRoute = null;
    cart.loop = {
      n: 1,
      startedAt: 0,
      endsAt: 1,
      points: [origin],
      speedMps: 1,
      capacity: 20,
      events: [],
      unloaded: [],
    };
    return {
      ...base,
      supply: {
        ...base.supply,
        hall: { cell: hallCell, moves: [] },
        buildings: [building],
        cart: cart as unknown as SaveData["supply"]["cart"],
      },
    };
  };

  it("turns waypoint cells into forced street points", () => {
    const next = toV58(v57());
    expect(next.supply.cart.route).toEqual([{ building: "b1" }, { via: tileCenter(cellAt(offsetPosition(origin, 400, 90))) }]);
  });

  it("gives each route the straight path of its stops, and a running loop keeps its own points", () => {
    const next = toV58(v57());
    const path = next.supply.cart.path!;
    const building = next.supply.buildings[0];
    expect(path.points).toEqual([tileCenter(cellAt(origin)), building.position, tileCenter(cellAt(offsetPosition(origin, 400, 90))), tileCenter(cellAt(origin))]);
    expect(path.stopAt).toEqual([1, 2]);
    expect(path.straightLegs).toEqual([0, 1, 2]);
    expect(next.supply.cart.nextPath).toBeNull();
    expect(next.supply.cart.loop!.points).toEqual([origin]);
  });

  it("returns the same save when the paths are already there", () => {
    const save = createInitialSave();
    expect(toV58(save)).toBe(save);
  });

  it("runs from migrateSave on a version 57 save", () => {
    expect(migrateSave(v57(), 57, 0).supply.cart.path).not.toBeNull();
  });
});

describe("toV59", () => {
  /** A version 58 save: its supply state has neither the debug unlock nor the first chain. */
  const v58 = (): SaveData => {
    const base = createInitialSave();
    const supply = base.supply as Record<string, unknown>;
    delete supply.debugUnlocked;
    delete supply.firstChain;
    return { ...base, supply: supply as unknown as SaveData["supply"] };
  };

  it("adds a locked network and an unstarted first chain", () => {
    const next = toV59(v58());
    expect(next.supply.debugUnlocked).toBe(false);
    expect(next.supply.firstChain).toEqual({ step: 0, doneAt: null });
  });

  it("keeps a debug-unlocked save unlocked", () => {
    const unlocked = { ...v58(), supply: { ...v58().supply, debugUnlocked: true } };
    expect(toV59(unlocked).supply.debugUnlocked).toBe(true);
  });

  it("returns the same save when both fields are already there", () => {
    const save = createInitialSave();
    expect(toV59(save)).toBe(save);
  });

  it("runs from migrateSave on a version 58 save", () => {
    expect(migrateSave(v58(), 58, 0).supply.firstChain).toEqual({ step: 0, doneAt: null });
  });
});

describe("toV60", () => {
  /** A version 59 save: its quests and seen kinds may still name the removed shops. */
  const v59 = (overrides: Partial<SaveData> = {}): SaveData => ({ ...createInitialSave(), ...overrides });

  /** A version 59 quest: its objective and target may name things that no longer exist. */
  const oldQuest = (id: string, overrides: Record<string, unknown> = {}): Quest =>
    ({
      id,
      objective: "mine",
      band: "short",
      arrivedAt: 100,
      expiresAt: 2 * DAY,
      acceptedAt: 200,
      amount: 3,
      progress: 0,
      target: null,
      doneAt: null,
      seen: true,
      ...overrides,
    }) as unknown as Quest;

  it("swaps an open mine quest for a fresh quest of the same band, keeping arrival and expiry", () => {
    const save = v59({ quests: { ...createInitialSave().quests, list: [oldQuest("q1")] } });
    const next = toV60(save, 0);
    const quest = next.quests.list[0];
    expect(quest.objective).not.toBe("mine");
    expect(quest.band).toBe("short");
    expect(quest.arrivedAt).toBe(100);
    expect(quest.expiresAt).toBe(2 * DAY);
    expect(quest.progress).toBe(0);
    expect(quest.doneAt).toBeNull();
    expect(quest.amount).toBe(questRules.amounts[quest.objective as keyof typeof questRules.amounts]?.short ?? 1);
  });

  it("leaves a done mine quest alone", () => {
    const done = oldQuest("q1", { doneAt: 50 });
    const save = v59({ quests: { ...createInitialSave().quests, list: [done] } });
    expect(toV60(save, 0).quests.list[0]).toBe(done);
  });

  it("expires the target of a quest pointing at a removed kind", () => {
    const targeted = oldQuest("q1", { objective: "chapel", target: { placeId: "place:sawmill:t:0:1", kind: "sawmill", position: origin, from: origin, expiresAt: 5 * DAY } });
    const save = v59({ quests: { ...createInitialSave().quests, list: [targeted] } });
    expect(toV60(save, 0).quests.list[0].target?.expiresAt).toBe(0);
  });

  it("drops the removed kinds from seenPlaceKinds", () => {
    const save = v59({ seenPlaceKinds: ["sawmill", "market", "huntingLodge", "chapel"] as SaveData["seenPlaceKinds"] });
    expect(toV60(save, 0).seenPlaceKinds).toEqual(["market", "chapel"]);
  });

  it("returns the same save when nothing changes", () => {
    const save = createInitialSave();
    expect(toV60(save, 0)).toBe(save);
  });

  it("runs from migrateSave on a version 59 save", () => {
    const save = v59({ quests: { ...createInitialSave().quests, list: [oldQuest("q1")] }, seenPlaceKinds: ["sawmill"] as unknown as SaveData["seenPlaceKinds"] });
    const next = migrateSave(save, 59, 0);
    expect(next.quests.list[0].objective).not.toBe("mine");
    expect(next.seenPlaceKinds).toEqual([]);
  });
});

describe("toV60: the guild gathering jobs and work tools leave", () => {
  const HOUR = 3_600_000;
  const NOW = 10 * DAY;

  /** A version 59 save: Bram cuts wood with a tier 2 hatchet, Lyra is a Quarryman, Mira gathers outdoors. */
  const v59 = (): SaveData => {
    const base = createInitialSave();
    const hatchet = { uid: "tool-1", itemId: "hatchet2", rarity: "common", roll: 10, affixes: [], rerolls: 0 } as unknown as SaveData["gear"][number];
    const heroes = base.heroes.map((hero) => {
      if (hero.id === "bram") return { ...hero, job: { jobId: "woodcutter", since: NOW - 3 * HOUR, tired: false }, equipment: { ...hero.equipment, offhand: "tool-1" } };
      if (hero.id === "lyra") return { ...hero, trade: { id: "quarryman", hours: 12 } };
      if (hero.id === "mira") return { ...hero, job: { jobId: "gatherer", since: NOW - HOUR, tired: false } };
      return hero;
    }) as SaveData["heroes"];
    return {
      ...base,
      gold: 100,
      materials: { ...base.materials, wood: 0 },
      gear: [...base.gear, hatchet],
      heroes,
      jobOutput: {
        woodcutter: { amounts: {}, fraction: 0, units: 0, since: NOW - 3 * HOUR },
        gatherer: { amounts: { herb: 2 }, fraction: 0, units: 2, since: NOW - HOUR },
      },
      jobChoice: { miner: "copper" },
      tips: { seen: ["jobMiner"], pending: ["jobCharcoalBurner"] },
    } as unknown as SaveData;
  };

  it("pays a woodcutter's uncollected work at the old rate and tool bonus, and takes the hero off the job", () => {
    const next = toV60(v59(), NOW);
    // 3 h × 0.3 × 1.125 (tier 2 hatchet) = 1.01 → 1 wood.
    expect(next.materials.wood).toBe(1);
    expect(next.heroes.find((hero) => hero.id === "bram")!.job).toBeNull();
    expect(next.jobOutput.woodcutter).toBeUndefined();
    expect(next.jobChoice.miner).toBeUndefined();
  });

  it("unequips, removes and refunds every work tool at its shop price", () => {
    const next = toV60(v59(), NOW);
    expect(next.gear.some((piece) => piece.itemId === "hatchet2")).toBe(false);
    expect(next.heroes.find((hero) => hero.id === "bram")!.equipment.offhand).toBeNull();
    expect(next.gold).toBe(110);
  });

  it("turns Quarrymen into Miners with their hours, drops the jobs' tips, and leaves the gatherer alone", () => {
    const before = v59();
    const next = toV60(before, NOW);
    expect(next.heroes.find((hero) => hero.id === "lyra")!.trade).toEqual({ id: "miner", hours: 12 });
    expect(next.tips).toEqual({ seen: [], pending: [] });
    expect(next.heroes.find((hero) => hero.id === "mira")!.job).toEqual(before.heroes.find((hero) => hero.id === "mira")!.job);
    expect(next.jobOutput.gatherer).toEqual(before.jobOutput.gatherer);
  });

  it("is a no-op the second time", () => {
    const once = toV60(v59(), NOW);
    expect(toV60(once, NOW)).toBe(once);
  });
});
