import { itemById } from '@/content/lookup';

import { equip } from '../team/team';
import { createInitialSave, type SaveData } from '../save';
import type { Briefing, ConsumableDef, ThreatId } from '../types';
import { briefingCoverage, kitAnswers } from './coverage';

// The briefing as the UI shows it: each threat's state and who answers it,
// the opportunity and its cost, the restriction. Scoring itself lives in
// score.test.ts; here the party is the starting trio as veterans.

const ALL = ['bram', 'lyra', 'mira'];

const briefing = (
  threats: { id: ThreatId; level: 1 | 2 | 3; element?: Briefing['threats'][number]['element'] }[] = [],
  extra: Partial<Briefing> = {},
): Briefing => ({
  threats: threats.map((t) => ({ ...t, ...(t.element ? { element: t.element } : {}) })),
  restriction: null,
  opportunity: null,
  ...extra,
});

/** The starting trio as veterans with tier-5 weapons, no consumables. */
function save(): SaveData {
  let data: SaveData = {
    ...createInitialSave(),
    tutorial: { ...createInitialSave().tutorial, step: 'done' },
    consumables: { ...createInitialSave().consumables, trailMix: 30 },
    heroes: createInitialSave().heroes.map((h) => ({ ...h, level: 30 })),
    gear: [
      { uid: 'g1', itemId: 'sword5', quality: 'normal' },
      { uid: 'g2', itemId: 'bow5', quality: 'normal' },
    ],
  };
  data = equip(data, 'bram', 'weapon', 'g1');
  data = equip(data, 'lyra', 'weapon', 'g2');
  return data;
}

describe('briefingCoverage', () => {
  it('covers a threat and names who and what answers it', () => {
    // Bram's Might 3 clears level 1 rubble (needs 2).
    const { threats } = briefingCoverage(save(), ALL, briefing([{ id: 'rubble', level: 1 }]));
    expect(threats[0]).toMatchObject({ threat: { id: 'rubble', level: 1 }, state: 'met', display: 'covered', have: 3, needed: 2 });
    expect(threats[0].coveredBy).toEqual([{ heroId: 'bram', heroName: 'Bram', source: 'class', sourceName: 'Warrior' }]);
  });

  it('marks a threat one short as partial and a far miss as uncovered', () => {
    const data = save();
    // Faith 1 against level 1 desecrated ground (needs 2): half; against level 3 (needs 4): full.
    const { threats } = briefingCoverage(data, ALL, briefing([{ id: 'desecrated', level: 1 }, { id: 'desecrated', level: 3 }]));
    expect(threats[0]).toMatchObject({ state: 'half', display: 'partial', have: 1, needed: 2 });
    expect(threats[1]).toMatchObject({ state: 'full', display: 'uncovered', have: 1, needed: 4 });
    expect(threats[1].coveredBy).toEqual([
      { heroId: 'bram', heroName: 'Bram', source: 'class', sourceName: 'Warrior' },
    ]);
  });

  it('forwards the forced and intimidated flags', () => {
    // Finesse falls short of level 2 locked and locals, but Might 3 stands in for both.
    const { threats } = briefingCoverage(save(), ALL, briefing([{ id: 'locked', level: 2 }, { id: 'locals', level: 2 }]));
    expect(threats[0]).toMatchObject({ state: 'met', display: 'covered', forced: true, intimidated: false });
    expect(threats[1]).toMatchObject({ state: 'met', display: 'covered', forced: false, intimidated: true });
  });

  it('names a weapon behind a keyword answer', () => {
    // Lyra's Steel-banded bow carries pierce: level 1 armoured (needs 1) is met.
    const { threats } = briefingCoverage(save(), ALL, briefing([{ id: 'armoured', level: 1 }]));
    expect(threats[0]).toMatchObject({ state: 'met', display: 'covered' });
    expect(threats[0].coveredBy).toContainEqual({
      heroId: 'lyra',
      heroName: 'Lyra',
      source: 'gear',
      sourceName: 'Steel-banded bow',
    });
  });

  it('credits a kit that lifts a hero over the line', () => {
    let data = save();
    data = { ...data, consumables: { ...data.consumables, roguesRoll: 1 } };
    data = equip(data, 'bram', 'consumable', 'roguesRoll');
    // Finesse 1 + the kit's 2 meets level 2 traps (needs 3); without the roll it is a full miss.
    const { threats } = briefingCoverage(data, ALL, briefing([{ id: 'traps', level: 2 }]));
    expect(threats[0]).toMatchObject({ state: 'met', display: 'covered', have: 3, needed: 3 });
    expect(threats[0].coveredBy).toEqual([{ heroId: 'bram', heroName: 'Bram', source: 'kit', sourceName: 'Rogue’s roll' }]);
    expect(threats[0].kitHeroes).toEqual(['bram']);
  });

  it('shows the restriction and its definition', () => {
    const { restriction } = briefingCoverage(save(), ALL, briefing([], { restriction: 'thickFog' }));
    expect(restriction).toMatchObject({ id: 'thickFog', def: { name: 'Thick fog' } });
    expect(briefingCoverage(save(), ALL, briefing()).restriction).toBeNull();
  });

  it('answers an opportunity with who and what answers it, or not at all', () => {
    // Bram's Might 3 works the rich vein; nobody has Faith 3 for the shrine.
    const vein = briefingCoverage(save(), ALL, briefing([], { opportunity: 'richVein' }));
    expect(vein.opportunity).toMatchObject({ answered: true, cost: null, answers: [{ heroName: 'Bram', via: 'might' }] });
    const shrine = briefingCoverage(save(), ALL, briefing([], { opportunity: 'forgottenShrine' }));
    expect(shrine.opportunity).toMatchObject({ answered: false, cost: null, answers: [] });
    expect(briefingCoverage(save(), ALL, briefing()).opportunity).toBeNull();
  });

  it('only answers a costly opportunity when opted in', () => {
    const refugees = briefing([], { opportunity: 'refugees' });
    const plain = briefingCoverage(save(), ALL, refugees);
    expect(plain.opportunity).toMatchObject({ answered: false, cost: { supply: 3 }, answers: null });
    const optedIn = briefingCoverage(save(), ALL, refugees, 0, true);
    expect(optedIn.opportunity).toMatchObject({ answered: true, cost: { supply: 3 }, answers: null });
  });
});

describe('kitAnswers', () => {
  it('is true for a kit that covers one of the briefing threats', () => {
    expect(kitAnswers('roguesRoll', briefing([{ id: 'traps', level: 1 }]))).toBe(true);
    expect(kitAnswers('lantern', briefing([{ id: 'ambush', level: 1 }]))).toBe(true);
  });

  it('is false for a kit that covers none of them', () => {
    expect(kitAnswers('huntersPack', briefing([{ id: 'traps', level: 1 }]))).toBe(false);
  });

  it('is true for a kit that answers the opportunity', () => {
    // The Hunter's pack carries calm, the trophy beast's keyword answer.
    expect(kitAnswers('huntersPack', briefing([], { opportunity: 'trophyBeast' }))).toBe(true);
    expect(kitAnswers('giftBasket', briefing([], { opportunity: 'bounty' }))).toBe(true);
    expect(kitAnswers('roguesRoll', briefing([], { opportunity: 'bounty' }))).toBe(false);
  });

  it('is false for non-consumables and plain consumables', () => {
    expect(kitAnswers('sword5', briefing([{ id: 'traps', level: 1 }]))).toBe(false);
    expect(kitAnswers('healingPotion', briefing([{ id: 'traps', level: 1 }]))).toBe(false);
  });

  it('is true for a ward salve only against its element', () => {
    const salve = itemById.emberWardSalve as ConsumableDef;
    expect(salve.protectsAgainst).toBe('fire');
    expect(kitAnswers('emberWardSalve', briefing([{ id: 'element', level: 1, element: 'fire' }]))).toBe(true);
    expect(kitAnswers('emberWardSalve', briefing([{ id: 'element', level: 1, element: 'water' }]))).toBe(false);
    expect(kitAnswers('tideWardSalve', briefing([{ id: 'element', level: 1, element: 'water' }]))).toBe(true);
  });
});
