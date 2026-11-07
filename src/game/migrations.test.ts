import { classSpecials } from "@/content/classSpecials";
import { questRules } from "@/content/quests";

import { todaysCollector } from "./loot/valuables";
import { itemById } from "@/content/lookup";
import { gearRules } from "@/content/gear";
import { affixById } from "@/content/affixes";
import { gearStats } from "./gear/stats";
import { uniquePool } from "./gear/uniques";
import { migrateSave, toV38, toV39, toV40 } from "./migrations";
import type { GearDef } from "./types";
import { createInitialSave, type SaveData } from "./save";
import type { Quest } from "./quests/types";
import { rolledSpecial } from "./team/specials";

const DAY = 86_400_000;
const origin = { latitude: 0, longitude: 0 };
const marketId = "place:market:tile:0:1";

describe("save migrations", () => {
  const collector = (id: string, overrides: Partial<Quest> = {}): Quest => ({
    id,
    objective: "collector",
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

  it("keeps an open collector whose market wants a valuable the player holds", () => {
    const now = 10 * DAY;
    const save = withQuests(collector("q-1"));
    const wanted = todaysCollector(save, marketId, now);
    save.valuables = { [`${wanted}:2`]: 1 };
    const next = migrateSave(save, 30, now);
    expect(next.quests.list[0].objective).toBe("collector");
    expect(next.quests.list[0].itemId).toBe(wanted);
    expect(next.quests.list[0].target).toEqual(save.quests.list[0].target);
  });

  it("leaves done collectors and other quests alone", () => {
    const done = collector("q-1", { doneAt: 1000 });
    const save = withQuests(done, walk);
    const next = migrateSave(save, 30, 10 * DAY);
    expect(next.quests.list[0]).toEqual(done);
    expect(next.quests.list[1]).toEqual(walk);
  });

  it("does nothing for a save already at version 32", () => {
    const save = withQuests(collector("q-1"));
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
          .filter((id) => affixById[id].family === "element"),
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
      expect(next.materials.dragonClaw).toBe(1);
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
});
