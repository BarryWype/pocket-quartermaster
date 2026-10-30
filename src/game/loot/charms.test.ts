import { itemById } from '@/content/lookup';
import { lootConfig } from '@/content/loot/config';
import { lootMatrix } from '@/content/loot/matrix';

import { untriggeredSalvage } from '../expeditions/expeditions';
import type { PartyMember, RunResult } from '../expeditions/simulate';
import { createRng } from '../generation/rng';
import type { ConsumableDef } from '../types';
import { categoryChance, partyLuck } from './chances';
import { charmApplies, partyCharms } from './charms';
import { lootGearQuality } from './gear';
import { rollSourceLoot, type LootRequest } from './roll';
import type { LootModifier, LootSourceId } from './types';

const charm = (id: string) => itemById[id] as ConsumableDef;
const carrying = (...ids: string[]) => partyCharms(ids.map((id) => ({ consumable: charm(id) })));

const request = (source: LootSourceId, modifiers: LootModifier[], seed = 's'): LootRequest => ({
  source,
  tier: 1,
  enemies: [],
  base: { gold: 100, xp: 100 },
  context: { playerTier: 1, pickaxeTier: 1, knownRecipes: [], favourCounts: {}, mastery: {} },
  rng: createRng(seed),
  luck: 0,
  modifiers,
});

const { chanceMultiplier, luck, goldPercent, xpPercent } = lootConfig.charms;

describe('charms', () => {
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
    const charmed = categoryChance(category, { source, luck: 0, modifiers: carrying(id) });
    if (base === 0) expect(charmed).toBe(0);
    else expect(charmed).toBeCloseTo(Math.min(lootConfig.maxChance, base * chanceMultiplier));
  });

  it('gives the party Luck, gold and XP', () => {
    expect(partyLuck(0, carrying('luckyEar'))).toBe(luck);
    const plain = rollSourceLoot(request('dungeonRun', []));
    const rich = rollSourceLoot(request('dungeonRun', carrying('bountyToken')));
    const wise = rollSourceLoot(request('dungeonRun', carrying('quillCharm')));
    expect(rich.gold).toBe(Math.round(plain.gold * (1 + goldPercent / 100)));
    expect(wise.xp).toBe(Math.round(plain.xp * (1 + xpPercent / 100)));
  });

  it('lifts found gear one quality, never past the ladder', () => {
    const roll = (steps: number, seed: string) => lootGearQuality('dungeonRun', createRng(seed), 0, undefined, steps);
    const lifts = Array.from({ length: 50 }, (_, i) => [roll(0, `q${i}`), roll(1, `q${i}`)]);
    expect(lifts.some(([plain, lifted]) => plain === 'crappy' && lifted === 'normal')).toBe(true);
    // The basic ladder tops out at Uncommon.
    expect(lifts.every(([plain, lifted]) => plain !== 'uncommon' || lifted === 'uncommon')).toBe(true);
    const found = rollSourceLoot({ ...request('dungeonRun', carrying('tinkersLodestone')), force: 'gear' });
    expect(found.gear).toHaveLength(1);
  });

  it('counts the same charm once and stacks different ones', () => {
    expect(carrying('luckyEar', 'luckyEar')).toHaveLength(1);
    expect(partyLuck(0, carrying('luckyEar', 'luckyEar'))).toBe(luck);
    const both = rollSourceLoot(request('dungeonRun', carrying('bountyToken', 'quillCharm')));
    const plain = rollSourceLoot(request('dungeonRun', []));
    expect(both.gold).toBeGreaterThan(plain.gold);
    expect(both.xp).toBeGreaterThan(plain.xp);
  });

  it('does nothing for a category the source cannot drop, and is then salvaged', () => {
    expect(lootMatrix.dungeonRun.marks.relics).toBe('—');
    expect(categoryChance('relics', { source: 'dungeonRun', luck: 0, modifiers: carrying('graveDustPouch') })).toBe(0);
    expect(charmApplies(charm('graveDustPouch').charm!, 'dungeonRun')).toBe(false);
    expect(charmApplies(charm('graveDustPouch').charm!, 'ruinsDig')).toBe(lootMatrix.ruinsDig.marks.relics !== '—');

    const member = (id: string) => ({ heroId: id, consumable: charm(id), potion: null }) as unknown as PartyMember;
    const run = { consumed: [], threats: [], carriedHealed: [], damageElements: {}, attacked: [], elixirsUsed: [] } as unknown as RunResult;
    const salvaged = untriggeredSalvage([member('graveDustPouch'), member('bountyToken')], run, 'dungeonRun');
    expect(salvaged.map((s) => s.itemId)).toEqual(['graveDustPouch']);
  });
});
