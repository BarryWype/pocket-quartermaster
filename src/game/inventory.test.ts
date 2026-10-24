import { addMaterials, hasMaterials, removeMaterials } from './inventory';

describe('inventory', () => {
  it('adds stacks to existing counts', () => {
    expect(addMaterials({ ironOre: 1 }, [{ materialId: 'ironOre', amount: 2 }, { materialId: 'hide', amount: 1 }])).toEqual({
      ironOre: 3,
      hide: 1,
    });
  });

  it('checks whether all stacks are available', () => {
    expect(hasMaterials({ ironOre: 3 }, [{ materialId: 'ironOre', amount: 3 }])).toBe(true);
    expect(hasMaterials({ ironOre: 2 }, [{ materialId: 'ironOre', amount: 3 }])).toBe(false);
    expect(hasMaterials({}, [{ materialId: 'hide', amount: 1 }])).toBe(false);
  });

  it('removes stacks and drops empty entries', () => {
    expect(removeMaterials({ ironOre: 3, hide: 1 }, [{ materialId: 'ironOre', amount: 3 }])).toEqual({ hide: 1 });
  });

  it('refuses to remove more than available', () => {
    expect(() => removeMaterials({ ironOre: 1 }, [{ materialId: 'ironOre', amount: 2 }])).toThrow();
  });
});
