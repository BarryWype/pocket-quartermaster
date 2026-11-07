import { newHero } from '@/content/heroes';

import { equip } from '../team/team';
import { createInitialSave, type SaveData } from '../save';
import type { Briefing, ThreatId } from '../types';
import { briefingCoverage } from './coverage';

// The briefing as the UI shows it: each threat's state and who answers it,
// the opportunity and its cost, the restriction. Scoring itself lives in
// score.test.ts; here the party is a warrior with a mace and three clerics.

const ALL = ['bram', 'c1', 'c2', 'c3'];

const briefing = (
  threats: { id: ThreatId; level: 1 | 2 | 3 }[] = [],
  extra: Partial<Briefing> = {},
): Briefing => ({ threats, restriction: null, opportunity: null, ...extra });

/** A warrior with a Steel mace (Faith gear) and three clerics, no consumables. */
function save(): SaveData {
  let data: SaveData = {
    ...createInitialSave(),
    tutorial: { ...createInitialSave().tutorial, step: 'done' },
    heroes: [
      newHero('bram', 'Bram', 'warrior', 'resilient'),
      newHero('c1', 'Cass', 'cleric', 'none'),
      newHero('c2', 'Cora', 'cleric', 'none'),
      newHero('c3', 'Clem', 'cleric', 'none'),
    ],
    gear: [{ uid: 'g1', itemId: 'mace5', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 }],
  };
  data = equip(data, 'bram', 'weapon', 'g1');
  return data;
}

describe('briefingCoverage', () => {
  it('covers a threat and names who and what answers it', () => {
    // The mace's Faith tag and the three clerics' reach level 2 (4 tags), well past level 1.
    const { threats } = briefingCoverage(save(), ALL, briefing([{ id: 'holy', level: 1 }]));
    expect(threats[0]).toMatchObject({ threat: { id: 'holy', level: 1 }, state: 'met', display: 'covered', have: 2, needed: 1 });
    expect(threats[0].coveredBy).toEqual([
      { heroId: 'bram', heroName: 'Bram', source: 'gear', sourceName: 'Steel mace' },
      { heroId: 'c1', heroName: 'Cass', source: 'class', sourceName: 'Cleric' },
      { heroId: 'c2', heroName: 'Cora', source: 'class', sourceName: 'Cleric' },
      { heroId: 'c3', heroName: 'Clem', source: 'class', sourceName: 'Cleric' },
    ]);
  });

  it('marks a threat one short as partial and a far miss as uncovered', () => {
    const data = save();
    // One cleric's Faith tag falls short of level 1 Holy (2 tags): half; level 3 (6 tags): full.
    const { threats } = briefingCoverage(data, ['c1'], briefing([{ id: 'holy', level: 1 }, { id: 'holy', level: 3 }]));
    expect(threats[0]).toMatchObject({ state: 'half', display: 'partial', have: 0, needed: 1 });
    expect(threats[1]).toMatchObject({ state: 'full', display: 'uncovered', have: 0, needed: 3 });
    expect(threats[1].coveredBy).toEqual([{ heroId: 'c1', heroName: 'Cass', source: 'class', sourceName: 'Cleric' }]);
  });

  it('shows the restriction and its definition', () => {
    const { restriction } = briefingCoverage(save(), ALL, briefing([], { restriction: 'thickFog' }));
    expect(restriction).toMatchObject({ id: 'thickFog', def: { name: 'Thick fog' } });
    expect(briefingCoverage(save(), ALL, briefing()).restriction).toBeNull();
  });

  it('answers an opportunity with who and which family answers it, or not at all', () => {
    // Four Faith tags reach level 2: the shrine is answered; nobody breaks the vein.
    const shrine = briefingCoverage(save(), ALL, briefing([], { opportunity: 'forgottenShrine' }));
    expect(shrine.opportunity).toMatchObject({ answered: true, cost: null });
    expect(shrine.opportunity!.answers).toEqual([
      { heroName: 'Bram', via: 'Faith' },
      { heroName: 'Cass', via: 'Faith' },
      { heroName: 'Cora', via: 'Faith' },
      { heroName: 'Clem', via: 'Faith' },
    ]);
    const vein = briefingCoverage(save(), ALL, briefing([], { opportunity: 'richVein' }));
    expect(vein.opportunity).toMatchObject({ answered: false, cost: null, answers: [] });
    expect(briefingCoverage(save(), ALL, briefing()).opportunity).toBeNull();
  });

  it('only answers a costly opportunity when opted in', () => {
    const refugees = briefing([], { opportunity: 'refugees' });
    const plain = briefingCoverage(save(), ALL, refugees);
    expect(plain.opportunity).toMatchObject({ answered: false, cost: { supply: 3 }, answers: [] });
    const optedIn = briefingCoverage(save(), ALL, refugees, 0, true);
    expect(optedIn.opportunity).toMatchObject({ answered: true, cost: { supply: 3 }, answers: [] });
  });
});
