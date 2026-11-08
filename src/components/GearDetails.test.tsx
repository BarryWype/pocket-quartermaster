import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AffixLines } from './AffixLines';
import { affinityLine, compareStats, GearCard, GearDetails } from './GearDetails';
import { IconLabel } from './IconLabel';

import { affinityRules } from '@/content/equipment';
import { makeGearPiece } from '@/game/gear/make';
import { gearStats } from '@/game/gear/stats';
import { createInitialSave, type SaveData } from '@/game/save';
import { equip } from '@/game/team/team';
import type { GearInstance } from '@/game/types';

const piece = (over: Partial<GearInstance>): GearInstance =>
  ({ uid: 'g1', itemId: 'sword1', rarity: 'rare', roll: 12, affixes: [], rerolls: 0, ...over }) as GearInstance;

const labelsOf = (tree: ReactTestRenderer) => tree.root.findAllByType(IconLabel).map((node) => String(node.props.label));

const render = (gear: GearInstance) => {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<GearDetails gear={gear} compact />);
  });
  return tree;
};

describe('GearDetails', () => {
  it('shows a weapon’s own stats and each of its affixes', () => {
    const tree = render(piece({ affixes: [{ id: 'hunter', value: 22 }] }));
    const labels = labelsOf(tree);
    // The rolled power, as a stat part.
    expect(labels.some((label) => /^\d+$/.test(label.trim()))).toBe(true);
    expect(labels).toContain('Hunter: +22% damage to beasts');
    expect(tree.root.findAllByType(AffixLines)).toHaveLength(1);
  });

  it('shows a work tool’s job line', () => {
    const tree = render(piece({ itemId: 'hatchet1', rarity: 'common' }));
    const texts = tree.root.findAll((node) => typeof node.props.children === 'string').map((node) => node.props.children as string);
    expect([...labelsOf(tree), ...texts].join(' ').toLowerCase()).toMatch(/wood/);
  });
});

describe('the comparison card', () => {
  // Bram, a warrior, wears a weak sword; a stronger sword and a wand (unfit for him) lie in the stock.
  const weak = makeGearPiece('weak', 'sword1', 'common', undefined, { roll: 4 });
  const strong = makeGearPiece('strong', 'sword1', 'common', undefined, { roll: 18 });
  const wand = makeGearPiece('wand', 'wand1', 'common', undefined, { roll: 18 });
  const save: SaveData = equip({ ...createInitialSave(), gear: [weak, strong, wand] }, 'bram', 'weapon', 'weak');
  const row = (gear: GearInstance, key: string) => compareStats(save, 'bram', 'weapon', gear)!.find((r) => r.key === key)!;

  it('gives each stat as it counts for the hero, after the affinity multiplier', () => {
    expect(Math.abs(row(strong, 'power').value - gearStats(strong).power! * affinityRules.favoured)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(row(wand, 'magic').value - gearStats(wand).magic! * affinityRules.unfit)).toBeLessThanOrEqual(0.5);
  });

  it('gives the difference to the worn piece, nothing for the worn piece itself', () => {
    const worn = row(weak, 'power');
    expect(worn.diff).toBe(0);
    const better = row(strong, 'power');
    expect(better.diff).toBe(better.value - worn.value);
    expect(better.diff).toBeGreaterThan(0);
    expect(row(wand, 'power').diff).toBe(-worn.value);
  });

  it('names the hero’s affinity and what it does to the stats', () => {
    expect(affinityLine(save, 'bram', strong)).toEqual({ tone: 'good', text: 'Favoured by Bram · stats ×1.2' });
    expect(affinityLine(save, 'bram', wand)).toEqual({ tone: 'bad', text: 'Unfit for Bram · stats ×0.6' });
  });

  it('shows the rarity, the family tags, and each stat with ▲ or ▼', () => {
    let tree!: ReactTestRenderer;
    act(() => {
      tree = create(<GearCard gear={strong} compare={{ save, heroId: 'bram', slot: 'weapon' }} />);
    });
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('Common');
    expect(json).toContain(`▲ +${row(strong, 'power').diff}`);
    expect(json).toContain('Favoured by Bram');
  });
});
