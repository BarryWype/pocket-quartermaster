import { readFileSync } from 'fs';
import { join } from 'path';

import { gearProfiles, GEAR_SLOTS, gearId } from '@/content/equipment';
import { itemById } from '@/content/lookup';

import { gearItemStats } from './budget';
import type { GearDef } from '../types';

/** Type names in the tiers CSV, keyed by the CSV's `Slot,Type` pair. */
const CSV_TYPES: Record<string, string> = {
  Sword: 'sword',
  Axe: 'axe',
  Mace: 'mace',
  Dagger: 'dagger',
  Bow: 'bow',
  Spear: 'spear',
  Warhammer: 'warhammer',
  Wand: 'wand',
  Staff: 'staff',
  Lute: 'lute',
  Censer: 'censer',
  Knuckles: 'knuckles',
  Plate: 'plate',
  Mail: 'mail',
  Leather: 'leather',
  Robes: 'robes',
  Shield: 'shield',
  Buckler: 'buckler',
  'Off-hand blade': 'offhandBlade',
  Quiver: 'quiver',
  Tome: 'tome',
  Focus: 'focus',
};

const STAT_COLUMNS: [string, keyof GearDef['stats']][] = [
  ['Power', 'power'],
  ['Magic', 'magic'],
  ['Armour', 'armour'],
  ['Resistance', 'resistance'],
  ['HP', 'hp'],
  ['Speed', 'speed'],
  ['Crit %', 'crit'],
  ['Evasion %', 'evasion'],
];

type Row = { type: string; tier: number; stats: Partial<Record<keyof GearDef['stats'], number>> };

/** Rounds like the CSV generator: Python's half-to-even `round()`. */
function csvRound(x: number) {
  const floor = Math.floor(x);
  const diff = x - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

function parseTiersCsv(): Row[] {
  const path = join(process.cwd(), 'doc/design/threats/equipment-tiers.csv');
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
  const header = lines[0].split(',');
  const typeIndex = header.indexOf('Type');
  const tierIndex = header.indexOf('Tier');
  const statIndexes = STAT_COLUMNS.map(([column]) => header.indexOf(column));
  return lines.slice(1).map((line) => {
    const cells = line.match(/("([^"]|")*")|[^,]+/g)!.map((cell) => cell.replace(/^"|"$/g, '').replace(/""/g, '"'));
    const stats: Partial<Record<keyof GearDef['stats'], number>> = {};
    STAT_COLUMNS.forEach(([, stat], i) => {
      const value = Number(cells[statIndexes[i]]);
      if (value) stats[stat] = value;
    });
    return { type: CSV_TYPES[cells[typeIndex]], tier: Number(cells[tierIndex]), stats };
  });
}

describe('gearItemStats', () => {
  const rows = parseTiersCsv();

  test('matches every row of equipment-tiers.csv', () => {
    expect(rows).toHaveLength(110);
    for (const { type, tier, stats } of rows) {
      const item = itemById[gearId(type as keyof typeof gearProfiles, tier)] as GearDef;
      expect(item).toBeDefined();
      expect(item.gearType).toBe(type);
      const expected = gearItemStats(gearProfiles[type as keyof typeof gearProfiles], tier);
      for (const [stat, value] of Object.entries(stats)) {
        expect(csvRound(expected[stat as keyof typeof expected] ?? 0)).toBe(value);
      }
    }
  });

  test('the CSV sample from the plan', () => {
    const sample: [string, number][] = [
      ['sword', 1],
      ['sword', 5],
      ['warhammer', 3],
      ['dagger', 5],
      ['plate', 4],
      ['leather', 2],
      ['robes', 5],
      ['shield', 1],
      ['buckler', 3],
      ['focus', 4],
    ];
    for (const [type, tier] of sample) {
      const row = rows.find((r) => r.type === type && r.tier === tier)!;
      const expected = gearItemStats(gearProfiles[type as keyof typeof gearProfiles], tier);
      for (const [stat, value] of Object.entries(row.stats)) {
        expect(csvRound(expected[stat as keyof typeof expected] ?? 0)).toBe(value);
      }
    }
  });

  test('every slot is consistent with the profile', () => {
    for (const [type, profile] of Object.entries(gearProfiles)) {
      const slot = GEAR_SLOTS[type as keyof typeof GEAR_SLOTS];
      expect(profile.slot).toBe(slot);
      for (const tier of [1, 2, 3, 4, 5]) {
        const item = itemById[gearId(type as keyof typeof gearProfiles, tier)] as GearDef;
        expect(item.slot).toBe(slot === 'armor' ? 'armor' : slot);
      }
    }
  });
});
