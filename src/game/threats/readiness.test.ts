import { newHero } from '@/content/heroes';

import { makeGearPiece } from '../gear/make';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import type { Briefing, ThreatId } from '../types';
import { briefingReadiness } from './readiness';

// The starting trio (warrior, ranger, fire mage: no threat family of their own) with these pieces owned, none worn.
const saveWith = (...itemIds: string[]): SaveData => {
  const base = createInitialSave();
  return { ...base, gear: itemIds.map((itemId, i) => makeGearPiece(`g${i}`, itemId, 'common')) };
};
const briefing = (...threats: [ThreatId, 1 | 2 | 3][]): Briefing => ({
  threats: threats.map(([id, level]) => ({ id, level })),
  restriction: null,
  opportunity: null,
});

describe('briefingReadiness', () => {
  it('is ready when free heroes cover every threat in the gear they wear now', () => {
    const save = equip(saveWith('bow1'), 'lyra', 'weapon', 'g0');
    // The bow's second tag is Wild.
    expect(briefingReadiness(save, briefing(['beasts', 1]))).toEqual({ kind: 'ready' });
  });

  it('needs gear when owned pieces nobody wears would cover the threats', () => {
    expect(briefingReadiness(saveWith('spear1', 'leather1'), briefing(['beasts', 2]))).toEqual({ kind: 'needsGear' });
    // Two families at once: the mail's Faith and the spear's Wild, on two heroes.
    expect(briefingReadiness(saveWith('mail1', 'spear1'), briefing(['holy', 1], ['beasts', 1]))).toEqual({ kind: 'needsGear' });
  });

  it('names the families nobody can bring', () => {
    expect(briefingReadiness(saveWith('spear1'), briefing(['holy', 1], ['beasts', 1]))).toEqual({ kind: 'missing', families: ['faith'] });
  });

  it('never gives one spare piece to two heroes', () => {
    expect(briefingReadiness(saveWith('spear1'), briefing(['beasts', 2]))).toEqual({ kind: 'missing', families: ['wild'] });
    expect(briefingReadiness(saveWith('spear1', 'spear1'), briefing(['beasts', 2]))).toEqual({ kind: 'needsGear' });
  });

  it('leaves out a busy hero', () => {
    const base = { ...saveWith('mail1'), heroes: [...createInitialSave().heroes, newHero('c', 'Cass', 'cleric', 'none')] };
    expect(briefingReadiness(base, briefing(['holy', 2]))).toEqual({ kind: 'needsGear' });
    const working: SaveData = { ...base, heroes: base.heroes.map((h) => (h.id === 'c' ? { ...h, job: { jobId: 'miner', since: 0, tired: false } } : h)) };
    expect(briefingReadiness(working, briefing(['holy', 2]))).toEqual({ kind: 'missing', families: ['faith'] });
  });

  it('counts one hero fewer in Narrow passages', () => {
    const save = saveWith('spear1', 'spear1', 'spear1');
    expect(briefingReadiness(save, briefing(['beasts', 3]))).toEqual({ kind: 'needsGear' });
    expect(briefingReadiness(save, { ...briefing(['beasts', 3]), restriction: 'narrowPassages' })).toEqual({ kind: 'missing', families: ['wild'] });
  });

  it('remembers the answer for the same save and briefing', () => {
    const save = saveWith('spear1');
    expect(briefingReadiness(save, briefing(['beasts', 1]))).toBe(briefingReadiness(save, briefing(['beasts', 1])));
  });
});
