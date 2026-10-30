import * as fs from 'node:fs';
import * as path from 'node:path';

import { baseItems } from '@/content/loot/baseItems';
import { components } from '@/content/loot/components';
import { monsterParts } from '@/content/loot/monsterParts';
import { purposeInfo, PURPOSES } from '@/content/loot/purposes';
import { relics } from '@/content/loot/relics';
import { valuables } from '@/content/loot/valuables';
import { contentTexts } from '@/content/fr/contentTexts';
import { frNames } from '@/content/fr/names';
import { materials } from '@/content/materials';
import { elementInfo } from '@/content/elements';
import { ELEMENTS } from '@/game/elements';
import type { GearType } from '@/game/types';

import { valuablePrice } from './catalogue';

const csvPath = (name: string) => path.resolve(__dirname, `../../../doc/design/loot/${name}`);

/** One CSV line split on commas, honouring double-quoted fields. */
function parseLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') quoted = false;
      else current += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      fields.push(current);
      current = '';
    } else current += char;
  }
  fields.push(current);
  return fields;
}

/** A CSV file as rows of fields, without the header. */
function csvRows(name: string): string[][] {
  const lines = fs.readFileSync(csvPath(name), 'utf8').trim().split('\n');
  return lines.slice(1).map(parseLine).map((row) => row.map(normalizeApostrophe));
}

/** The CSVs use straight apostrophes, the content curly ones. */
const normalizeApostrophe = (text: string) => text.replace(/'/g, '’');

const RELIC_TYPE_BY_NAME: Record<string, GearType> = {
  Buckler: 'buckler',
  Bow: 'bow',
  Mace: 'mace',
  Knuckles: 'knuckles',
  Robes: 'robes',
  Leather: 'leather',
  Sword: 'sword',
  Spear: 'spear',
  Mail: 'mail',
  Wand: 'wand',
  Staff: 'staff',
  Censer: 'censer',
  Axe: 'axe',
  Dagger: 'dagger',
  Quiver: 'quiver',
  Warhammer: 'warhammer',
  Shield: 'shield',
  Lute: 'lute',
  Focus: 'focus',
  'Off-hand blade': 'offhandBlade',
  Plate: 'plate',
  Tome: 'tome',
};

describe('the base item catalogue', () => {
  it('has the 12 monster parts of the CSV, one per family tag', () => {
    const rows = csvRows('monster-parts.csv');
    expect(rows).toHaveLength(12);
    expect(monsterParts.map((p) => [p.name, p.tag, p.uses])).toEqual(rows.map((r) => [r[0], r[1], r[2]]));
    for (const part of monsterParts) {
      expect(part.sellPrice).toBeGreaterThanOrEqual(3);
      expect(part.sellPrice).toBeLessThanOrEqual(6);
    }
  });

  it('has the 12 components of the CSV plus one heart per element', () => {
    const rows = csvRows('components.csv');
    expect(rows).toHaveLength(13);
    const csvNames = rows.map((r) => r[0]);
    expect(components.map((c) => c.name)).toEqual([
      ...csvNames.slice(0, 12),
      ...ELEMENTS.map((element) => `${elementInfo[element].name} heart`),
    ]);
    // Boss components are the five bosses' own; the rest sell for 20.
    for (const component of components) {
      expect(component.sellPrice).toBe(component.id.endsWith('Heart') ? 20 : components.indexOf(component) < 5 ? 40 : 20);
    }
    expect(components.filter((c) => c.id.endsWith('Heart'))).toHaveLength(ELEMENTS.length);
    for (const element of ELEMENTS) {
      const heart = components.find((c) => c.id === `${element}Heart`);
      expect(heart?.element).toBe(element);
      expect(heart?.sellPrice).toBe(20);
    }
  });

  it('has the 9 valuables of the CSV with their rarities', () => {
    const rows = csvRows('valuables.csv');
    expect(rows).toHaveLength(9);
    expect(valuables.map((v) => [v.name, v.rarity])).toEqual(rows.map((r) => [r[0], r[1].toLowerCase()]));
    for (const valuable of valuables) {
      expect(valuable.basePrice).toBe({ common: 5, uncommon: 12, rare: 30 }[valuable.rarity]);
    }
  });

  it('has the 25 relics of the CSV with their tiers and types', () => {
    const rows = csvRows('relics.csv');
    expect(rows).toHaveLength(25);
    expect(relics.map((r) => [r.name, r.tier, r.gearType, r.effect])).toEqual(
      rows.map((r) => [r[0], Number(r[1]), RELIC_TYPE_BY_NAME[r[2]], r[3]]),
    );
    for (const relic of relics) expect(relic.sellPrice).toBe(10 * relic.tier);
  });

  it('counts every part and component as a material', () => {
    const materialIds = new Set(materials.map((m) => m.id));
    for (const part of monsterParts) expect(materialIds.has(part.id)).toBe(true);
    for (const component of components) expect(materialIds.has(component.id)).toBe(true);
  });

  it('has a French entry for every new name and text', () => {
    const texts = [
      ...monsterParts.flatMap((p) => [p.name, p.uses]),
      ...components.flatMap((c) => [c.name, c.from, c.adds]),
      ...valuables.flatMap((v) => [v.name, ...(v.uses ? [v.uses] : [])]),
      ...relics.flatMap((r) => [r.name, r.effect]),
      ...Object.values(baseItems).flatMap((b) => [b.name, ...(b.description ? [b.description] : [])]),
      ...PURPOSES.map((p) => purposeInfo[p].name),
    ];
    expect(texts.filter((text) => !(text in frNames))).toEqual([]);
    // The content-text test walks the same texts through contentTexts().
    expect(contentTexts().filter((text) => !(text in frNames))).toEqual([]);
  });

  it('prices valuables by tier, rising with it', () => {
    for (const valuable of valuables) {
      let previous = 0;
      for (const tier of [1, 2, 3, 4, 5]) {
        const price = valuablePrice(valuable.id, tier);
        expect(price).toBeGreaterThan(previous);
        previous = price;
      }
    }
  });
});
