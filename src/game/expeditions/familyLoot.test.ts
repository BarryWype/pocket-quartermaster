import { eventById } from '@/content/events';
import { familyEffectRules as R, type FamilyEffectId, type FamilyId } from '@/content/families';
import { RARITIES } from '@/content/gear';
import { dungeonById } from '@/content/lookup';
import type { FamilyLevels } from '@/game/families/families';
import { raritySteps } from '@/game/loot/gear';
import { createRng } from '@/game/generation/rng';
import { createInitialSave, type SaveData } from '@/game/save';
import type { Briefing, Tag } from '@/game/types';

import { resolveExpedition, startExpedition } from './expeditions';
import { familyFight, logged, type FamilyFight, type FightSetup } from './familyTestHelpers';
import type { RunResult } from './simulate';

/** Rewrites what simulateRun returns, for the resolve tests; the identity otherwise. */
let mockRun = (run: RunResult) => run;
jest.mock('./simulate', () => {
  const actual = jest.requireActual('./simulate');
  return { ...actual, simulateRun: (...args: Parameters<typeof actual.simulateRun>) => mockRun(actual.simulateRun(...args)) };
});

const cacheGold = Math.round(eventById.cache.kind === 'cache' ? eventById.cache.goldShare * dungeonById.ratCellar.gold[1] : NaN);
/** One hidden cache step, then a boss felled by the first blow. */
const cache: FightSetup = { caches: 1, boss: { hp: 1, damage: 0 } };
const briefed = (opportunity: Briefing['opportunity']): FightSetup => ({
  mobs: [{ mobId: 'giantRat', count: 1 }],
  fights: 2,
  boss: { hp: 1, damage: 0 },
  party: { a: { power: 1000, speed: 100 } },
  options: { briefing: { threats: [], restriction: null, opportunity } },
});
/** A rat fight, then a boss felled by the first blow, carrying `tags`. */
const rats = (tags: Tag[] = []): FightSetup => ({
  mobs: [{ mobId: 'giantRat', count: 2 }],
  boss: { hp: 1, damage: 0, tags },
  party: { a: { power: 1000, speed: 100 } },
});
const last = (f: FamilyFight) => f.run.encounters[f.run.encounters.length - 1];

type Case = [string, FamilyId, number, FightSetup, (on: FamilyFight, off: FamilyFight) => void, FamilyEffectId, string | null, string | null];

describe('family loot and economy in a run', () => {
  test.each<Case>([
    ['Cunning 2: a hidden cache step pays its gold', 'cunning', 2, cache,
      (on, off) => {
        expect(off.run.bonusGold).toBe(0);
        expect(on.fight.gold).toBe(cacheGold);
        expect(on.run.bonusGold).toBe(cacheGold);
        expect(on.run.extraLootRolls).toBe(0);
      }, 'cunning2', 'A found the hidden cache and emptied it.', 'A a trouvé la cache secrète et l’a vidée.'],
    // Level 3 still runs Cunning 2: the cache pays its gold too.
    ['Cunning 3: a hidden cache step gives an extra loot roll', 'cunning', 3, cache,
      (on, off) => {
        expect(off.run.extraLootRolls).toBe(0);
        expect(on.run.extraLootRolls).toBe(R.cunning.cacheRolls);
        expect(on.run.bonusGold).toBe(cacheGold);
      }, 'cunning3', 'a found something more tucked away in the cache.', 'a a trouvé autre chose au fond de la cache.'],
    ['Cunning 3: no cache, no extra roll', 'cunning', 3, { boss: { hp: 1, damage: 0 } },
      (on) => expect(on.run.extraLootRolls).toBe(0), 'cunning3', null, null],
    ['Cunning 3: a taken Hidden cache gives an extra loot roll', 'cunning', 3, briefed('hiddenCache'),
      (on) => {
        expect(on.run.opportunity?.answered).toBe(true);
        expect(on.run.extraLootRolls).toBe(R.cunning.cacheRolls);
        expect(logged(on.run.encounters[1], 'cunning3')).toBe(1);
      }, 'cunning3', null, null],
    ['Cunning 3: a taken Sealed vault gives an extra loot roll', 'cunning', 3, briefed('sealedVault'),
      (on) => {
        expect(on.run.opportunity?.answered).toBe(true);
        expect(on.run.extraLootRolls).toBe(R.cunning.cacheRolls);
      }, 'cunning3', null, null],
    // Cunning answers the Hidden cache, which pays its own gold; Cunning 2 adds nothing to it.
    ['Cunning 2: a Hidden cache pays no extra gold or roll', 'cunning', 2, briefed('hiddenCache'),
      (on) => {
        expect(on.run.extraLootRolls).toBe(0);
        expect(on.run.bonusGold).toBe(on.run.opportunity?.gold);
      }, 'cunning3', null, null],
    ['Plunder 1: noted on the run’s last encounter', 'plunder', 1, { boss: { hp: 1, damage: 0 } },
      (on) => expect(logged(last(on), 'plunder1')).toBe(1), 'plunder1', 'The party’s eye for plunder turned up more gold.', 'L’œil du groupe pour le butin a déniché plus d’or.'],
    ['Plunder 1: nothing cleared, no note', 'plunder', 1, { boss: { damage: 1000 } },
      (on) => expect(on.run.encountersCleared).toBe(0), 'plunder1', null, null],
    // Rats carry the beast tag, an undead boss its own: a fang from the fight, grave dust from the boss.
    ['Plunder 2: a monster part from every won fight', 'plunder', 2, rats(['undead']),
      (on, off) => {
        expect(off.run.familyMaterials).toEqual([]);
        expect(on.run.familyMaterials).toEqual([
          { materialId: 'fangOrHorn', amount: R.plunder.partsPerFight },
          { materialId: 'graveDust', amount: R.plunder.partsPerFight },
        ]);
      }, 'plunder2', 'The party stripped the fallen for monster parts.', 'Le groupe a dépouillé les vaincus de leurs trophées.'],
    ['Plunder 2: no part from a foe without a part tag', 'plunder', 2, { boss: { hp: 1, damage: 0 } },
      (on) => expect(on.run.familyMaterials).toEqual([]), 'plunder2', null, null],
    // Level 3 still runs Plunder 1 and 2.
    ['Plunder 3: noted on the beaten boss, with Plunder 1 and 2', 'plunder', 3, rats(),
      (on) => {
        expect(logged(last(on), 'plunder3')).toBe(1);
        expect(logged(last(on), 'plunder1')).toBe(1);
        expect(logged(on.fight, 'plunder2')).toBe(1);
      }, 'plunder2', 'The party’s eye for plunder picked out the finest spoils.', null],
    ['Plunder 3: no note when the boss stands', 'plunder', 3, { boss: { damage: 1000 } },
      (on) => expect(logged(last(on), 'plunder3')).toBe(0), 'plunder3', null, null],
    ['Wild 2: a fang or horn after a won fight against beasts', 'wild', 2, rats(),
      (on) => expect(on.run.familyMaterials).toEqual([{ materialId: R.wild.part, amount: R.wild.parts }]), 'wild2',
      'The Wild tended the party after the beasts fell.', null],
    ['Wild 2: nothing after a fight without beasts', 'wild', 2, { boss: { hp: 1, damage: 0 } },
      (on) => expect(on.run.familyMaterials).toEqual([]), 'wild2', null, null],
  ])('%s', (_name, family, level, setup, check, effect, en, fr) => {
    const on = familyFight(family, level, setup);
    const off = familyFight(null, 0, setup);
    check(on, off);
    expect(logged(on.fight, effect)).toBe(en ? 1 : 0);
    if (en) expect(on.log).toContain(en);
    if (fr) expect(on.logFr).toContain(fr);
    expect(familyFight(family, level, setup).run).toEqual(on.run);
  });
});

describe('family loot when the expedition resolves', () => {
  const ratCellar = dungeonById.ratCellar;
  const veterans = (): SaveData => ({
    ...createInitialSave(),
    tutorial: { ...createInitialSave().tutorial, step: 'done' },
    heroes: createInitialSave().heroes.map((h) => ({ ...h, level: 20 })),
  });
  /** A won Rat Cellar run whose party plays at `families`, with `materials` found by the family effects. */
  const resolved = (families: FamilyLevels, materials: RunResult['familyMaterials'] = [], force?: 'gear') => {
    mockRun = (run) => ({ ...run, families, familyMaterials: materials });
    const save = veterans();
    const endsAt = Date.UTC(2026, 5, 10);
    const started = startExpedition(save, ratCellar.id, save.heroes.map((h) => h.id), endsAt - ratCellar.durationMinutes * 60_000, 1, undefined, {});
    const result = resolveExpedition(started, { ...started.expeditions[0], endsAt, guaranteed: false }, force ? { loot: { force } } : {});
    mockRun = (run) => run;
    expect(result.report.success).toBe(true);
    return result.report.loot;
  };

  test('Plunder 1: the run’s gold is 10% higher', () => {
    const off = resolved({}).gold;
    const on = resolved({ plunder: 1 }).gold;
    // Every gold row is scaled before rounding, so the totals differ by the multiplier within a few coins.
    expect(Math.abs(on - off * R.plunder.gold)).toBeLessThanOrEqual(3);
    expect(on).toBeGreaterThan(off);
  });

  test('Plunder 2 and Wild 2: the parts found come home with the loot', () => {
    const count = (loot: ReturnType<typeof resolved>) => loot.materials.find((m) => m.materialId === 'fangOrHorn')?.amount ?? 0;
    expect(count(resolved({ plunder: 2 }, [{ materialId: 'fangOrHorn', amount: 2 }])) - count(resolved({ plunder: 2 }))).toBe(2);
  });

  test('Plunder 3: gear loot rolls one rarity step higher', () => {
    expect(raritySteps({ modifiers: [], familySteps: R.plunder.raritySteps, rng: createRng('r') })).toBe(R.plunder.raritySteps);
    const rank = (loot: ReturnType<typeof resolved>) => RARITIES.indexOf(loot.gear[0].rarity);
    const off = rank(resolved({ plunder: 2 }, [], 'gear'));
    const on = rank(resolved({ plunder: 3 }, [], 'gear'));
    expect(on).toBe(Math.min(off + R.plunder.raritySteps, RARITIES.length - 1));
  });
});
