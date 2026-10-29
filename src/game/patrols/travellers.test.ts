import { heroClasses, newHero } from '@/content/heroes';
import { patrolRules, travellerRules } from '@/content/patrols';
import { treasureRules } from '@/content/treasure';
import { traits } from '@/content/traits';

import { distanceMeters } from '../generation/geo';
import { rosterCap } from '../guild/guild';
import type { SaveData } from '../save';
import { currentHp, isExhausted, setHeroHp } from '../team/health';
import type { PatrolSpawn } from './generate';
import { findSpawn, fixOn, tierTeam } from './testHelpers';
import { acceptRecruit, helpProblem, helpTraveller, trade, tradeProblem, traderOffers, travellerOffer, type TravellerReward } from './travellers';
import { isGone } from './visibility';

const MINUTE = 60_000;
const stocked = (save: SaveData = tierTeam()): SaveData => ({ ...save, consumables: { ...save.consumables, healingPotion: 2, huntersStew: 1, trailMix: 4 } });
const { spawn: wounded, at } = findSpawn((s) => s.kind === 'wounded');
const here = (spawn: PatrolSpawn, time: number) => fixOn(spawn, time).position;

/** A traveller of a kind whose help pays this reward (rewards are seeded on the spawn id). */
function withReward(kind: 'wounded' | 'pilgrim', reward: TravellerReward['kind']) {
  const found = findSpawn((s) => s.kind === kind);
  for (let i = 0; i < 300; i++) {
    const spawn = { ...found.spawn, id: `${found.spawn.id}:${i}` };
    const help = helpTraveller(stocked(), spawn, here(spawn, found.at), found.at);
    if (help.reward.kind === reward) return { spawn, at: found.at, help };
  }
  throw new Error(`No ${kind} paying ${reward}`);
}

describe('travellers', () => {
  it('ask the wounded for a potion and take it', () => {
    expect(travellerOffer(wounded, tierTeam())).toEqual({ kind: 'potion', itemId: 'healingPotion', amount: 1 });
    expect(helpProblem(tierTeam(), wounded, here(wounded, at), at)).toBe('noStock');
    const { save } = helpTraveller(stocked(), wounded, here(wounded, at), at);
    expect(save.consumables.healingPotion).toBe(1);
    expect(isGone(wounded, save.helpedTravellers, at + MINUTE)).toBe(true);
    expect(helpProblem(stocked(save), wounded, here(wounded, at + MINUTE), at + MINUTE)).toBe('gone');
  });

  it('take a meal or 3 supply points from the pilgrim', () => {
    const { spawn: pilgrim, at: time } = findSpawn((s) => s.kind === 'pilgrim');
    const meal = helpTraveller(stocked(), pilgrim, here(pilgrim, time), time, 'meal').save;
    expect(meal.consumables.huntersStew).toBe(0);
    const supply = helpTraveller(stocked(), pilgrim, here(pilgrim, time), time, 'supply').save;
    expect(supply.consumables.trailMix).toBe(2);
    const empty = { ...tierTeam(), consumables: { trailMix: 1 } };
    expect(helpProblem(empty, pilgrim, here(pilgrim, time), time)).toBe('noStock');
  });

  it('pay the same seeded reward every time', () => {
    const one = helpTraveller(stocked(), wounded, here(wounded, at), at).reward;
    expect(helpTraveller(stocked(), wounded, here(wounded, at), at).reward).toEqual(one);
    expect(['gold', 'shards', 'treasureSpot', 'recruit']).toContain(one.kind);
  });

  it('can leave a treasure spot within walking distance', () => {
    const { spawn, at: time, help } = withReward('wounded', 'treasureSpot');
    const map = help.save.treasureMaps[help.save.treasureMaps.length - 1];
    const meters = distanceMeters(here(spawn, time), map.location!);
    expect(meters).toBeGreaterThanOrEqual(treasureRules.distanceMeters[0] - 1);
    expect(meters).toBeLessThanOrEqual(treasureRules.distanceMeters[1] + 1);
    expect(map.expiresAt).toBeGreaterThan(time);
  });

  it('can bless every hero at home back to full, but not those away', () => {
    const { spawn, at: time } = withReward('pilgrim', 'blessing');
    let save = stocked(setHeroHp(setHeroHp(tierTeam(), 'bram', 0, time, true), 'lyra', 0.3, time));
    save = { ...save, patrolFights: [{ id: 'f', patrolId: 'x', kind: 'goblins', tier: 1, elite: false, heroIds: ['lyra'], startedAt: time, endsAt: time + 5 * MINUTE, windowEndsAt: time, won: true, hp: [], salvaged: [], rewards: { gold: 0, xp: 0, materials: [] } }] };
    const blessed = helpTraveller(save, spawn, here(spawn, time), time).save;
    const bram = blessed.heroes.find((h) => h.id === 'bram')!;
    expect(isExhausted(bram, time)).toBe(false);
    expect(currentHp(blessed, bram, time)).toBeGreaterThan(0);
    expect(bram.hp).toBeUndefined();
    expect(blessed.heroes.find((h) => h.id === 'lyra')!.hp).toBeDefined();
  });

  it('can hand over a key fragment, which is kept', () => {
    const { help } = withReward('pilgrim', 'keyFragment');
    expect(help.save.keyFragments).toBe(1);
  });
});

describe('traveller recruits', () => {
  const always = { ...patrolRules, recruitChance: 1 };
  /** A roster of `size`, with Guild Hall roster slot 7 bought so there is room for one more. */
  const withRoster = (size: number): SaveData => {
    let save: SaveData = { ...stocked(), guild: { rosterSlot7: 1 } };
    while (save.heroes.length < size) save = { ...save, heroes: [...save.heroes, newHero(`x${save.heroes.length}`, 'X', 'warrior', 'resilient', save.heroes[0].level)] };
    return save;
  };

  it('only offer to join a roster of at least 6', () => {
    expect(helpTraveller(withRoster(5), wounded, here(wounded, at), at, undefined, always).reward.kind).not.toBe('recruit');
    expect(helpTraveller(withRoster(6), wounded, here(wounded, at), at, undefined, always).reward.kind).toBe('recruit');
  });

  it('offer a hero with a positive trait near the roster median, if the roster has room', () => {
    const save = withRoster(6);
    const { reward, rosterFull } = helpTraveller(save, wounded, here(wounded, at), at, undefined, always);
    expect(rosterFull).toBe(false);
    if (reward.kind !== 'recruit') throw new Error('expected a recruit');
    expect(traits.find((t) => t.id === reward.offer.trait)!.positive).toBe(true);
    expect(reward.offer.level).toBe(save.heroes[0].level);
    const joined = acceptRecruit(save, reward.offer);
    expect(joined.heroes).toHaveLength(save.heroes.length + 1);
  });

  it('roll the recruit from the spawn alone and keep the roll when they join', () => {
    const save = withRoster(6);
    const { reward } = helpTraveller(save, wounded, here(wounded, at), at, undefined, always);
    if (reward.kind !== 'recruit') throw new Error('expected a recruit');
    const again = helpTraveller(save, wounded, here(wounded, at), at, undefined, always);
    if (again.reward.kind !== 'recruit') throw new Error('expected a recruit');
    expect(again.reward.offer.roll).toEqual(reward.offer.roll);
    expect(again.reward.offer.grade).toBe(reward.offer.grade);
    const joined = acceptRecruit(save, reward.offer);
    expect(joined.heroes.at(-1)!.roll).toEqual(reward.offer.roll);
  });

  it('pay the normal reward instead with a full roster, and say so', () => {
    let save = stocked();
    while (save.heroes.length < rosterCap(save)) save = { ...save, heroes: [...save.heroes, newHero(`x${save.heroes.length}`, 'X', 'warrior', 'resilient')] };
    const { reward, rosterFull } = helpTraveller(save, wounded, here(wounded, at), at, undefined, always);
    expect(rosterFull).toBe(true);
    expect(reward.kind).not.toBe('recruit');
  });

  it('come about 5% of the time', () => {
    const save = withRoster(6);
    const helped = Array.from({ length: 400 }, (_, i) => {
      const spawn = { ...wounded, id: `${wounded.id}:${i}` };
      return helpTraveller(save, spawn, here(spawn, at), at).reward.kind;
    });
    const share = helped.filter((k) => k === 'recruit').length / helped.length;
    expect(share).toBeGreaterThan(0.02);
    expect(share).toBeLessThan(0.09);
  });

  it('are a hooded rare class about 5% of the time, or always with forceRare', () => {
    const save = withRoster(6);
    let hooded = 0;
    for (let i = 0; i < 400; i++) {
      const spawn = { ...wounded, id: `${wounded.id}:${i}` };
      const { reward } = helpTraveller(save, spawn, here(spawn, at), at, undefined, always);
      if (reward.kind !== 'recruit') throw new Error('expected a recruit');
      expect(reward.offer.hooded ?? false).toBe(heroClasses[reward.offer.classId].rarity === 'rare');
      if (reward.offer.hooded) hooded++;
    }
    expect(hooded / 400).toBeGreaterThan(0.03);
    expect(hooded / 400).toBeLessThan(0.07);
    for (let i = 0; i < 20; i++) {
      const spawn = { ...wounded, id: `${wounded.id}:force:${i}` };
      const { reward } = helpTraveller(save, spawn, here(spawn, at), at, undefined, always, true);
      if (reward.kind !== 'recruit') throw new Error('expected a recruit');
      expect(heroClasses[reward.offer.classId].rarity).toBe('rare');
      expect(reward.offer.hooded).toBe(true);
    }
  });
});

describe('traders', () => {
  const { spawn: trader, at: time } = findSpawn((s) => s.kind === 'trader');
  const rich = (pickaxe: string[]): SaveData => ({ ...tierTeam(), tools: pickaxe, materials: { bone: 30, mushroom: 30, hide: 30, wood: 30, berries: 30, meat: 30 } });

  it('offer 2–3 seeded trades, never ore above the pickaxe', () => {
    const offers = traderOffers(trader, rich(['woodPickaxe', 'stonePickaxe', 'copperPickaxe', 'ironPickaxe']));
    expect(offers.length).toBeGreaterThanOrEqual(travellerRules.tradesPer[0]);
    expect(offers.length).toBeLessThanOrEqual(travellerRules.tradesPer[1]);
    expect(traderOffers(trader, rich(['woodPickaxe']))).toEqual(traderOffers(trader, rich(['woodPickaxe'])));
    const gets = traderOffers(trader, rich([])).map((o) => o.get.materialId);
    for (const ore of ['copper', 'iron', 'coal']) expect(gets).not.toContain(ore);
  });

  it('swap materials a limited number of times, and leave the map once traded with', () => {
    const save = rich([]);
    const [offer] = traderOffers(trader, save);
    const player = here(trader, time);
    let next = save;
    for (let i = 0; i < travellerRules.usesPerTrade; i++) next = trade(next, trader, offer.index, player, time);
    expect(next.materials[offer.give.materialId]).toBe(30 - offer.give.amount * travellerRules.usesPerTrade);
    expect(next.materials[offer.get.materialId]).toBe((save.materials[offer.get.materialId] ?? 0) + offer.get.amount * travellerRules.usesPerTrade);
    expect(tradeProblem(next, trader, offer.index, player, time)).toBe('usedUp');
    expect(traderOffers(trader, next).find((o) => o.index === offer.index)!.usesLeft).toBe(0);
    expect(isGone(trader, next.helpedTravellers, time)).toBe(true);
    expect(tradeProblem({ ...save, materials: {} }, trader, offer.index, player, time)).toBe('noMaterials');
  });
});
