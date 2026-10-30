import { mobById, patrolMobId, placeMobId } from '@/content/enemies';
import { components } from '@/content/loot/components';

import { createRng } from '../generation/rng';
import { componentForMob } from './components';
import { generators } from './generators';
import { rollSourceLoot, type LootRequest } from './roll';
import { emptyLoot, type Loot, type LootSourceId } from './types';

const context = { playerTier: 3, pickaxeTier: 3, knownRecipes: [] as string[], favourCounts: {}, mastery: {} };

const request = (source: LootSourceId, seed: string, overrides: Partial<LootRequest> = {}): LootRequest => ({
  source,
  tier: 3,
  enemies: [],
  base: { gold: 0, xp: 0 },
  context,
  rng: createRng(seed),
  luck: 0,
  modifiers: [],
  force: 'components',
  ...overrides,
});

const COMPONENT_IDS = new Set(components.map((c) => c.id));
const BOSS_IDS = components.filter((c) => c.bossId).map((c) => c.id);
const HEART_IDS = components.filter((c) => c.element).map((c) => c.id);

/** The component stacks of a roll: shards and themed materials land in `materials` too. */
const componentStacks = (loot: Loot) => loot.materials.filter((s) => COMPONENT_IDS.has(s.materialId));

const rolledIds = (source: LootSourceId, seedPrefix: string, seeds: number, overrides: Partial<LootRequest> = {}): string[] =>
  Array.from({ length: seeds }, (_, i) =>
    rollSourceLoot(request(source, `${seedPrefix}${i}`, overrides)),
  ).flatMap((loot) => componentStacks(loot).map((stack) => stack.materialId));

describe('components', () => {
  it('gives the tier boss its own component, from no other source', () => {
    expect(rolledIds('tierBoss', 'boss-', 1, { enemies: ['banditCaptain'] })).toEqual(['captainsSpurs']);
    expect(rolledIds('tierBoss', 'boss-', 1, { enemies: ['elderDragon'] })).toEqual(['dragonClaw']);
    const elsewhere = rolledIds('beastDen', 'elsewhere-', 100, { enemies: ['banditCaptain'] });
    expect(elsewhere.length).toBeGreaterThan(0);
    for (const id of elsewhere) expect(BOSS_IDS).not.toContain(id);
  });

  it('falls through to the shared pools when the blueprint handoff finds no boss component', () => {
    const loot = emptyLoot();
    generators.components(request('tierBoss', 'handoff', { enemies: [] }), loot, true);
    expect(componentStacks(loot).map((stack) => stack.materialId)).toEqual([
      expect.any(String),
    ]);
    expect(BOSS_IDS).not.toContain(componentStacks(loot)[0].materialId);
  });

  it('maps elites to their family tag component', () => {
    const cases: [string, string][] = [
      [patrolMobId('herd', 1, 'weak', true), 'drakeFang'],
      [patrolMobId('herd', 3, 'weak', true), 'harpyFlightFeather'],
      [placeMobId('goblinRaid', 4, 'normal', true), 'clockworkEscapement'],
      [placeMobId('monsterLair', 2, 'normal', true), 'trollHide'],
      [patrolMobId('goblins', 1, 'weak', true), 'orcWarDrumSkin'],
      [placeMobId('monsterLair', 1, 'boss', true), 'spiderSilk'],
    ];
    for (const [mobId, componentId] of cases) {
      expect(mobById[mobId]).toBeDefined();
      expect(rolledIds('patrolHerd', `${mobId}-`, 1, { enemies: [mobId] })).toEqual([componentId]);
    }
  });

  it('splits constructs into golem cores and clockwork escapements', () => {
    expect(componentForMob(mobById['rockGolem'])).toBe('golemCore');
    expect(componentForMob(mobById['clockworkGuard'])).toBe('clockworkEscapement');
  });

  it('adds the lair components to the monster lair pool', () => {
    const ids = new Set(rolledIds('monsterLair', 'lair-', 100, { enemies: [placeMobId('monsterLair', 2, 'normal', true)] }));
    expect([...ids].sort()).toEqual(['drakeFang', 'harpyFlightFeather', 'trollHide'].sort());
  });

  it('gives the heart of the roll element, or a random one', () => {
    expect(rolledIds('elementalRift', 'rift-', 1, { element: 'fire' })).toEqual(['fireHeart']);
    expect(rolledIds('sanctum', 'sanctum-', 1, { element: 'water' })).toEqual(['waterHeart']);
    expect(new Set(rolledIds('sanctum', 'heart-', 100))).toEqual(new Set(HEART_IDS));
  });

  it('falls back to the tag component of non-elite enemies', () => {
    expect(rolledIds('beastDen', 'fallback-', 1, { enemies: [placeMobId('beastDen', 1, 'weak', false)] })).toEqual(['drakeFang']);
    expect(rolledIds('beastDen', 'fallback-', 1, { enemies: [placeMobId('beastDen', 1, 'normal', false)] })).toEqual(['spiderSilk']);
  });

  it('gives any non-boss component when no enemy matches', () => {
    const ids = new Set(rolledIds('fishingDock', 'any-', 200));
    expect(ids.size).toBeGreaterThan(1);
    for (const id of ids) expect(BOSS_IDS).not.toContain(id);
  });

  it('merges with an existing stack of the same component', () => {
    const req = request('elementalRift', 'merge', { element: 'fire' });
    const loot = emptyLoot();
    generators.components(req, loot);
    generators.components(req, loot);
    expect(loot.materials).toEqual([{ materialId: 'fireHeart', amount: 2 }]);
  });
});
