import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import type { GearInstance } from '../types';
import { killEpithetId, noteRunOnGear, type RunOnGear, type RunPart } from './history';

const piece = (uid: string, itemId: string, extra: Partial<GearInstance> = {}): GearInstance => ({ uid, itemId, rarity: 'common', roll: 8, affixes: [], rerolls: 0, ...extra });

/** Bram wears a sword and mail; Lyra a bow. */
function worn(sword: Partial<GearInstance> = {}, mail: Partial<GearInstance> = {}): SaveData {
  let save: SaveData = { ...createInitialSave(), gear: [piece('sword', 'sword1', sword), piece('mail', 'mail1', mail), piece('bow', 'bow1')] };
  save = equip(save, 'bram', 'weapon', 'sword');
  save = equip(save, 'bram', 'armor', 'mail');
  return equip(save, 'lyra', 'weapon', 'bow');
}
const part = (heroId: string, extra: Partial<RunPart> = {}): RunPart => ({ heroId, kills: 0, bossKill: false, ...extra });
const run = (party: RunPart[], extra: Partial<RunOnGear> = {}): RunOnGear => ({ party, bossBeaten: null, tierBoss: false, now: 1000, ...extra });
const gear = (save: SaveData, uid: string) => save.gear.find((g) => g.uid === uid)!;

describe('gear history', () => {
  it('counts the run and the boss on every worn piece, and the kills on the weapon', () => {
    const { save } = noteRunOnGear(worn(), run([part('bram', { kills: 4, killTags: { beast: 3, goblinoid: 1 } })], { bossBeaten: 'goblinChief' }));
    expect(gear(save, 'sword').history).toEqual({ runs: 1, kills: 4, killTags: { beast: 3, goblinoid: 1 }, bosses: ['goblinChief'] });
    expect(gear(save, 'mail').history).toEqual({ runs: 1, kills: 0, killTags: {}, bosses: ['goblinChief'] });
    // Lyra wasn't in the party.
    expect(gear(save, 'bow').history).toBeUndefined();
    const again = noteRunOnGear(save, run([part('bram')], { bossBeaten: 'goblinChief' })).save;
    expect(gear(again, 'sword').history!.bosses).toEqual(['goblinChief']);
  });

  it('names the weapon that lands a tier boss’s killing blow, after its carrier', () => {
    const { save, named } = noteRunOnGear(worn(), run([part('bram', { kills: 1, bossKill: true })], { bossBeaten: 'millOgre', tierBoss: true }));
    expect(gear(save, 'sword').earnedName).toEqual({ epithet: 'boss:millOgre', step: 0, hero: 'Bram', at: 1000 });
    expect(named).toEqual([{ uid: 'sword', itemId: 'sword1', name: gear(save, 'sword').earnedName, grew: false }]);
    // A chain boss's killing blow names nothing.
    expect(noteRunOnGear(worn(), run([part('bram', { bossKill: true })], { bossBeaten: 'goblinChief' })).named).toEqual([]);
  });

  it('names a weapon at its first kill milestone after the enemies it killed most, and grows the name at the next ones', () => {
    const near = worn({ history: { runs: 10, kills: 48, killTags: { undead: 20, beast: 28 }, bosses: [] } });
    const first = noteRunOnGear(near, run([part('bram', { kills: 2, killTags: { undead: 2 } })]));
    expect(gear(first.save, 'sword').earnedName).toMatchObject({ epithet: 'tag:beast', step: 0 });
    const grown = noteRunOnGear(
      { ...first.save, gear: first.save.gear.map((g) => (g.uid === 'sword' ? { ...g, history: { ...g.history!, kills: 199 } } : g)) },
      run([part('bram', { kills: 1, killTags: { undead: 1 } })]),
    );
    expect(grown.named).toEqual([expect.objectContaining({ uid: 'sword', grew: true, name: expect.objectContaining({ epithet: 'tag:beast', step: 1, hero: 'Bram' }) })]);
    // Later milestones grow it; it is never renamed.
    const renamed = noteRunOnGear(grown.save, run([part('bram', { kills: 400 })]));
    expect(gear(renamed.save, 'sword').earnedName).toMatchObject({ epithet: 'tag:beast', step: 2, hero: 'Bram' });
  });

  it('names a piece at many runs when nothing named it first', () => {
    const { save, named } = noteRunOnGear(worn({}, { history: { runs: 99, kills: 0, killTags: {}, bosses: [] } }), run([part('bram')]));
    expect(gear(save, 'mail').earnedName).toMatchObject({ epithet: 'runs', step: 0 });
    expect(named.map((n) => n.uid)).toEqual(['mail']);
  });

  it('picks the most-killed tag, the table’s order breaking ties, a plain epithet without one', () => {
    expect(killEpithetId({ undead: 5, beast: 5 })).toBe('tag:beast');
    expect(killEpithetId({ fire: 9 })).toBe('kills');
  });
});
