import { gearId, gearProfiles, gearRecipes } from '@/content/equipment';
import { lootConfig } from '@/content/loot/config';
import type { ActiveExpedition, Briefing, GearType } from '@/game/types';

import { createRng } from '../generation/rng';
import { createInitialSave, type SaveData } from '../save';
import { affinityOf } from '../team/team';
import { lootContextOf } from './context';
import { rollLootGear } from './gear';
import type { LootRequest } from './roll';
import { usefulGearTypes } from './useful';

const traps: Briefing = { threats: [{ id: 'traps', level: 2 }], restriction: null, opportunity: null };
const none: Briefing = { threats: [], restriction: null, opportunity: null };
const carries = (type: GearType, family: string) => gearProfiles[type].familyTag === family || gearProfiles[type].secondFamily === family;
const types = Object.keys(gearProfiles) as GearType[];

/** The starting save with these pieces held (tier 3 by default). */
function holding(pieces: { type: GearType; tier?: number; uid?: string }[], save: SaveData = createInitialSave()): SaveData {
  const gear = pieces.map(({ type, tier = 3, uid = `${type}${tier}` }) => ({ ...save.gear[0], uid, itemId: gearId(type, tier), relicId: undefined }));
  return { ...save, gear: [...save.gear, ...gear] };
}

describe('usefulGearTypes', () => {
  it("leans towards the types carrying a briefing's threat family that a free hero could wear and nobody holds", () => {
    const save = createInitialSave();
    const useful = usefulGearTypes(save, [traps], 3);
    const expected = types.filter((type) => carries(type, 'cunning') && save.heroes.some((h) => affinityOf(h.classId, type) !== 'unfit'));
    expect(expected.length).toBeGreaterThan(0);
    expect(useful.sort()).toEqual(expected.sort());
  });

  it('drops a type once a piece of it of the tier or one below is held, but not an older one', () => {
    const [first] = usefulGearTypes(createInitialSave(), [traps], 3);
    expect(usefulGearTypes(holding([{ type: first, tier: 2 }]), [traps], 3)).not.toContain(first);
    expect(usefulGearTypes(holding([{ type: first, tier: 1 }]), [traps], 3)).toContain(first);
  });

  it('still counts a type whose only piece is away on a run', () => {
    const [first] = usefulGearTypes(createInitialSave(), [traps], 3);
    const held = holding([{ type: first, uid: 'away' }]);
    const hero = held.heroes[0];
    const busy: SaveData = {
      ...held,
      heroes: held.heroes.map((h) => (h.id === hero.id ? { ...h, equipment: { ...h.equipment, [gearProfiles[first].slot]: 'away' } } : h)),
      expeditions: [{ id: 'e', dungeonId: 'ratCellar', heroIds: [hero.id], startedAt: 0, endsAt: 1, seed: 's' } as ActiveExpedition],
    };
    expect(usefulGearTypes(busy, [traps], 3)).toContain(first);
  });

  it('otherwise leans towards the types the roster owns none of', () => {
    const save = createInitialSave();
    const owned = new Set(save.gear.map((g) => g.itemId.replace(/\d+$/, '')));
    const useful = usefulGearTypes(save, [none], 3);
    expect(useful.length).toBeGreaterThan(0);
    for (const type of useful) expect(owned.has(type)).toBe(false);
    for (const type of useful) expect(save.heroes.some((h) => affinityOf(h.classId, type) !== 'unfit')).toBe(true);
  });
});

describe('the loot context', () => {
  it("reads the useful types from the briefings open at the player's tier when given the time", () => {
    const save = createInitialSave();
    expect(lootContextOf(save).usefulTypes).toBeUndefined();
    expect(lootContextOf(save, Date.UTC(2026, 10, 9)).usefulTypes?.length).toBeGreaterThan(0);
  });
});

describe('a looted piece with useful types', () => {
  const request = (seed: string, usefulTypes?: GearType[]): LootRequest => ({
    source: 'dungeonRun',
    tier: 3,
    enemies: [],
    base: { gold: 0, xp: 0 },
    context: { playerTier: 3, pickaxeTier: 3, knownRecipes: [], favourCounts: {}, ...(usefulTypes ? { usefulTypes } : {}) },
    rng: createRng(seed),
    luck: 0,
    modifiers: [],
  });
  const share = (usefulTypes?: GearType[]) =>
    Array.from({ length: 6000 }, (_, i) => rollLootGear(request(`p${i}`, usefulTypes))).filter((piece) => piece.itemId === 'dagger3').length / 6000;
  const forged = (Object.keys(gearRecipes) as GearType[]).filter((type) => gearRecipes[type][2].length > 0).length;

  it('picks one of them about 30% of the time on top of its random share', () => {
    const expected = lootConfig.usefulDrops.share + (1 - lootConfig.usefulDrops.share) / forged;
    expect(share(['dagger'])).toBeCloseTo(expected, 1);
    expect(share()).toBeCloseTo(1 / forged, 1);
  });

  it('is seeded: the same request gives the same piece', () => {
    expect(rollLootGear(request('same', ['dagger', 'bow']))).toEqual(rollLootGear(request('same', ['dagger', 'bow'])));
  });
});
