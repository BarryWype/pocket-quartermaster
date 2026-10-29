import { healthRules } from '@/content/health';
import { newHero, xpToNextLevel } from '@/content/heroes';

import { resolveExpedition, startExpedition } from '../expeditions/expeditions';
import { prepareParty } from '../expeditions/simulate';
import { challengeSanctum, generateSanctumsAround } from '../sanctums/sanctums';
import { createInitialSave, type SaveData } from '../save';
import {
  applyRunHp,
  careProblem,
  currentHp,
  drinkPotion,
  drinkProblem,
  fastForwardHealing,
  isExhausted,
  maxHp,
  setHeroHp,
  settleHp,
  timeToFull,
  giveHomeCare,
} from './health';
import { addXp, equip, heroStats, keepHpShare, unequip } from './team';

const MIN = 60_000;
const hero = (save: SaveData, id = 'bram') => save.heroes.find((h) => h.id === id)!;
/** Bram (max 35 HP at level 1) at a share of his HP at time 0. */
const hurt = (share: number, extra: Partial<SaveData> = {}) =>
  setHeroHp({ ...createInitialSave(), tutorial: { step: 'done', woodSpot: null }, ...extra }, 'bram', share, 0);

describe('hero HP', () => {
  it('starts full, with nothing stored', () => {
    const save = createInitialSave();
    expect(hero(save).hp).toBeUndefined();
    expect(currentHp(save, hero(save), 0)).toBe(maxHp(save, hero(save)));
  });

  it('heals 0 → 100% in an hour at home, capped at max', () => {
    const save = hurt(0);
    const max = maxHp(save, hero(save));
    expect(currentHp(save, hero(save), 30 * MIN)).toBeCloseTo(max / 2);
    expect(currentHp(save, hero(save), 60 * MIN)).toBeCloseTo(max);
    expect(currentHp(save, hero(save), 600 * MIN)).toBe(max);
    expect(healthRules.healPerMinute * 60).toBeCloseTo(1);
  });

  it('works healing out from timestamps, the same whenever it is settled', () => {
    const save = hurt(0.2);
    const once = settleHp(save, 40 * MIN);
    const twice = settleHp(settleHp(save, 15 * MIN), 40 * MIN);
    expect(currentHp(once, hero(once), 40 * MIN)).toBeCloseTo(currentHp(twice, hero(twice), 40 * MIN));
    expect(settleHp(save, 120 * MIN).heroes[0].hp).toBeUndefined();
  });

  it('gives the time until full', () => {
    expect(timeToFull(hurt(0.5), hero(hurt(0.5)), 0)).toBe(30 * MIN);
    expect(timeToFull(createInitialSave(), hero(createInitialSave()), 0)).toBe(0);
  });

  it('does not heal on an expedition', () => {
    const save = startExpedition(hurt(0.5), 'ratCellar', ['bram'], 0);
    expect(currentHp(save, hero(save), 50 * MIN)).toBeCloseTo(maxHp(save, hero(save)) / 2);
  });

  it('exhausts a knocked-out hero for 20 minutes, then heals', () => {
    const save = applyRunHp(createInitialSave(), [{ heroId: 'bram', hp: 0, maxHp: 35 }], 0);
    expect(isExhausted(hero(save), 19 * MIN)).toBe(true);
    expect(currentHp(save, hero(save), 20 * MIN)).toBe(0);
    expect(currentHp(save, hero(save), 50 * MIN)).toBeCloseTo(maxHp(save, hero(save)) / 2);
    expect(timeToFull(save, hero(save), 0)).toBe(80 * MIN);
  });

  it('keeps the HP share when max HP goes up, and caps it when it goes down', () => {
    const h = { ...newHero('a', 'A', 'warrior', 'thrifty'), hp: 20, hpAt: 0 };
    expect(keepHpShare(h, 40, 80).hp).toBe(40);
    expect(keepHpShare(h, 40, 30).hp).toBe(20);
    expect(keepHpShare(h, 40, 15).hp).toBeUndefined();
    expect(keepHpShare({ ...h, hp: 40 }, 40, 30).hp).toBeUndefined();
  });

  it('keeps the share when armour is put on, and caps it when taken off', () => {
    let save = hurt(0.5, { gear: [{ uid: 'a', itemId: 'mail1', quality: 'normal' }] });
    save = equip(save, 'bram', 'armor', 'a');
    expect(hero(save).hp! / maxHp(save, hero(save))).toBeCloseTo(0.5);
    save = setHeroHp(save, 'bram', 0.9, 0);
    save = unequip(save, 'bram', 'armor');
    expect(hero(save).hp).toBeUndefined();
  });

  it('keeps the share through a level up after an expedition', () => {
    const kit = { gear: [{ uid: 's', itemId: 'sword5', quality: 'normal' as const }, { uid: 'a', itemId: 'mail5', quality: 'normal' as const }] };
    let save = hurt(0.6, kit);
    save = equip(equip(save, 'bram', 'weapon', 's'), 'bram', 'armor', 'a');
    save = { ...save, heroes: save.heroes.map((h) => ({ ...h, xp: xpToNextLevel(1) - 1 })) };
    const started = startExpedition(save, 'ratCellar', ['bram'], 0);
    const { save: after, report } = resolveExpedition(started, started.expeditions[0]);
    const back = report.heroHp[0];
    const levelled = hero(after);
    expect(levelled.level).toBe(2);
    expect((levelled.hp ?? maxHp(after, levelled)) / maxHp(after, levelled)).toBeCloseTo(back.hp / back.maxHp, 1);
  });

  it('heals faster or slower with the healer traits', () => {
    const withTrait = (trait: string) => {
      const save = { ...createInitialSave(), heroes: [{ ...newHero('a', 'A', 'warrior', trait), hp: 0, hpAt: 0 }] };
      return currentHp(save, save.heroes[0], 20 * MIN) / maxHp(save, save.heroes[0]);
    };
    expect(withTrait('thrifty')).toBeCloseTo(1 / 3);
    expect(withTrait('quickHealer')).toBeCloseTo(0.5);
    expect(withTrait('slowHealer')).toBeCloseTo(0.7 / 3);
    const ko = (trait: string) => applyRunHp({ ...createInitialSave(), heroes: [newHero('a', 'A', 'warrior', trait)] }, [{ heroId: 'a', hp: 0, maxHp: 30 }], 0);
    expect(ko('quickHealer').heroes[0].exhaustedUntil).toBe(10 * MIN);
    expect(ko('thrifty').heroes[0].exhaustedUntil).toBe(20 * MIN);
  });

  it('fast-forwards healing (debug)', () => {
    const save = fastForwardHealing(hurt(0), 30);
    expect(currentHp(save, hero(save), 0)).toBeCloseTo(maxHp(save, hero(save)) / 2);
  });
});

describe('persistent HP on runs', () => {
  it('starts an expedition with current HP and stores the end HP', () => {
    const save = hurt(0.4);
    expect(prepareParty(save, ['bram'], 0)[0].hp).toBeCloseTo(0.4 * maxHp(save, hero(save)));
    const started = startExpedition(save, 'ratCellar', ['bram'], 0);
    const { save: after, report } = resolveExpedition(started, started.expeditions[0]);
    expect(report.heroHp[0].before).toBe(Math.round(0.4 * maxHp(save, hero(save))));
    expect(hero(after).hp ?? maxHp(after, hero(after))).toBeCloseTo(report.heroHp[0].hp);
    expect(hero(after).hpAt ?? started.expeditions[0].endsAt).toBe(started.expeditions[0].endsAt);
  });

  it('lets a Sanctum fight start with current HP and keep the end HP', () => {
    const position = { latitude: -41.2865, longitude: 174.7762 };
    const spawn = generateSanctumsAround(position, 0)[0];
    const save = { ...hurt(0.3), sigils: [1] };
    const { save: after, result } = challengeSanctum(save, spawn, 1, ['bram'], spawn.position, 0);
    expect(result.log.length).toBeGreaterThan(0);
    expect(hero(after).hp).toBeLessThanOrEqual(0.3 * maxHp(save, hero(save)));
  });
});

describe('healing potions', () => {
  it('heal 30% of max HP at home', () => {
    const save = drinkPotion(hurt(0.2, { consumables: { healingPotion: 1 } }), 'bram', 0);
    expect(hero(save).hp! / maxHp(save, hero(save))).toBeCloseTo(0.5);
    expect(save.consumables.healingPotion).toBe(0);
  });

  it('heal each strength its own share of max HP at home', () => {
    const save = (itemId: string, share: number) => {
      const drunk = drinkPotion(hurt(0.2, { consumables: { [itemId]: 1 } }), 'bram', 0, itemId);
      expect(hero(drunk).hp! / maxHp(drunk, hero(drunk))).toBeCloseTo(0.2 + share);
      expect(drunk.consumables[itemId]).toBe(0);
    };
    save('healingPotion', 0.3);
    save('standardHealingPotion', 0.5);
    save('greaterHealingPotion', 0.7);
  });

  it('without an itemId pick the weakest potion that fills, else the strongest', () => {
    const all = { healingPotion: 1, standardHealingPotion: 1, greaterHealingPotion: 1 };
    // Hurt to 80%: the Minor (30%) already fills.
    expect(drinkPotion(hurt(0.8, { consumables: { ...all } }), 'bram', 0).consumables.healingPotion).toBe(0);
    // Hurt to 60%: the Minor is not enough, the Standard fills.
    expect(drinkPotion(hurt(0.6, { consumables: { ...all } }), 'bram', 0).consumables.standardHealingPotion).toBe(0);
    // Hurt to 20%: none fills, so the strongest is drunk.
    expect(drinkPotion(hurt(0.2, { consumables: { ...all } }), 'bram', 0).consumables.greaterHealingPotion).toBe(0);
  });

  it('still drink an old save’s healingPotion as the Minor potion', () => {
    const save = drinkPotion(hurt(0.2, { consumables: { healingPotion: 1 } }), 'bram', 0);
    expect(hero(save).hp! / maxHp(save, hero(save))).toBeCloseTo(0.5);
  });

  it('are refused for an asked potion the hero does not hold', () => {
    expect(drinkProblem(hurt(0.2, { consumables: { healingPotion: 1 } }), 'bram', 0, 'greaterHealingPotion')).toBe('noPotion');
  });

  it('use the carried potion when the stock is empty', () => {
    const carrying = equip(hurt(0.2, { consumables: { healingPotion: 1 } }), 'bram', 'consumable', 'healingPotion');
    const save = drinkPotion(carrying, 'bram', 0);
    expect(hero(save).equipment.consumable).toBeNull();
  });

  it('end exhaustion', () => {
    const ko = setHeroHp({ ...createInitialSave(), consumables: { healingPotion: 1 } }, 'bram', 0, 0, true);
    expect(isExhausted(hero(ko), 0)).toBe(true);
    const save = drinkPotion(ko, 'bram', 0);
    expect(isExhausted(hero(save), 0)).toBe(false);
    expect(currentHp(save, hero(save), 10 * MIN)).toBeGreaterThan(currentHp(save, hero(save), 0));
  });

  it('are refused for a hero away, at full HP or without a potion', () => {
    const away = startExpedition(hurt(0.2, { consumables: { healingPotion: 1, trailMix: 2 } }), 'ratCellar', ['bram'], 0);
    expect(drinkProblem(away, 'bram', 0)).toBe('away');
    expect(() => drinkPotion(away, 'bram', 0)).toThrow();
    expect(drinkProblem({ ...createInitialSave(), consumables: { healingPotion: 1 } }, 'bram', 0)).toBe('full');
    expect(drinkProblem(hurt(0.2), 'bram', 0)).toBe('noPotion');
  });
});

describe('home care', () => {
  const tired = (share = 0, itemId = 'herbalPoultice') =>
    setHeroHp({ ...createInitialSave(), consumables: { [itemId]: 1 } }, 'bram', share, 0, true);

  it('heals 25% of max HP with a poultice, capped at max', () => {
    const save = giveHomeCare(hurt(0.2, { consumables: { herbalPoultice: 1 } }), 'bram', 'herbalPoultice', 0);
    expect(hero(save).hp! / maxHp(save, hero(save))).toBeCloseTo(0.45);
    const full = giveHomeCare(hurt(0.9, { consumables: { herbalPoultice: 1 } }), 'bram', 'herbalPoultice', 0);
    expect(hero(full).hp).toBeUndefined();
  });

  it('heals to full with a restorative tonic', () => {
    const save = giveHomeCare(hurt(0.2, { consumables: { restorativeTonic: 1 } }), 'bram', 'restorativeTonic', 0);
    expect(hero(save).hp).toBeUndefined();
    expect(currentHp(save, hero(save), 0)).toBe(maxHp(save, hero(save)));
  });

  it('ends exhaustion with a calming tea, restarting healing from now', () => {
    const save = giveHomeCare(tired(0, 'calmingTea'), 'bram', 'calmingTea', 0);
    expect(isExhausted(hero(save), 0)).toBe(false);
    expect(hero(save).hp).toBe(0);
    expect(currentHp(save, hero(save), 5 * MIN)).toBeCloseTo((5 / 60) * maxHp(save, hero(save)));
  });

  it('keeps the exhaustion timer with a heal item', () => {
    const save = giveHomeCare(tired(0.3), 'bram', 'herbalPoultice', 0);
    expect(isExhausted(hero(save), 0)).toBe(true);
    expect(hero(save).hp! / maxHp(save, hero(save))).toBeCloseTo(0.55);
    expect(currentHp(save, hero(save), 10 * MIN)).toBeCloseTo(0.55 * maxHp(save, hero(save)));
  });

  it('is refused for a hero away, without stock, at full HP, or when not exhausted', () => {
    const away = startExpedition(hurt(0.2, { consumables: { herbalPoultice: 1, calmingTea: 1 } }), 'ratCellar', ['bram'], 0);
    expect(careProblem(away, 'bram', 'herbalPoultice', 0)).toBe('away');
    expect(() => giveHomeCare(away, 'bram', 'herbalPoultice', 0)).toThrow();
    expect(careProblem(hurt(0.2), 'bram', 'herbalPoultice', 0)).toBe('noItem');
    expect(careProblem(hurt(0.2, { consumables: { herbalPoultice: 1 } }), 'bram', 'healingPotion', 0)).toBe('noItem');
    const full = { ...createInitialSave(), consumables: { herbalPoultice: 1, calmingTea: 1 } };
    expect(careProblem(full, 'bram', 'herbalPoultice', 0)).toBe('nothingToDo');
    expect(() => giveHomeCare(full, 'bram', 'herbalPoultice', 0)).toThrow();
    expect(careProblem(full, 'bram', 'calmingTea', 0)).toBe('nothingToDo');
    expect(() => giveHomeCare(full, 'bram', 'calmingTea', 0)).toThrow();
  });

  it('takes exactly one item from the stock', () => {
    const save = giveHomeCare(hurt(0.2, { consumables: { herbalPoultice: 3 } }), 'bram', 'herbalPoultice', 0);
    expect(save.consumables.herbalPoultice).toBe(2);
  });
});

describe('traits and max HP', () => {
  it('gives Resilient +15% and Frail −10% max HP', () => {
    const save = createInitialSave();
    const base = heroStats(save, newHero('a', 'A', 'warrior', 'thrifty')).hp;
    expect(heroStats(save, newHero('a', 'A', 'warrior', 'resilient')).hp).toBe(Math.round(base * 1.15));
    expect(heroStats(save, newHero('a', 'A', 'warrior', 'frail')).hp).toBe(Math.round(base * 0.9));
  });

  it('levels up with addXp without touching HP', () => {
    expect(addXp(newHero('a', 'A', 'warrior', 'thrifty'), 100).hp).toBeUndefined();
  });
});
