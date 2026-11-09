import { lootConfig } from '@/content/loot/config';
import { difficultyRules } from '@/content/difficulty';
import { affixById } from '@/content/affixes';
import { RARITIES, type Rarity } from '@/content/gear';
import { trinketId } from '@/content/trinkets';

import { createRng, type Rng } from '../generation/rng';
import { lootGearRarity, lootGearTier, rollLootGear } from './gear';
import type { LootRequest } from './roll';
import { createInitialSave } from '../save';
import { uniquePool } from '../gear/uniques';
import { grantLoot } from './grant';
import { emptyLoot, type LootSourceId, type MapRarity } from './types';

const context = (playerTier: number) => ({
  playerTier,
  pickaxeTier: 3,
  knownRecipes: [] as string[],
  favourCounts: {},
});

const request = (source: LootSourceId, seed: string, overrides: Partial<LootRequest> = {}): LootRequest => ({
  source,
  tier: 3,
  enemies: [],
  base: { gold: 0, xp: 0 },
  context: context(3),
  rng: createRng(seed),
  luck: 0,
  modifiers: [],
  ...overrides,
});

/** A d20 that always shows `die`; the upgrade roll (next) never fires. */
const scripted = (die: number): Rng => ({
  next: () => 0.99,
  int: () => die,
  chance: () => false,
  weighted: <T,>(items: readonly T[]) => items[0],
});

const gearOver = (source: LootSourceId, rolls: number, overrides: Partial<LootRequest> = {}) =>
  Array.from({ length: rolls }, (_, i) => rollLootGear(request(source, `${source}${i}`, overrides)));

describe('looted gear', () => {
  it('gives dungeon sources the source tier', () => {
    const dungeon: LootSourceId[] = ['dungeonRun', 'firstWin', 'firstTierClear', 'tierBoss', 'overnightExpedition'];
    for (const source of dungeon) {
      for (const piece of gearOver(source, 20, { tier: 4 })) {
        expect(piece.itemId).toMatch(/4$/);
      }
    }
  });

  it('gives other sources the player tier or one below', () => {
    for (const piece of gearOver('patrol', 200, { context: context(3) })) {
      expect(piece.itemId).toMatch(/[23]$/);
    }
    for (const piece of gearOver('patrol', 200, { context: context(1) })) {
      expect(piece.itemId).toMatch(/1$/);
    }
    let atPlayerTier = 0;
    for (const piece of gearOver('stepChest', 2000, { context: context(3) })) {
      if (piece.itemId.endsWith('3')) atPlayerTier += 1;
    }
    expect(atPlayerTier / 2000).toBeGreaterThan(0.6);
    expect(atPlayerTier / 2000).toBeLessThan(0.8);
    expect(lootGearTier('stepChest', 5, 1, createRng('low'))).toBe(1);
  });

  it('keeps the ladders in order: basic < big fights < bosses < monster lair', () => {
    const share = (source: LootSourceId, rarities: Rarity[]) =>
      gearOver(source, 2000).filter((piece) => rarities.includes(piece.rarity)).length / 2000;
    const order: LootSourceId[] = ['dungeonRun', 'wantedOutlaw', 'tierBoss', 'monsterLair'];
    const rareOrBetter = order.map((source) => share(source, ['rare', 'legendary']));
    const legendary = order.map((source) => share(source, ['legendary']));
    for (let i = 1; i < order.length; i++) expect(rareOrBetter[i]).toBeGreaterThan(rareOrBetter[i - 1]);
    // The lair lifts its floor to Rare, so its Legendary share is the boss ladder's.
    expect(legendary[0]).toBeLessThan(legendary[1]);
    expect(legendary[1]).toBeLessThan(legendary[2]);
    expect(legendary[3]).toBeGreaterThanOrEqual(legendary[2] - 0.03);
    // A basic source's Rares and Legendaries come only from its small upgrade roll.
    const { rare, legendary: top } = lootConfig.gearRarity.upgrades.basic!;
    expect(rareOrBetter[0]).toBeLessThan((rare + top) * 1.5);
    expect(legendary[0]).toBeLessThan(top * 1.5);
  });

  it('keeps a Legendary at most half as likely as a Rare on every ladder, with Luck and rarity steps', () => {
    const cases: [LootSourceId, MapRarity?][] = [['dungeonRun'], ['wantedOutlaw'], ['firstTierClear'], ['treasureSpot', 'rare'], ['tierBoss'], ['monsterLair']];
    for (const [source, mapRarity] of cases) {
      for (const bonus of [0, 1, 2]) {
        for (const steps of [0, 1]) {
          const rng = createRng(`${source}|${bonus}|${steps}`);
          const rolled = Array.from({ length: 20000 }, () => lootGearRarity(source, rng, bonus, mapRarity, steps));
          const share = (rarity: Rarity) => rolled.filter((r) => r === rarity).length / rolled.length;
          expect(share('rare')).toBeGreaterThan(0);
          expect(share('legendary')).toBeLessThanOrEqual(share('rare') / 2 + 0.01);
        }
      }
    }
  });

  it('never lifts a piece past Rare with a rarity step', () => {
    // A d20 of 19 is Rare on the boss ladder and the lair's floor: a step keeps it Rare.
    expect(lootGearRarity('tierBoss', scripted(19), 0, undefined, 1)).toBe('legendary');
    expect(lootGearRarity('tierBoss', scripted(18), 0, undefined, 1)).toBe('rare');
    expect(lootGearRarity('monsterLair', scripted(2), 0, undefined, 2)).toBe('rare');
    expect(lootGearRarity('wantedOutlaw', scripted(19), 0, undefined, 1)).toBe('rare');
  });

  it('holds the source floors', () => {
    for (const piece of gearOver('firstTierClear', 100)) {
      expect(RARITIES.indexOf(piece.rarity)).toBeGreaterThanOrEqual(RARITIES.indexOf('uncommon'));
    }
    for (const piece of gearOver('monsterLair', 100)) {
      expect(RARITIES.indexOf(piece.rarity)).toBeGreaterThanOrEqual(RARITIES.indexOf('rare'));
    }
  });

  it('shifts the ladder one step per 10 Luck', () => {
    // A d20 of 14 is Common on the basic ladder, Uncommon with +1.
    expect(lootGearRarity('dungeonRun', scripted(14), 0)).toBe('common');
    expect(lootGearRarity('dungeonRun', scripted(14), 1)).toBe('uncommon');
    const lucky = gearOver('dungeonRun', 300, { luck: 10 });
    const plain = gearOver('dungeonRun', 300);
    const average = (pieces: { rarity: Rarity }[]) =>
      pieces.reduce((sum, piece) => sum + RARITIES.indexOf(piece.rarity), 0) / pieces.length;
    expect(average(lucky)).toBeGreaterThan(average(plain));
  });

  it('raises a hard source one rarity step over the same roll at easy', () => {
    const easy = gearOver('dungeonRun', 300, { difficulty: 'easy' });
    const hard = gearOver('dungeonRun', 300, { difficulty: 'hard' });
    const best = RARITIES.indexOf('uncommon'); // the basic ladder's top
    for (let i = 0; i < easy.length; i++) {
      // The upgrade roll lands the same on both, past any step: those pieces match.
      if (RARITIES.indexOf(easy[i].rarity) > best) {
        expect(hard[i].rarity).toBe(easy[i].rarity);
        continue;
      }
      expect(RARITIES.indexOf(hard[i].rarity)).toBe(
        Math.min(RARITIES.indexOf(easy[i].rarity) + difficultyRules.rewards.hard.raritySteps, best),
      );
    }
  });

  it('leaves the rolls to the grant, which knows the uid', () => {
    for (const piece of gearOver('dungeonRun', 30)) expect(Object.keys(piece).sort()).toEqual(['itemId', 'rarity', 'uid']);
  });
});

describe('looted pieces once granted', () => {
  const granted = (itemId: string, rarity: Rarity, count: number) =>
    grantLoot(
      createInitialSave(),
      [],
      { ...emptyLoot(), gear: Array.from({ length: count }, () => ({ uid: '' as const, itemId, rarity })) },
      0,
    ).gear.slice(-count);

  it('carry their rarity’s affixes from the slot pool, loot-only ones included', () => {
    const swords = granted('sword3', 'rare', 300);
    const ids = swords.flatMap((piece) => piece.affixes.map((a) => a.id));
    for (const piece of swords) expect(piece.affixes).toHaveLength(2);
    expect(ids.every((id) => affixById[id].slot !== 'armourOffhand')).toBe(true);
    expect(ids.some((id) => affixById[id].source.kind === 'loot')).toBe(true);
  });

  it('give a Legendary one unique that fits it', () => {
    for (const piece of granted('mail4', 'legendary', 30)) {
      expect(piece.affixes).toHaveLength(3);
      expect(uniquePool(piece).map((relic) => relic.id)).toContain(piece.unique);
    }
  });

  it('give trinkets affixes from the any-slot pool, their stats rolled like gear', () => {
    for (const piece of granted(trinketId('hawkEyeRing', 2), 'uncommon', 30)) {
      expect(piece.affixes).toHaveLength(1);
      expect(affixById[piece.affixes[0].id].slot).toBe('any');
      expect(piece.roll).toBeGreaterThanOrEqual(3);
      expect(piece.roll).toBeLessThanOrEqual(18);
    }
  });
});
