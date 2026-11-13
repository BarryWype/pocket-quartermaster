import { classSpecials } from "@/content/classSpecials";
import { questRules } from "@/content/quests";

import { itemById } from "@/content/lookup";
import { gearRules } from "@/content/gear";
import { affixById } from "@/content/affixes";
import { gearStats } from "./gear/stats";
import { uniquePool } from "./gear/uniques";
import { migrateSave, toV38, toV39, toV40, toV41, toV42, toV43, toV44, toV47, toV48, toV49, toV50 } from "./migrations";
import { affixPool } from "./gear/affixes";
import { emptyLoot } from "./loot/types";
import type { Briefing, ExpeditionReport, GearDef, GearInstance } from "./types";
import { createInitialSave, type SaveData } from "./save";
import type { Quest } from "./quests/types";
import { rolledSpecial } from "./team/specials";
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
      const next = migrateSave(v35, 35, 10 * DAY);
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
      expect(migrateSave(subUnit, 35, 10 * DAY).jobOutput.woodcutter).toEqual({
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
      expect(migrateSave(withChoice, 35, 10 * DAY).jobChoice).toEqual({
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
      expect(next.jobChoice).toEqual({ miner: null });
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
      } as SaveData;
    };

    it("migrates without a camp, gatherer output or new counters", () => {
      const next = migrateSave(v36(), 36, 12 * DAY);
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
      expect(migrateSave(save, 36, 12 * DAY)).toBe(save);
      expect(migrateSave(save, 37, 12 * DAY)).toBe(save);
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
