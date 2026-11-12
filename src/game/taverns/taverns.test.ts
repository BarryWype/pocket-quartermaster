import { heroClasses, newHero } from '@/content/heroes';
import { recruitRules } from '@/content/roster';
import { traitById } from '@/content/traits';

import { nextRotationAt } from '../dungeons/rotation';
import { resolveExpedition, startExpedition } from '../expeditions/expeditions';
import { prepareParty } from '../expeditions/simulate';
import { unlockRecipe } from '../crafting/crafting';
import { createRng } from '../generation/rng';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import { pruneExpired } from '../upkeep';
import type { HeroClassId } from '../types';
import {
  generateTavernsAround,
  isTavernUnlocked,
  offerLevel,
  pickRecruitClass,
  recruit,
  rotationWeek,
  recruitPool,
  recruitPrice,
  recruitProblem,
  tavernOffers,
  wantedFamily,
} from './taverns';
import { rosterCap } from '../guild/guild';
import { dungeons } from '@/content/dungeons';

const here = { latitude: -41.2865, longitude: 174.7762 };
const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 26, 12);
const unlocked = (extra: Partial<SaveData> = {}): SaveData => ({
  ...createInitialSave(),
  clearedDungeons: ['banditStockade'],
  stats: { patrolsWon: 0, questsDone: 1, expeditionsLaunched: 0 },
  gold: 1000,
  ...extra,
});
const firstOffer = (save: SaveData, at = now) => tavernOffers(save, 'tavern:test:0', at)[0];

describe('tavern spawning', () => {
  it('is deterministic and keeps each tavern until its own window ends', () => {
    const taverns = generateTavernsAround(here, now);
    expect(taverns.length).toBeGreaterThan(0);
    expect(generateTavernsAround(here, now)).toEqual(taverns);
    for (const t of taverns) {
      expect(t.name).toMatch(/^The \w+ \w+$/);
      expect(t.expiresAt).toBeGreaterThan(now);
      // The window is staggered per tavern, but no tavern moves before it expires.
      expect(generateTavernsAround(here, t.expiresAt - 1).find((later) => later.id === t.id)).toEqual(t);
    }
  });

  it('moves taverns after their 72 h window', () => {
    const before = generateTavernsAround(here, now);
    const after = generateTavernsAround(here, now + 72 * 3_600_000 + 1);
    expect(after.map((t) => t.id)).not.toEqual(before.map((t) => t.id));
  });
});

describe('offers', () => {
  it('are the same for everyone on a day, and change the next day', () => {
    const save = unlocked();
    expect(tavernOffers(save, 'tavern:test:0', now)).toEqual(tavernOffers(save, 'tavern:test:0', now + 3_600_000));
    expect(tavernOffers(save, 'tavern:test:0', now)).toHaveLength(recruitRules.offersPerTavern);
    expect(tavernOffers(save, 'tavern:test:0', now + DAY).map((o) => o.id)).not.toEqual(
      tavernOffers(save, 'tavern:test:0', now).map((o) => o.id),
    );
    expect(firstOffer(save).expiresAt).toBe(nextRotationAt(now));
  });

  it('come in one level under the roster’s median level, never below the bottom of the tier band', () => {
    expect(offerLevel(createInitialSave())).toBe(recruitRules.levelByTier[0]);
    const veterans = { ...createInitialSave(), heroes: createInitialSave().heroes.map((h, i) => ({ ...h, level: 4 + i })) };
    // Levels 4, 5, 6: the median is 5.
    expect(offerLevel(veterans)).toBe(4);
    const behind = { ...veterans, heroes: veterans.heroes.map((h) => ({ ...h, level: 2 })) };
    expect(offerLevel({ ...behind, clearedDungeons: ['banditStockade'] })).toBe(recruitRules.levelByTier[1]);
    // An even roster takes the lower of its two middle levels: 2, 5, 8, 9 → 5.
    const four = { ...veterans, heroes: [2, 5, 8, 9].map((level, i) => ({ ...createInitialSave().heroes[i % 3], id: `h${i}`, level })) };
    expect(offerLevel(four)).toBe(4);
  });

  it('cost base × level × roster × trait × tier', () => {
    expect(recruitPrice('common', 1, 3, true)).toBe(Math.round(recruitRules.price.base.common * 1.15));
    expect(recruitPrice('uncommon', 3, recruitRules.price.freeHeroes + 2, false)).toBe(
      Math.round(recruitRules.price.base.uncommon * 1.5 * (1 + recruitRules.price.perExtraHero * 2) * 0.75),
    );
    expect(recruitPrice('common', 1, 3, true, 3)).toBe(Math.round(recruitRules.price.base.common * 1.15 * recruitRules.price.perTier ** 2));
    // Taverns open with tier 2, so offers already carry one tier step.
    const offer = firstOffer(unlocked());
    const positive = traitById[offer.trait].positive;
    expect(offer.price).toBe(recruitPrice(heroClasses[offer.classId].rarity, offer.level, 3, positive, 2, offer.grade));
  });
});

describe('recruit classes', () => {
  const inPool = (tier: number): HeroClassId[] =>
    (Object.keys(heroClasses) as HeroClassId[]).filter((id) => {
      const { rarity, poolTier } = heroClasses[id];
      return rarity !== 'rare' && poolTier !== null && poolTier <= tier;
    });
  const draws = (tier: number, count: number) =>
    Array.from({ length: count }, (_, i) => pickRecruitClass(createRng(`pick-test|${i}`), tier));

  it('pool exactly the classes up to the tier, with the newcomers and owned classes weighted', () => {
    const owned = new Set<HeroClassId>(['warrior', 'thief']);
    for (let tier = 1; tier <= 5; tier++) {
      const pool = recruitPool(tier, recruitRules, owned);
      expect(pool.map((p) => p.classId).sort()).toEqual(inPool(tier).sort());
      for (const { classId, weight } of pool) {
        const { rarity, poolTier } = heroClasses[classId];
        expect(rarity).not.toBe('rare');
        expect(weight).toBeCloseTo(
          recruitRules.rarityWeights[rarity] * (poolTier === tier ? recruitRules.newClassWeight : 1) * (owned.has(classId) ? recruitRules.ownedClassWeight : 1),
        );
      }
    }
  });

  it('never draw a rare class or one from above the tier', () => {
    const tier = 3;
    for (const classId of draws(tier, 2000)) {
      expect(heroClasses[classId].rarity).not.toBe('rare');
      expect(heroClasses[classId].poolTier!).toBeLessThanOrEqual(tier);
    }
  });

  it('draw a class the roster has about 0.3 times as often', () => {
    const owned = new Set<HeroClassId>(['druid']);
    const count = (set: Set<HeroClassId>) =>
      Array.from({ length: 4000 }, (_, i) => pickRecruitClass(createRng(`owned-test|${i}`), 2, recruitRules, set)).filter((c) => c === 'druid').length;
    const ratio = count(owned) / count(new Set());
    expect(ratio).toBeGreaterThan(recruitRules.ownedClassWeight * 0.7);
    expect(ratio).toBeLessThan(recruitRules.ownedClassWeight * 1.3);
  });

  it('draw the tier\'s newcomers more often than an older class of the same rarity, by the newcomer weight', () => {
    const tier = 3;
    const counts = new Map<HeroClassId, number>();
    for (const classId of draws(tier, 2000)) counts.set(classId, (counts.get(classId) ?? 0) + 1);
    const perClass = (filter: (id: HeroClassId) => boolean) => {
      const picked = [...counts].filter(([id]) => filter(id));
      return picked.reduce((sum, [, count]) => sum + count, 0) / picked.length;
    };
    const newcomer = perClass((id) => heroClasses[id].poolTier === tier);
    const older = perClass((id) => heroClasses[id].poolTier! < tier && heroClasses[id].rarity === 'uncommon');
    expect(newcomer / older).toBeGreaterThan(recruitRules.newClassWeight * 0.8);
    expect(newcomer / older).toBeLessThan(recruitRules.newClassWeight * 1.2);
  });

  it('never offer a class from above the player\'s tier', () => {
    const save = unlocked();
    const offered = Array.from({ length: 500 }, (_, i) => tavernOffers(save, 'tavern:test:0', now, `s${i}`)).flat();
    for (const offer of offered) {
      expect(heroClasses[offer.classId].rarity).not.toBe('rare');
      expect(heroClasses[offer.classId].poolTier!).toBeLessThanOrEqual(2);
    }
  });

  it('price rare recruits well above uncommon ones', () => {
    expect(recruitPrice('rare', 1, 3, true)).toBeGreaterThan(recruitPrice('uncommon', 1, 3, true) * 2);
  });
});

/** The families with a class in the tier's pool: the ones a week can want. */
const eligible = (tier: number) => new Set(recruitPool(tier).map(({ classId }) => heroClasses[classId].familyTag));

describe('wanted this week', () => {
  const DAYS = recruitRules.wantedDays;

  it('is one family a week, the same for every player of a tier, and the first offer of every tavern is of it', () => {
    const save = unlocked();
    const week = rotationWeek(now);
    const family = wantedFamily(week, 2);
    for (const tavern of ['tavern:a:0', 'tavern:b:0', 'tavern:c:0']) {
      const [first, ...rest] = tavernOffers(save, tavern, now);
      expect(first.wanted).toBe(family);
      expect(heroClasses[first.classId].familyTag).toBe(family);
      for (const offer of rest) expect(offer.wanted).toBeUndefined();
    }
    expect(wantedFamily(week, 2)).toBe(family);
  });

  it('cycles through every family with a class in the tier’s pool before any comes back', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const families = eligible(tier);
      for (const start of [0, families.size, 5 * families.size]) {
        const seen = Array.from({ length: families.size }, (_, i) => wantedFamily(start + i, tier));
        expect(new Set(seen)).toEqual(families);
      }
    }
  });

  it('changes with the rotation week, not the day', () => {
    const week = rotationWeek(now);
    const weekStart = Date.UTC(2026, 0, 1) + (week * DAYS + 0.5) * DAY;
    expect(rotationWeek(weekStart + (DAYS - 1) * DAY)).toBe(rotationWeek(weekStart));
    expect(rotationWeek(weekStart + DAYS * DAY)).toBe(rotationWeek(weekStart) + 1);
  });
});

describe('every class can be found', () => {
  // A single tavern a day, the starting trio on the roster: the rate each class
  // of the tier's pool the roster lacks is offered at.
  const tierSave = (tier: number) => unlocked({ clearedDungeons: dungeons.filter((d) => d.tier < Math.max(2, tier)).map((d) => d.id) });
  const lacking = (save: SaveData, tier: number) => {
    const owned = new Set(save.heroes.map((h) => h.classId));
    return recruitPool(tier).map(({ classId }) => classId).filter((classId) => !owned.has(classId));
  };

  it('offers each one at least once a week on average, from the weights', () => {
    for (let tier = 2; tier <= 5; tier++) {
      const save = tierSave(tier);
      const owned = new Set(save.heroes.map((h) => h.classId));
      const pool = recruitPool(tier, recruitRules, owned);
      const total = pool.reduce((sum, p) => sum + p.weight, 0);
      const families = eligible(tier);
      for (const classId of lacking(save, tier)) {
        const { weight } = pool.find((p) => p.classId === classId)!;
        const family = pool.filter((p) => heroClasses[p.classId].familyTag === heroClasses[classId].familyTag).reduce((sum, p) => sum + p.weight, 0);
        // Offers after the first draw from the whole pool; the first draws from the week's family, each family's turn coming once a cycle.
        const perWeek = recruitRules.wantedDays * ((recruitRules.offersPerTavern - 1) * (weight / total) + (1 / families.size) * (weight / family));
        expect({ tier, classId, enough: perWeek >= 1 }).toEqual({ tier, classId, enough: true });
      }
    }
  });

  it('offers each one over a seeded year, none starved', () => {
    for (let tier = 2; tier <= 5; tier++) {
      const save = tierSave(tier);
      const counts = new Map<HeroClassId, number>();
      for (let day = 0; day < 364; day++) {
        for (const offer of tavernOffers(save, 'tavern:year:0', now + day * DAY)) counts.set(offer.classId, (counts.get(offer.classId) ?? 0) + 1);
      }
      for (const classId of lacking(save, tier)) {
        // 0.75 a week leaves room for a year's luck around the at-least-one-a-week mean above.
        expect({ tier, classId, enough: (counts.get(classId) ?? 0) / 52 >= 0.75 }).toEqual({ tier, classId, enough: true });
      }
    }
  });
});

describe('recruiting', () => {
  it('is locked until the first quest is done', () => {
    const fresh = { ...createInitialSave(), gold: 1000 };
    expect(isTavernUnlocked(fresh)).toBe(false);
    expect(recruitProblem(fresh, firstOffer(fresh), here, here)).toBe('locked');
    expect(recruitProblem(unlocked(), firstOffer(unlocked()), here, here)).toBeNull();
  });

  it('needs the player at the tavern, enough gold and room in the roster', () => {
    const save = unlocked();
    const far = { latitude: here.latitude + 0.01, longitude: here.longitude };
    expect(recruitProblem(save, firstOffer(save), far, here)).toBe('tooFar');
    expect(recruitProblem({ ...save, gold: 0 }, firstOffer(save), here, here)).toBe('gold');
    const full = { ...save, heroes: Array.from({ length: rosterCap(save) }, (_, i) => newHero(`h${i}`, 'X', 'warrior', 'tough')) };
    expect(recruitProblem(full, firstOffer(full), here, here)).toBe('rosterFull');
  });

  it('pays, adds the hero and takes the offer until the refresh', () => {
    const save = unlocked();
    const offer = firstOffer(save);
    const after = recruit(save, offer, here, here);
    const hero = after.heroes[after.heroes.length - 1];
    expect(hero).toMatchObject({ name: offer.name, classId: offer.classId, level: offer.level, trait: offer.trait });
    expect(after.gold).toBe(1000 - offer.price);
    expect(recruitProblem(after, offer, here, here)).toBe('taken');
    expect(pruneExpired(after, offer.expiresAt + 1).takenOffers).toEqual({});
  });

  it('teaches no recipe', () => {
    const save = unlocked();
    const offer = firstOffer(save);
    const after = recruit(save, offer, here, here);
    expect(after.knownRecipes).toEqual(save.knownRecipes);
  });

  it('drops blueprints for the newer weapon types, and teaches one', () => {
    const save = unlocked({ tutorial: { ...createInitialSave().tutorial, step: 'done' } });
    const strong = equip({ ...save, heroes: save.heroes.map((h) => ({ ...h, level: 20 })), gear: [{ uid: 'g', itemId: 'sword5', rarity: 'legendary' as const, roll: 8, affixes: [], rerolls: 0 }] }, 'bram', 'weapon', 'g');
    const drops = (s: SaveData) =>
      Array.from({ length: 80 }, (_, i) => {
        const started = startExpedition({ ...s, nextUid: i + 10 }, 'ratCellar', ['bram'], 0);
        return resolveExpedition(started, started.expeditions[0]).report.loot.recipeIds;
      }).flat();
    const fresh = drops(strong).filter((id) => id && ['axe', 'dagger', 'staff'].some((type) => id.startsWith(type)));
    expect(fresh.length).toBeGreaterThan(0);
    const taught = unlockRecipe(strong, fresh[0]!);
    expect(taught.knownRecipes).toContain(fresh[0]);
  });
});

describe('party size', () => {
  it('sends at most three heroes', () => {
    const save = { ...createInitialSave(), heroes: [...createInitialSave().heroes, newHero('h9', 'Nim', 'thief', 'lucky')] };
    expect(() => startExpedition(save, 'ratCellar', ['bram', 'lyra', 'mira', 'h9'], 0)).toThrow(/At most 3/);
  });
});

describe('innate elements', () => {
  it('give the class element unless the weapon is infused', () => {
    const save: SaveData = {
      ...createInitialSave(),
      heroes: [...createInitialSave().heroes, newHero('f', 'Neve', 'frostMage', 'tough')],
      gear: [{ uid: 'w', itemId: 'wand1', rarity: 'common' as const, roll: 8, affixes: [{ id: 'infusedElectric', value: 0 }], rerolls: 0 }],
    };
    const element = (s: SaveData, id: string) => prepareParty(s, [id])[0].weaponElement;
    expect(element(save, 'mira')).toBe('fire');
    expect(element(save, 'f')).toBe('water');
    expect(element(save, 'bram')).toBeUndefined();
    expect(element(equip(save, 'f', 'weapon', 'w'), 'f')).toBe('electric');
  });
});

describe('trait rewards', () => {
  const run = (trait: string) => {
    const save = {
      ...createInitialSave(),
      tutorial: { ...createInitialSave().tutorial, step: 'done' as const },
      heroes: createInitialSave().heroes.map((h) => (h.id === 'bram' ? { ...h, trait } : h)),
      gear: [{ uid: 'g', itemId: 'sword5', rarity: 'legendary' as const, roll: 8, affixes: [], rerolls: 0 }],
    };
    const started = startExpedition(equip(save, 'bram', 'weapon', 'g'), 'ratCellar', ['bram'], 0);
    return resolveExpedition(started, started.expeditions[0]);
  };

  it('thrifty and greedy change the gold; quick learners get more XP', () => {
    const base = run('tough').report.gold;
    expect(run('thrifty').report.gold).toBe(Math.round(base * 1.1));
    expect(run('greedy').report.gold).toBe(Math.round(base * 0.9));
    const xp = (trait: string) => run(trait).save.heroes.find((h) => h.id === 'bram')!;
    const plain = xp('tough');
    const learner = xp('quickLearner');
    expect(learner.xp + (learner.level - 1) * 100).toBe(Math.round((plain.xp + (plain.level - 1) * 100) * 1.2));
  });
});
