import { newHero } from '@/content/heroes';
import { dungeonById } from '@/content/lookup';

import { createInitialSave } from '../save';
import { familyLevels, partyFamilies, type HeroFamilyTag } from '../families/families';
import { activeHooks, type FamilyEffect } from './familyEffects';
import { member } from './familyTestHelpers';
import { prepareParty, prepareSimulation } from './simulate';

const tag = (family: HeroFamilyTag['family'], count: number): HeroFamilyTag => ({ family, count, source: 'gear' });

describe('family levels in a run', () => {
  test('levels are cumulative: a level runs its own hooks and the ones below', () => {
    const effect = (level: 1 | 2 | 3): FamilyEffect => ({ family: 'bulwark', level, hooks: { fightStart: () => level } });
    const effects = [effect(1), effect(2), effect(3)];
    expect(activeHooks({}, effects).fightStart).toHaveLength(0);
    expect(activeHooks({ bulwark: 2 }, effects).fightStart).toEqual([effects[0].hooks.fightStart, effects[1].hooks.fightStart]);
    expect(activeHooks({ bulwark: 3 }, effects).fightStart).toHaveLength(3);
  });

  test('the run counts the party’s tags across heroes, as the threats see them', () => {
    const party = [member('a', { familyTags: [tag('warding', 3), tag('rally', 2)] }), member('b', { familyTags: [tag('warding', 1)] })];
    expect(prepareSimulation(party, dungeonById.ratCellar).families).toEqual({ warding: 2, rally: 1 });
    // No restriction drops a tag: an anti-magic zone leaves the levels as they are.
    const briefing = { threats: [], restriction: 'antiMagic' as const, opportunity: null };
    expect(prepareSimulation(party, dungeonById.ratCellar, { briefing }).families).toEqual({ warding: 2, rally: 1 });
  });

  test('every fight source plays the levels partyFamilies counts for the party it prepares', () => {
    // Expeditions, overnight runs, patrols, the escort, place fights, Sanctums and the odds all
    // fight a party from prepareParty, whose tags prepareSimulation counts.
    const heroes = ['h1', 'h2'].map((id) => newHero(id, id, 'ranger', 'resilient'));
    const save = { ...createInitialSave(), heroes };
    const ids = heroes.map((h) => h.id);
    const expected = familyLevels(partyFamilies(save, ids));
    expect(Object.keys(expected).length).toBeGreaterThan(0);
    expect(prepareSimulation(prepareParty(save, ids), dungeonById.ratCellar).families).toEqual(expected);
    expect(prepareSimulation(prepareParty(save, ids, 0, true), dungeonById.ratCellar).families).toEqual(expected);
  });
});
