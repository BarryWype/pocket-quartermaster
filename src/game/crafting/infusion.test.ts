import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import { applyStone, canApplyStone, stonePreview } from './infusion';
import type { GearInstance } from '../types';

const piece = (uid: string, itemId: string, extra: Partial<GearInstance> = {}): GearInstance => ({
  uid,
  itemId,
  rarity: 'common',
  roll: 8,
  affixes: [],
  rerolls: 0,
  ...extra,
});

const withGear = (materials: Record<string, number> = { fireStone: 1 }, gear: GearInstance[] = []): SaveData =>
  equip(
    {
      ...createInitialSave(),
      materials,
      gear: [piece('g1', 'sword1'), piece('g2', 'mail5'), ...gear],
    },
    'bram',
    'weapon',
    'g1',
  );

const rare = () => ({ rarity: 'rare' as const, affixes: [{ id: 'hunter', value: 20 }, { id: 'veteran', value: 15 }] });

describe('applyStone', () => {
  it('makes a Common piece Uncommon with the stone affix of its slot, at any tier', () => {
    const sword = applyStone(withGear(), 'g1', 'fire');
    expect(sword.gear[0].rarity).toBe('uncommon');
    expect(sword.gear[0].affixes).toEqual([{ id: 'infusedFire', value: 0 }]);
    expect(sword.materials).toEqual({});
    const mail = applyStone(withGear({ waterStone: 1 }), 'g2', 'water').gear[1];
    expect(mail.affixes.map((affix) => affix.id)).toEqual(['wardingWater']);
    expect(mail.affixes[0].value).toBeGreaterThanOrEqual(15);
  });

  it('needs a stone of that element', () => {
    expect(canApplyStone(withGear({}), 'g1', 'fire')).toBe(false);
    expect(canApplyStone(withGear({ fireShard: 9 }), 'g1', 'fire')).toBe(false);
    expect(() => applyStone(withGear({}), 'g1', 'fire')).toThrow();
  });

  it('replaces one affix of a piece that has some, keeping its rarity', () => {
    const after = applyStone(withGear({ waterStone: 1 }, [piece('g3', 'sword1', rare())]), 'g3', 'water').gear[2];
    expect(after.rarity).toBe('rare');
    expect(after.affixes).toHaveLength(2);
    expect(after.affixes.map((affix) => affix.id)).toContain('infusedWater');
  });

  it('waits while the piece is away on an expedition', () => {
    const away: SaveData = {
      ...withGear(),
      expeditions: [{ id: 'x', dungeonId: 'ratCellar', heroIds: ['bram'], startedAt: 0, endsAt: 1, seed: 's', notificationId: null }],
    };
    expect(canApplyStone(away, 'g1', 'fire')).toBe(false);
  });
});

describe('stonePreview', () => {
  it('adds to a Common piece', () => {
    expect(stonePreview(withGear(), 'g1', 'fire')).toEqual({ kind: 'add' });
  });

  it('lists the candidates of a piece that already has affixes', () => {
    expect(stonePreview(withGear({ waterStone: 1 }, [piece('g3', 'sword1', rare())]), 'g3', 'water')).toEqual({
      kind: 'replace',
      candidates: ['hunter', 'veteran'],
    });
  });

  it('replaces one of the previewed candidates', () => {
    const save = withGear({ waterStone: 1 }, [piece('g3', 'sword1', rare())]);
    const preview = stonePreview(save, 'g3', 'water');
    const after = applyStone(save, 'g3', 'water').gear[2];
    expect(preview?.kind).toBe('replace');
    if (preview?.kind === 'replace') {
      const kept = after.affixes.filter((affix) => affix.id !== 'infusedWater').map((affix) => affix.id);
      expect(kept).toHaveLength(1);
      expect(preview.candidates).toEqual(expect.arrayContaining(kept));
    }
  });

  it('refuses trinkets', () => {
    const save: SaveData = { ...createInitialSave(), materials: { fireStone: 1 }, gear: [piece('g9', 'hawkEyeRing1')] };
    expect(stonePreview(save, 'g9', 'fire')).toBeNull();
    expect(canApplyStone(save, 'g9', 'fire')).toBe(false);
  });
});
