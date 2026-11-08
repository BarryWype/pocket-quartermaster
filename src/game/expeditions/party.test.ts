import { makeGearPiece } from '../gear/make';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import { briefingCoverage } from '../threats/coverage';
import type { Briefing, ThreatId } from '../types';
import { dressWith, dropSwaps, forgeChoices, gearChoices, heroChoices, heroStatus, hintTypes, partyBanners, prunedDraft, slotHints, socketGroups } from './party';

// The starting trio: Bram (warrior), Lyra (ranger), Mira (fire mage), with these pieces owned, none worn.
const saveWith = (...itemIds: string[]): SaveData => {
  const base = createInitialSave();
  return { ...base, gear: itemIds.map((itemId, i) => makeGearPiece(`g${i}`, itemId, 'common')) };
};
const briefing = (...threats: [ThreatId, 1 | 2 | 3][]): Briefing => ({
  threats: threats.map(([id, level]) => ({ id, level })),
  restriction: null,
  opportunity: null,
});
const groupsFor = (save: SaveData, ids: string[], b: Briefing) =>
  socketGroups(b.threats, ids.length > 0 ? briefingCoverage(save, ids, b).threats : null);

describe('socket groups', () => {
  it('are dashed, one socket per tag needed, while nobody is picked', () => {
    const groups = groupsFor(saveWith(), [], briefing(['beasts', 2], ['darkness', 1]));
    expect(groups.map((g) => [g.family, g.state, g.sockets])).toEqual([
      ['wild', 'empty', ['empty', 'empty']],
      ['watch', 'empty', ['empty']],
    ]);
  });

  it('light up when the party covers the threat', () => {
    // The spear (Wild + Watch) and leather (Wild) on Bram: 2 Wild, 1 Watch.
    const save = equip(equip(saveWith('spear1', 'leather1'), 'bram', 'weapon', 'g0'), 'bram', 'armor', 'g1');
    const groups = groupsFor(save, ['bram'], briefing(['beasts', 2], ['darkness', 1]));
    expect(groups.map((g) => [g.state, g.sockets])).toEqual([
      ['covered', ['lit', 'lit']],
      ['covered', ['lit']],
    ]);
  });

  it('go red for the tags short, with a hint naming helmets and armour first', () => {
    const save = equip(saveWith('leather1'), 'bram', 'armor', 'g0');
    const [beasts, darkness] = groupsFor(save, ['bram'], briefing(['beasts', 2], ['darkness', 1]));
    expect([beasts.state, beasts.sockets, beasts.short]).toEqual(['short', ['lit', 'missing'], 1]);
    expect([darkness.state, darkness.sockets]).toEqual(['short', ['missing']]);
    expect(darkness.hint).toEqual(['sallet', 'tome', 'runestone']);
  });
});

describe('hint types', () => {
  it('name the types whose own family it is, helmets and armour first, three at most', () => {
    expect(hintTypes('wild')).toEqual(['leather', 'spear']);
    expect(hintTypes('faith')).toEqual(['mail', 'mace', 'censer']);
  });
});

describe('party banners', () => {
  it('give a banner to each family with 2 tags or more, most first, and list the single ones', () => {
    expect(partyBanners({ bulwark: 2, wild: 3, faith: 1, breaker: 1 })).toEqual({
      banners: [
        { family: 'wild', count: 3, level: 1 },
        { family: 'bulwark', count: 2, level: 1 },
      ],
      singles: ['faith', 'breaker'],
    });
  });
});

describe('gear choices', () => {
  it('put pieces lighting a short family first, then those raising a family, unfit ones last', () => {
    // Mira with a wand (Spellweave, Warding) and a focus (Warding); spare: a tome (Watch), a buckler (Shadow).
    const save = equip(equip(saveWith('wand1', 'focus1', 'tome1', 'buckler1'), 'mira', 'weapon', 'g0'), 'mira', 'offhand', 'g1');
    const choices = gearChoices(save, ['mira'], 'mira', 'offhand', ['watch']);
    expect(choices.map((c) => c.gear.uid)).toEqual(['g2', 'g1', 'g3']);
    expect(choices[0].lights).toEqual(['watch']);
    expect(choices[1].worn).toBe(true);
  });

  it('marks the piece another hero wears and takes it from them when equipped', () => {
    const save = equip(saveWith('leather1'), 'lyra', 'armor', 'g0');
    const choice = gearChoices(save, ['bram', 'lyra'], 'bram', 'armor', ['wild'])[0];
    expect(choice.holder?.id).toBe('lyra');
    const after = choice.after!;
    expect(after.heroes.find((h) => h.id === 'bram')!.equipment.armor).toBe('g0');
    expect(after.heroes.find((h) => h.id === 'lyra')!.equipment.armor).toBeNull();
    // Moving it inside the party lights nothing new.
    expect(choice.lights).toEqual([]);
  });

  it('lists a type the class cannot use last', () => {
    // A warrior can't use robes.
    const choices = gearChoices(saveWith('robes1', 'leather1'), ['bram'], 'bram', 'armor', []);
    expect(choices.map((c) => [c.gear.uid, c.unfit])).toEqual([
      ['g1', false],
      ['g0', true],
    ]);
  });

  it('makes a slot glow when an owned piece would light a short family', () => {
    const save = equip(saveWith('wand1', 'tome1'), 'mira', 'weapon', 'g0');
    expect([...slotHints(save, ['mira'], ['watch'])]).toEqual(['mira:offhand']);
    expect([...slotHints(save, ['mira'], [])]).toEqual([]);
  });
});

describe('forge choices', () => {
  it('list the known blueprints for the slot, a piece lighting a short family first, then by family and tier', () => {
    const save = saveWith();
    const choices = forgeChoices(save, ['bram'], 'bram', 'helmet', ['watch']);
    expect(choices.map((c) => c.recipeId)).toEqual(['sallet1', 'greatHelm1', 'hood1', 'plagueMask1', 'runeCirclet1']);
    expect(choices[0].lights).toEqual(['watch']);
    expect(choices.every((c) => c.item.slot === 'helmet')).toBe(true);
  });

  it('give each material held against needed, and say whether the forge can make it now', () => {
    const save = saveWith();
    const [poor] = forgeChoices(save, ['bram'], 'bram', 'helmet', ['watch']);
    expect(poor.craftable).toBe(false);
    const materials = Object.fromEntries(poor.cost.materials.map((m) => [m.id, m.needed]));
    const [rich] = forgeChoices({ ...save, materials }, ['bram'], 'bram', 'helmet', ['watch']);
    expect(rich.craftable).toBe(true);
    expect(rich.cost.materials.every((m) => m.held === m.needed)).toBe(true);
  });

  it('leave out the other slots and anything the forge cannot make', () => {
    const choices = forgeChoices(saveWith(), ['mira'], 'mira', 'offhand', []);
    expect(choices.map((c) => c.recipeId)).toEqual(['focus1']);
  });
});

describe('hero choices', () => {
  it('lists free heroes first, those lighting a short family first', () => {
    const save = equip(saveWith('leather1'), 'mira', 'armor', 'g0');
    expect(heroChoices(save, ['bram'], ['wild'], 0).map((c) => [c.hero.id, c.lights])).toEqual([
      ['mira', ['wild']],
      ['lyra', []],
    ]);
  });

  it('greys a hurt or away hero with how long', () => {
    const base = saveWith();
    const hurt: SaveData = { ...base, heroes: base.heroes.map((h) => (h.id === 'lyra' ? { ...h, exhaustedUntil: 7_200_000 } : h)) };
    expect(heroStatus(hurt, hurt.heroes.find((h) => h.id === 'lyra')!, 0)).toEqual({ kind: 'hurt', ms: 7_200_000 });
    const out: SaveData = {
      ...base,
      expeditions: [{ id: 'e', dungeonId: 'ratCellar', heroIds: ['mira'], startedAt: 0, endsAt: 2_400_000 } as SaveData['expeditions'][number]],
    };
    expect(heroStatus(out, out.heroes.find((h) => h.id === 'mira')!, 0)).toEqual({ kind: 'out', ms: 2_400_000 });
    expect(heroChoices(out, [], [], 0).map((c) => c.hero.id).at(-1)).toBe('mira');
  });
});

describe('suggested swaps', () => {
  it('dress the save without touching the player’s, and skip a piece that is gone', () => {
    const save = saveWith('leather1');
    const dressed = dressWith(save, [
      { heroId: 'bram', slot: 'armor', gearUid: 'g0' },
      { heroId: 'lyra', slot: 'weapon', gearUid: 'gone' },
    ]);
    expect(dressed.heroes.find((h) => h.id === 'bram')!.equipment.armor).toBe('g0');
    expect(save.heroes.find((h) => h.id === 'bram')!.equipment.armor).toBeNull();
  });

  it('drop the slot equipped by hand and any swap moving the same piece', () => {
    const swaps = [
      { heroId: 'bram', slot: 'armor' as const, gearUid: 'g0' },
      { heroId: 'lyra', slot: 'armor' as const, gearUid: 'g1' },
      { heroId: 'mira', slot: 'helmet' as const, gearUid: 'g2' },
    ];
    expect(dropSwaps(swaps, 'bram', 'armor', 'g1')).toEqual([swaps[2]]);
  });
});

describe('party drafts', () => {
  it('keep the heroes who can still join, and drop a hurt or dismissed one with their swaps', () => {
    const base = saveWith('leather1');
    const draft = {
      heroIds: ['bram', 'lyra', 'mira'],
      swaps: [
        { heroId: 'lyra', slot: 'armor' as const, gearUid: 'g0' },
        { heroId: 'bram', slot: 'helmet' as const, gearUid: null },
      ],
    };
    expect(prunedDraft(base, draft, 0)).toBe(draft);
    const save: SaveData = {
      ...base,
      heroes: base.heroes.filter((h) => h.id !== 'mira').map((h) => (h.id === 'lyra' ? { ...h, exhaustedUntil: 60_000 } : h)),
    };
    expect(prunedDraft(save, draft, 0)).toEqual({ heroIds: ['bram'], swaps: [draft.swaps[1]] });
  });
});
