import { newHero } from '@/content/heroes';

import { makeGearPiece } from '../gear/make';
import { createInitialSave, type SaveData } from '../save';
import type { Briefing, ThreatId } from '../types';
import { briefingCoverage } from './coverage';
import { applySwaps, suggestParty, uncovered } from './suggest';

// The starting trio (warrior, ranger, fire mage: no threat family of their own) with these pieces owned, none worn.
const saveWith = (...itemIds: string[]): SaveData => ({
  ...createInitialSave(),
  gear: itemIds.map((itemId, i) => makeGearPiece(`g${i}`, itemId, 'common')),
});
const briefing = (...threats: [ThreatId, 1 | 2 | 3][]): Briefing => ({
  threats: threats.map(([id, level]) => ({ id, level })),
  restriction: null,
  opportunity: null,
});
const covered = (save: SaveData, ids: string[], b: Briefing) => briefingCoverage(save, ids, b).threats.every((t) => t.state === 'met');

describe('uncovered', () => {
  it('counts the threat tags a party still misses', () => {
    expect(uncovered(createInitialSave(), ['bram', 'lyra', 'mira'], briefing(['traps', 3]))).toBe(3);
    expect(uncovered(createInitialSave(), ['bram'], briefing())).toBe(0);
  });
});

describe('suggestParty', () => {
  it('covers a briefing with heroes and gear when it can, and lists the swaps', () => {
    const save = saveWith('spear1', 'leather1', 'mail1');
    const b = briefing(['beasts', 2], ['holy', 1]);
    expect(covered(save, ['bram', 'lyra', 'mira'], b)).toBe(false);
    const suggested = suggestParty(save, b, 3);
    expect(covered(suggested.save, suggested.heroIds, b)).toBe(true);
    expect(suggested.swaps.map((s) => s.gearUid).sort()).toEqual(expect.arrayContaining(['g0', 'g1', 'g2']));
    // The swaps are exactly what changed on the suggested heroes.
    expect(applySwaps(save, suggested.swaps).heroes).toEqual(suggested.save.heroes);
  });

  it('keeps the gear as worn when told not to dress', () => {
    const save = saveWith('spear1', 'leather1');
    const suggested = suggestParty(save, briefing(['beasts', 2]), 3, { dress: false });
    expect(suggested.swaps).toEqual([]);
    expect(suggested.save).toBe(save);
  });

  it('picks the hero whose class answers a threat first', () => {
    const save = { ...createInitialSave(), heroes: [...createInitialSave().heroes, newHero('c', 'Cass', 'cleric', 'none')] };
    const suggested = suggestParty(save, briefing(['holy', 1]), 1);
    expect(suggested.heroIds).toEqual(['c']);
    expect(suggested.swaps).toEqual([]);
  });

  it('fills the slots, and only with free heroes', () => {
    const save = createInitialSave();
    expect(suggestParty(save, briefing(['beasts', 1]), 2).heroIds).toHaveLength(2);
    const working: SaveData = { ...save, heroes: save.heroes.map((h) => (h.id === 'bram' ? { ...h, job: { jobId: 'miner', since: 0, tired: false } } : h)) };
    expect(suggestParty(working, briefing(['beasts', 1]), 3).heroIds.sort()).toEqual(['lyra', 'mira']);
  });

  it('stops at two heroes in Narrow passages', () => {
    expect(suggestParty(createInitialSave(), { ...briefing(['beasts', 1]), restriction: 'narrowPassages' }, 3).heroIds).toHaveLength(2);
  });

  it('breaks ties with the odds it is given', () => {
    const save = createInitialSave();
    const suggested = suggestParty(save, briefing(), 1, { odds: (_dressed, ids) => (ids.includes('mira') ? 1 : 0) });
    expect(suggested.heroIds).toEqual(['mira']);
  });
});
