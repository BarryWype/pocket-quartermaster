import { lootConfig } from '@/content/loot/config';
import { lootMatrix } from '@/content/loot/matrix';
import { lootTrinketKinds } from '@/content/trinkets';

import { createRng } from '../generation/rng';
import { categoryChance, partyLuck } from './chances';
import { lootGearRarity, raritySteps } from './gear';
import { lootModifierApplies, partyLootModifiers } from './modifiers';
import { rollSourceLoot, type LootRequest } from './roll';
import type { LootModifier, LootSourceId } from './types';

const kind = (id: string) => lootTrinketKinds.find((k) => k.kind === id)!;
const carrying = (...ids: string[]) => partyLootModifiers(ids.map((id) => ({ loot: kind(id).loot })));

const request = (source: LootSourceId, modifiers: LootModifier[], seed = 's'): LootRequest => ({
  source,
  tier: 1,
  enemies: [],
  base: { gold: 100, xp: 100 },
  context: { playerTier: 1, pickaxeTier: 1, knownRecipes: [], favourCounts: {} },
  rng: createRng(seed),
  luck: 0,
  modifiers,
});

const { chanceMultiplier, goldPercent, xpPercent, rarityChance } = lootConfig.lootTrinkets;

describe('loot trinket modifiers', () => {
  it.each([
    ['scarabCharm', 'treasureMaps'],
    ['ghostLantern', 'keyFragments'],
    ['graveDustPouch', 'relics'],
    ['prismCharm', 'trinkets'],
    ['architectsSeal', 'blueprints'],
    ['seersCandle', 'manuals'],
  ] as const)('%s multiplies the %s chance', (id, category) => {
    const source = 'monsterLair';
    const base = categoryChance(category, { source, luck: 0, modifiers: [] });
    const worn = categoryChance(category, { source, luck: 0, modifiers: carrying(id) });
    if (base === 0) expect(worn).toBe(0);
    else expect(worn).toBeCloseTo(Math.min(lootConfig.maxChance, base * chanceMultiplier));
  });

  it('raises the run’s gold and XP', () => {
    const plain = rollSourceLoot(request('dungeonRun', []));
    const rich = rollSourceLoot(request('dungeonRun', carrying('bountyToken')));
    const wise = rollSourceLoot(request('dungeonRun', carrying('quillCharm')));
    expect(rich.gold).toBe(Math.round(plain.gold * (1 + goldPercent / 100)));
    expect(wise.xp).toBe(Math.round(plain.xp * (1 + xpPercent / 100)));
  });

  it('lifts found gear one rarity only when its chance roll passes', () => {
    const worn = { ...request('dungeonRun', carrying('tinkersLodestone')) };
    // A rng that always rolls high never passes the 50% chance, one that always rolls low always does.
    const high = { ...worn, rng: { ...createRng('h'), next: () => 0.99 } };
    const low = { ...worn, rng: { ...createRng('l'), next: () => 0 } };
    expect(raritySteps(high)).toBe(0);
    expect(raritySteps(low)).toBe(1);
    const lifts = Array.from({ length: 60 }, (_, i) => [
      lootGearRarity('dungeonRun', createRng(`q${i}`), 0, undefined, 0),
      lootGearRarity('dungeonRun', createRng(`q${i}`), 0, undefined, 1),
    ]);
    expect(lifts.some(([plain, lifted]) => plain === 'common' && lifted === 'uncommon')).toBe(true);
    // The basic ladder tops out at Uncommon.
    expect(lifts.every(([plain, lifted]) => plain !== 'uncommon' || lifted === 'uncommon')).toBe(true);
    expect(rarityChance).toBeGreaterThan(0);
  });

  it('counts the same trinket once and stacks different ones', () => {
    expect(carrying('bountyToken', 'bountyToken')).toHaveLength(1);
    const both = rollSourceLoot(request('dungeonRun', carrying('bountyToken', 'quillCharm')));
    const plain = rollSourceLoot(request('dungeonRun', []));
    expect(both.gold).toBeGreaterThan(plain.gold);
    expect(both.xp).toBeGreaterThan(plain.xp);
  });

  it('does nothing for a category the source cannot drop', () => {
    expect(lootMatrix.dungeonRun.marks.relics).toBe('—');
    expect(categoryChance('relics', { source: 'dungeonRun', luck: 0, modifiers: carrying('graveDustPouch') })).toBe(0);
    expect(lootModifierApplies(kind('graveDustPouch').loot, 'dungeonRun')).toBe(false);
    expect(lootModifierApplies(kind('graveDustPouch').loot, 'ruinsDig')).toBe(lootMatrix.ruinsDig.marks.relics !== '—');
  });

  it('keeps a flat Luck modifier working (a running expedition can still carry one)', () => {
    expect(partyLuck(0, [{ id: 'luckyEar', kind: 'luck', add: 3 }])).toBe(3);
  });
});
