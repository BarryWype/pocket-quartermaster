import { heroClasses, newHero } from '@/content/heroes';
import { recruitRules, rosterRules } from '@/content/roster';
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
  recruitPool,
  recruitPrice,
  recruitProblem,
  tavernOffers,
} from './taverns';

const here = { latitude: -41.2865, longitude: 174.7762 };
const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 26, 12);
const unlocked = (extra: Partial<SaveData> = {}): SaveData => ({
  ...createInitialSave(),
  clearedDungeons: ['banditStockade'],
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

  it('are about 60% common classes', () => {
    const offers = Array.from({ length: 200 }, (_, i) => tavernOffers(unlocked(), `tavern:x:${i}`, now)).flat();
    const common = offers.filter((o) => heroClasses[o.classId].rarity === 'common').length / offers.length;
    expect(common).toBeGreaterThan(0.5);
    expect(common).toBeLessThan(0.7);
  });

  it('come in a level below the roster average, at least level 1', () => {
    expect(offerLevel(createInitialSave())).toBe(1);
    const veterans = { ...createInitialSave(), heroes: createInitialSave().heroes.map((h, i) => ({ ...h, level: 4 + i })) };
    expect(offerLevel(veterans)).toBe(4);
  });

  it('cost base × level × roster × trait × tier', () => {
    expect(recruitPrice('common', 1, 3, true)).toBe(Math.round(recruitRules.price.base.common * 1.15));
    expect(recruitPrice('uncommon', 3, 5, false)).toBe(
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

  it('pool exactly the classes up to the tier, doubling its newcomers', () => {
    for (let tier = 1; tier <= 5; tier++) {
      const pool = recruitPool(tier);
      expect(pool.map((p) => p.classId).sort()).toEqual(inPool(tier).sort());
      for (const { classId, weight } of pool) {
        expect(heroClasses[classId].rarity).not.toBe('rare');
        expect(weight).toBe(heroClasses[classId].poolTier === tier ? recruitRules.newClassWeight : 1);
      }
    }
  });

  it('never draw a rare class or one from above the tier, and keep the rarity split', () => {
    const tier = 3;
    const picked = draws(tier, 2000);
    for (const classId of picked) {
      expect(heroClasses[classId].rarity).not.toBe('rare');
      expect(heroClasses[classId].poolTier!).toBeLessThanOrEqual(tier);
    }
    const common = picked.filter((id) => heroClasses[id].rarity === 'common').length / picked.length;
    expect(common).toBeGreaterThan(0.55);
    expect(common).toBeLessThan(0.65);
  });

  it('draw the tier\'s newcomers about twice as often as an older class of the same rarity', () => {
    const tier = 3;
    const counts = new Map<HeroClassId, number>();
    for (const classId of draws(tier, 2000)) counts.set(classId, (counts.get(classId) ?? 0) + 1);
    const perClass = (filter: (id: HeroClassId) => boolean) => {
      const picked = [...counts].filter(([id]) => filter(id));
      return picked.reduce((sum, [, count]) => sum + count, 0) / picked.length;
    };
    const newcomer = perClass((id) => heroClasses[id].poolTier === tier);
    const older = perClass((id) => heroClasses[id].poolTier! < tier && heroClasses[id].rarity === 'uncommon');
    expect(newcomer / older).toBeGreaterThan(1.6);
    expect(newcomer / older).toBeLessThan(2.4);
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

describe('recruiting', () => {
  it('is locked until the Bandit Stockade falls', () => {
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
    const full = { ...save, heroes: Array.from({ length: rosterRules.rosterCap }, (_, i) => newHero(`h${i}`, 'X', 'warrior', 'tough')) };
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

  it('teaches no recipe and grants no mastery', () => {
    const save = unlocked();
    const offer = firstOffer(save);
    const after = recruit(save, offer, here, here);
    expect(after.knownRecipes).toEqual(save.knownRecipes);
    expect(after.mastery).toEqual(save.mastery);
  });

  it('drops blueprints for the newer weapon types, and meeting one starts its mastery', () => {
    const save = unlocked({ tutorial: { ...createInitialSave().tutorial, step: 'done' } });
    const strong = equip({ ...save, heroes: save.heroes.map((h) => ({ ...h, level: 5 })), gear: [{ uid: 'g', itemId: 'sword5', quality: 'legendary' }] }, 'bram', 'weapon', 'g');
    const drops = (s: SaveData) =>
      Array.from({ length: 80 }, (_, i) => {
        const started = startExpedition({ ...s, nextUid: i + 10 }, 'ratCellar', ['bram'], 0);
        return resolveExpedition(started, started.expeditions[0]).report.loot.recipeIds;
      }).flat();
    const fresh = drops(strong).filter((id) => id && ['axe', 'dagger', 'staff'].some((type) => id.startsWith(type)));
    expect(fresh.length).toBeGreaterThan(0);
    const taught = unlockRecipe(strong, fresh[0]!);
    expect(Object.keys(taught.mastery)).toContain(fresh[0]!.replace(/\d+$/, ''));
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
      gear: [{ uid: 'w', itemId: 'wand1', quality: 'normal', element: 'electric' }],
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
      gear: [{ uid: 'g', itemId: 'sword5', quality: 'legendary' as const }],
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
