import { heroClasses, newHero } from '@/content/heroes';
import { recruitRules, rosterRules } from '@/content/roster';
import { traitById } from '@/content/traits';

import { nextRotationAt } from '../dungeons/rotation';
import { resolveExpedition, startExpedition } from '../expeditions/expeditions';
import { prepareParty } from '../expeditions/simulate';
import { migrateV7Save } from '../migrations';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import { pruneExpired } from '../upkeep';
import {
  generateTavernsAround,
  isTavernUnlocked,
  learnWeaponTypes,
  offerLevel,
  recruit,
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
  it('puts the same taverns in the same places every day', () => {
    const taverns = generateTavernsAround(here);
    expect(taverns.length).toBeGreaterThan(0);
    expect(generateTavernsAround(here)).toEqual(taverns);
    for (const t of taverns) expect(t.name).toMatch(/^The \w+ \w+$/);
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
    expect(offer.price).toBe(recruitPrice(heroClasses[offer.classId].rarity, offer.level, 3, positive, 2));
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

  it('teaches a new weapon type up to the highest tier reached, with mastery at the previous cap', () => {
    const tier3 = unlocked({ clearedDungeons: ['banditStockade', 'ogreQuarry'] });
    const learned = learnWeaponTypes(tier3, 'barbarian');
    expect(learned.knownRecipes).toEqual(expect.arrayContaining(['woodAxe', 'stoneAxe', 'copperAxe']));
    expect(learned.knownRecipes).not.toContain('ironAxe');
    expect(learned.mastery.axe).toEqual({ level: 6, progress: 0 });
    // Known types are left alone.
    expect(learnWeaponTypes(tier3, 'warrior')).toEqual(tier3);
  });

  it('only drops blueprints for weapon types the player has met', () => {
    const save = unlocked({ tutorial: { step: 'done', woodSpot: null } });
    const strong = equip({ ...save, gear: [{ uid: 'g', itemId: 'steelSword', quality: 'legendary' }] }, 'bram', 'weapon', 'g');
    const drops = (s: SaveData) =>
      Array.from({ length: 80 }, (_, i) => {
        const started = startExpedition({ ...s, nextUid: i + 10 }, 'ratCellar', ['bram'], 0);
        return resolveExpedition(started, started.expeditions[0]).report.recipeId;
      });
    expect(drops(strong).filter((id) => id?.endsWith('Axe') || id?.endsWith('Dagger') || id?.endsWith('Staff'))).toEqual([]);
    const met = learnWeaponTypes({ ...strong, clearedDungeons: [] }, 'thief');
    expect(drops({ ...met, knownRecipes: met.knownRecipes.filter((id) => id !== 'woodDagger') })).toContain('woodDagger');
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
      gear: [{ uid: 'w', itemId: 'woodWand', quality: 'normal', element: 'electric' }],
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
      heroes: createInitialSave().heroes.map((h) => (h.id === 'bram' ? { ...h, trait } : h)),
      gear: [{ uid: 'g', itemId: 'steelSword', quality: 'legendary' as const }],
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

describe('save migration v7 → v8', () => {
  it('renames archers to rangers, gives traits and unequips weapons the class cannot use', () => {
    const old = {
      ...createInitialSave(),
      heroes: createInitialSave().heroes.map((h) => {
        const { trait: _trait, ...rest } = h;
        return { ...rest, classId: h.id === 'lyra' ? 'archer' : h.classId, equipment: { ...h.equipment, weapon: h.id === 'lyra' ? 'g' : null } };
      }),
      gear: [{ uid: 'g', itemId: 'woodSword', quality: 'normal' }],
    } as unknown as SaveData;
    const save = migrateV7Save(old);
    const lyra = save.heroes.find((h) => h.id === 'lyra')!;
    expect(lyra).toMatchObject({ classId: 'ranger', trait: 'lucky', equipment: { weapon: null } });
    expect(save.heroes.map((h) => h.trait)).toEqual(['tough', 'lucky', 'quickLearner']);
    expect(save.gear).toHaveLength(1);
  });
});
