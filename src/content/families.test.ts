import { readFileSync } from 'fs';
import { join } from 'path';

import { classAffinities, gearProfiles } from '@/content/equipment';
import { families } from '@/content/families';
import { heroClasses } from '@/content/heroes';

import type { FamilyId, FamilyThreat } from '@/content/families';
import type { GearType, HeroClassId } from '@/game/types';

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

function parseCsv(path: string): Record<string, string>[] {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
  const rows = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return Object.fromEntries(rows.map((header, i) => [header, cells[i] ?? '']));
  });
}

const familiesCsv = parseCsv(join(__dirname, '../../doc/design/families/families.csv'));
const classTagsCsv = parseCsv(join(__dirname, '../../doc/design/families/class-tags.csv'));
const itemTagsCsv = parseCsv(join(__dirname, '../../doc/design/families/item-tags.csv'));

/** The first word of the "answers threat" column, lowercased. */
const THREATS: Record<string, FamilyThreat> = {
  Holy: 'holy',
  Beasts: 'beasts',
  Darkness: 'darkness',
  Traps: 'traps',
  Poison: 'poison',
  Element: 'element',
  Armoured: 'armoured',
};

/** The CSV's `ammunition` row is the code's `quiver` gear type. */
const ROW_BY_TYPE: Record<string, string> = { quiver: 'ammunition' };
const TYPE_BY_ROW: Record<string, string> = { ammunition: 'quiver' };

describe('families matches families.csv', () => {
  test('every family row, in order', () => {
    expect(familiesCsv).toHaveLength(families.length);
    familiesCsv.forEach((row, i) => {
      const family = families[i];
      expect(family.id).toBe(row.id);
      expect(family.name).toBe(row.name);
      expect(family.kind).toBe(row.kind);
      const threat = THREATS[row['answers threat'].split(' ')[0]];
      expect(family.answers).toBe(row.kind === 'threat' ? threat : undefined);
    });
  });
});

describe('heroClasses matches class-tags.csv', () => {
  test('every class row', () => {
    const rowsById = new Map(classTagsCsv.map((row) => [row.class, row.family]));
    expect(rowsById.size).toBe(Object.keys(heroClasses).length);
    for (const id of Object.keys(heroClasses) as HeroClassId[]) {
      expect(rowsById.get(id)).toBeDefined();
      expect(heroClasses[id].familyTag).toBe(rowsById.get(id));
    }
  });
});

describe('gearProfiles matches item-tags.csv', () => {
  test('every gear type row', () => {
    const rowsByType = new Map(itemTagsCsv.map((row) => [ROW_BY_TYPE[row.type] ?? row.type, row]));
    for (const type of Object.keys(gearProfiles) as GearType[]) {
      const row = rowsByType.get(ROW_BY_TYPE[type] ?? type);
      expect([type, row !== undefined]).toEqual([type, true]);
      expect(gearProfiles[type].familyTag).toBe(row!.family as FamilyId);
      expect(Number(row!.tags)).toBe(gearProfiles[type].twoHanded ? 2 : 1);
    }
  });

  test('untagged rows and no missing rows', () => {
    const types = new Set(itemTagsCsv.map((row) => TYPE_BY_ROW[row.type] ?? row.type));
    for (const type of Object.keys(gearProfiles) as GearType[]) expect(types.has(type)).toBe(true);
    for (const row of itemTagsCsv) {
      if (row.type === 'workTools' || row.type === 'trinkets') {
        expect(row.family).toBe('');
        expect(Number(row.tags)).toBe(0);
      }
    }
  });

  test('every family has at least one item type', () => {
    const itemTags = new Set(itemTagsCsv.map((row) => row.family));
    for (const family of families) expect(itemTags.has(family.id)).toBe(true);
  });
});

describe('no class anchors its own family alone', () => {
  test('class tag plus gear tags of its own family is at most 3 in any gear it can use', () => {
    const types = Object.keys(gearProfiles) as GearType[];
    const offhands = types.filter((type) => gearProfiles[type].slot === 'offhand');
    const broken: string[] = [];
    for (const classId of Object.keys(heroClasses) as HeroClassId[]) {
      const own = heroClasses[classId].familyTag;
      const affinities = classAffinities[classId];
      const usable = (slot: 'weapon' | 'armor') =>
        types.filter((type) => gearProfiles[type].slot === slot && affinities[type as keyof typeof affinities] !== 'unfit');
      for (const weapon of usable('weapon')) {
        for (const armour of usable('armor')) {
          const gear = gearProfiles[weapon].twoHanded ? [[weapon, armour]] : offhands.map((offhand) => [weapon, armour, offhand]);
          for (const set of gear) {
            const count = 1 + set.reduce((sum, type) => sum + (gearProfiles[type].familyTag === own ? (gearProfiles[type].twoHanded ? 2 : 1) : 0), 0);
            if (count > 3) broken.push(`${classId} in ${set.join(', ')}: ${count} ${own}`);
          }
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
