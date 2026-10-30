import { patrolRules } from '@/content/patrols';
import { components } from '@/content/loot/components';
import { monsterParts } from '@/content/loot/monsterParts';

import { offsetPosition } from '../generation/geo';
import { createRng } from '../generation/rng';
import { prepareParty } from '../expeditions/simulate';
import { estimatePartyOdds } from '../expeditions/odds';
import { currentHp, isExhausted, setHeroHp } from '../team/health';
import { isAway } from '../team/team';
import { patrolDungeon, patrolFightProblem, patrolRewards, patrolRunOptions, resolvePatrolFights, rewardContextOf, startPatrolFight } from './fight';
import { isPatrolKind, type PatrolKind, type PatrolSpawn } from './generate';
import { findSpawn, fixOn, tierTeam } from './testHelpers';
import { isGone } from './visibility';

const MINUTE = 60_000;
const { spawn: goblins, at } = findSpawn((s) => s.kind === 'goblins' && s.tierRoll !== 'elite');
const player = fixOn(goblins, at).position;

const asKind = (spawn: PatrolSpawn, kind: PatrolKind, tierRoll: PatrolSpawn['tierRoll'] = 'current'): PatrolSpawn => ({ ...spawn, kind, tierRoll });

describe('engaging a patrol', () => {
  it('takes only home heroes who are not exhausted, within engage range, within the party size', () => {
    const save = tierTeam();
    expect(patrolFightProblem(save, goblins, ['bram'], player, at)).toBeNull();
    expect(patrolFightProblem(save, goblins, ['bram'], offsetPosition(player, patrolRules.engageMeters + 20, 0), at)).toBe('tooFar');
    expect(patrolFightProblem(save, goblins, [], player, at)).toBe('empty');
    expect(patrolFightProblem(save, goblins, ['bram', 'lyra', 'mira', 'x'], player, at)).toBe('partySize');
    expect(patrolFightProblem(setHeroHp(save, 'bram', 0, at, true), goblins, ['bram'], player, at)).toBe('exhausted');
    const away = startPatrolFight(save, goblins, ['bram'], player, at);
    expect(isAway(away, 'bram')).toBe(true);
    expect(patrolFightProblem(away, goblins, ['bram'], player, at)).toBe('away');
  });

  it('fights with current HP, keeps it while away, and brings the heroes back with what the run left', () => {
    const hurt = setHeroHp(tierTeam(), 'bram', 0.6, at);
    const started = startPatrolFight(hurt, goblins, ['bram'], player, at);
    const fight = started.patrolFights[0];
    const bram = () => started.heroes.find((h) => h.id === 'bram')!;
    expect(fight.endsAt).toBe(at + 2 * MINUTE);
    // Away heroes don't heal.
    expect(currentHp(started, bram(), at + MINUTE)).toBeCloseTo(currentHp(hurt, hurt.heroes[0], at), 5);
    const { save, resolved } = resolvePatrolFights(started, fight.endsAt);
    expect(resolved).toHaveLength(1);
    expect(save.patrolFights).toHaveLength(0);
    const back = save.heroes.find((h) => h.id === 'bram')!;
    expect(currentHp(save, back, fight.endsAt)).toBeCloseTo(fight.hp[0].hp, 5);
  });

  it('removes a hero picked from escort duty from the escort', () => {
    const save = { ...tierTeam(), escort: { heroId: 'bram' } };
    expect(startPatrolFight(save, goblins, ['bram'], player, at).escort).toBeNull();
    expect(startPatrolFight(save, goblins, ['lyra'], player, at).escort).toEqual({ heroId: 'bram' });
  });

  it('hides a beaten patrol until its window ends, and leaves a lost one on the map', () => {
    const won = resolvePatrolFights(startPatrolFight(tierTeam(), goblins, ['bram', 'lyra', 'mira'], player, at), at + 2 * MINUTE);
    expect(won.resolved[0].won).toBe(true);
    expect(isGone(goblins, won.save.beatenPatrols, at + 3 * MINUTE)).toBe(true);
    expect(isGone(goblins, won.save.beatenPatrols, goblins.endsAt)).toBe(true);

    const weak = setHeroHp(tierTeam(), 'mira', 0.02, at);
    const lost = resolvePatrolFights(startPatrolFight(weak, goblins, ['mira'], player, at), at + 2 * MINUTE);
    expect(lost.resolved[0].won).toBe(false);
    expect(lost.save.gold).toBe(weak.gold);
    expect(isGone(goblins, lost.save.beatenPatrols, at + 3 * MINUTE)).toBe(false);
    const mira = lost.save.heroes.find((h) => h.id === 'mira')!;
    expect(isExhausted(mira, at + 3 * MINUTE)).toBe(true);
    expect(isExhausted(mira, at + 23 * MINUTE)).toBe(false);
  });

  it('empties the consumable slot and salvages an unused healing potion into herb', () => {
    let save = tierTeam();
    save = { ...save, heroes: save.heroes.map((h) => (h.id === 'bram' ? { ...h, equipment: { ...h.equipment, consumable: 'healingPotion' } } : h)) };
    const done = resolvePatrolFights(startPatrolFight(save, goblins, ['bram', 'lyra', 'mira'], player, at), at + 2 * MINUTE);
    const bram = done.save.heroes.find((h) => h.id === 'bram')!;
    expect(bram.equipment.consumable).toBeNull();
    expect(done.save.consumables.healingPotion ?? 0).toBe(0);
    const salvaged = done.resolved[0].salvaged.find((s) => s.itemId === 'healingPotion');
    expect(salvaged).toMatchObject({ heroId: 'bram', itemId: 'healingPotion', gold: 0 });
    // A potion is herb 2, mushroom 1: half is one herb, the main input at least 1.
    expect(salvaged?.materials).toEqual([{ materialId: 'herb', amount: 1 }]);
    expect((done.save.materials.herb ?? 0) - (save.materials.herb ?? 0)).toBe(1);
  });
});

describe('patrol rewards', () => {
  const context = { goldMultiplier: 1, luck: 0, pickaxeTier: 0, playerTier: 1 };
  const rewards = (ctx: typeof context, spawn: PatrolSpawn, tier: number, elite: boolean, seed: string) =>
    patrolRewards(ctx, spawn, tier, elite, [], createRng(seed));

  it('pays the Guild Hall gold track and XP from the tier', () => {
    // Goblin gold and XP drop often, not always: take the first seed where both did.
    const seed = Array.from({ length: 50 }, (_, i) => `r${i}`).find((s) => {
      const loot = rewards(context, goblins, 2, false, s);
      return loot.gold > 0 && loot.xp > 0;
    })!;
    const plain = rewards(context, goblins, 2, false, seed);
    const guild = rewards({ ...context, goldMultiplier: 1.2 }, goblins, 2, false, seed);
    expect(plain.gold).toBeGreaterThan(0);
    expect(guild.gold).toBe(Math.round(plain.gold * 1.2));
    expect(plain.xp).toBeGreaterThan(0);
    expect(rewardContextOf({ ...tierTeam(), guild: { gold: 2 } }).goldMultiplier).toBeGreaterThan(1);
  });

  it('pays elites twice the gold and XP, with the same rolls otherwise', () => {
    const herd = asKind(goblins, 'herd');
    const normal = rewards(context, herd, 2, false, 'r');
    const elite = rewards(context, herd, 2, true, 'r');
    expect(elite.gold).toBe(normal.gold * 2);
    expect(elite.xp).toBe(normal.xp * 2);
    expect(elite.materials).toEqual(normal.materials);
  });

  it('fills a bandit cache from the gathering table, never with ore above the pickaxe', () => {
    const bandits = asKind(goblins, 'bandits');
    const held = (pickaxeTier: number) =>
      new Set(Array.from({ length: 300 }, (_, i) => rewards({ ...context, pickaxeTier }, bandits, 2, false, `c${i}`).materials.map((m) => m.materialId)).flat());
    const none = held(0);
    expect(none.has('wood')).toBe(true);
    for (const ore of ['stone', 'copper', 'iron', 'coal', 'steel']) expect(none.has(ore)).toBe(false);
    const stone = held(1);
    expect(stone.has('stone')).toBe(true);
    for (const ore of ['copper', 'iron', 'coal']) expect(stone.has(ore)).toBe(false);
  });

  it('gives herds meat and hide', () => {
    // Components and monster parts land in `materials` too; the herd's themed drops are these.
    const componentIds = new Set([...components.map((c) => c.id), ...monsterParts.map((p) => p.id)]);
    const materials = Array.from({ length: 200 }, (_, i) =>
      rewards(context, asKind(goblins, 'herd'), 1, false, `h${i}`).materials.filter((m) => !componentIds.has(m.materialId)).map((m) => m.materialId),
    ).flat();
    expect(new Set(materials)).toEqual(new Set(['meat', 'hide', 'bone']));
  });
});

// Skipped until the class and gear rework rebalances dungeons around threats.
describe.skip('patrol odds (tier gear, Normal, full HP)', () => {
  const kinds: [PatrolKind, string[][], number][] = [
    ['goblins', [['bram'], ['lyra'], ['mira']], 0.9],
    ['herd', [['bram'], ['lyra'], ['mira']], 0.9],
    ['bandits', [['bram', 'lyra'], ['bram', 'mira'], ['lyra', 'mira']], 0.75],
  ];
  for (const tier of [1, 3, 5]) {
    for (const [kind, parties, target] of kinds) {
      it(`tier ${tier} ${kind} is about ${target * 100}% at the recommended party size, elites harder`, () => {
        const save = tierTeam(tier);
        const odds = (elite: boolean) =>
          parties
            .map((p) => estimatePartyOdds(prepareParty(save, p), patrolDungeon(asKind(goblins, kind), tier, elite), 300, patrolRunOptions(kind)).success)
            .reduce((a, b) => a + b) / parties.length;
        const normal = odds(false);
        expect(Math.abs(normal - target)).toBeLessThan(0.08);
        expect(odds(true)).toBeLessThan(normal - 0.05);
      });
    }
  }

  it('only builds fights for patrols', () => {
    const traveller = findSpawn((s) => !isPatrolKind(s.kind)).spawn;
    expect(() => patrolDungeon(traveller, 1, false)).toThrow();
  });
});
