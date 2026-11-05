import * as fs from 'node:fs';
import * as path from 'node:path';

import { ELEMENTS } from '@/game/elements';
import type { GearType } from '@/game/types';

import { affixes, affixById } from './affixes';
import { threatDefs } from './threats';
import { components } from './loot/components';
import { monsterParts } from './loot/monsterParts';

const dir = path.resolve(__dirname, '../../doc/design/gear');

/** Splits a CSV line; quoted fields may hold commas and doubled quotes. */
const parseCsvLine = (line: string): string[] => {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (!quoted) {
      if (char === '"') quoted = true;
      else if (char === ',') {
        fields.push(field);
        field = '';
      } else field += char;
    } else if (char === '"' && line[i + 1] === '"') {
      field += '"';
      i++;
    } else if (char === '"') quoted = false;
    else field += char;
  }
  fields.push(field);
  return fields;
};

const rows = fs
  .readFileSync(path.join(dir, 'affixes.csv'), 'utf8')
  .trim()
  .split('\n')
  .map(parseCsvLine);

const catalogue = rows.slice(1);

const cap = (id: string) => `${id[0].toUpperCase()}${id.slice(1)}`;

/** The affix ids a CSV row stands for: one, or one per element / threat kind. */
const idsFor = (row: string[]): string[] => {
  if (row[0] === 'infused') return ELEMENTS.map((element) => `infused${cap(element)}`);
  if (row[0] === 'warding') return ELEMENTS.map((element) => `warding${cap(element)}`);
  if (row[0] === 'steady') return threatDefs.map((threat) => `steady${cap(threat.id)}`);
  return [row[0]];
};

/** The CSV's gear-type names as ids ("armour" spreads to every armour type). */
const ARMOUR: GearType[] = ['plate', 'mail', 'leather', 'robes'];
const typeOf = (csvName: string): GearType[] =>
  csvName === 'armour'
    ? ARMOUR
    : [({ 'off-hand blade': 'offhandBlade' } as Record<string, GearType>)[csvName] ?? (csvName as GearType)];

const slotOf = (csvSlot: string): 'weapon' | 'armourOffhand' | 'any' | { types: GearType[] } =>
  csvSlot === 'weapon'
    ? 'weapon'
    : csvSlot === 'armour/offhand'
      ? 'armourOffhand'
      : csvSlot === 'any'
        ? 'any'
        : { types: csvSlot.split(', ').flatMap(typeOf) };

/** The value range a CSV "value_range" spells out, in display units; absent when fixed. */
const rangeIn = (csvRange: string): { range: { min: number; max: number }; unit: 'pct' | 'flat' | 'm' } | undefined => {
  const numbers = [...csvRange.matchAll(/(\d+(?:\.\d+)?)/g)].map((match) => Number(match[1]));
  if (numbers.length < 2) return undefined;
  return {
    range: { min: numbers[0], max: numbers[1] },
    unit: csvRange.includes('%') ? 'pct' : csvRange.endsWith('m') ? 'm' : 'flat',
  };
};

describe('the affix catalogue', () => {
  it('has every affix exactly once', () => {
    expect(Object.keys(affixById)).toHaveLength(affixes.length);
    expect(new Set(affixes.map((affix) => affix.id)).size).toBe(affixes.length);
    expect(affixes).toHaveLength(catalogue.length - 3 + ELEMENTS.length * 2 + threatDefs.length);
  });

  it('matches affixes.csv', () => {
    for (const row of catalogue) {
      const [id, name, source, family, slot, , valueRange] = row;
      for (const affixId of idsFor(row)) {
        const def = affixById[affixId];
        expect(def).toBeDefined();
        if (affixId === id) expect(def.name).toBe(name);
        if (source.startsWith('part:')) expect(def.source).toEqual({ kind: 'part', partId: source.slice(5) });
        else if (source.startsWith('component:'))
          expect(def.source).toEqual({ kind: 'component', componentId: source.slice(10) });
        else if (source === 'elemental stone') {
          expect(def.source.kind).toBe('element');
          expect((def.source as { element?: string }).element).toBe(affixId.slice(7).toLowerCase());
        } else expect(def.source).toEqual({ kind: 'loot' });
        expect(def.family).toBe(
          source.startsWith('part:') ? monsterParts.find((part) => part.id === source.slice(5))?.tag : family,
        );
        expect(def.slot).toEqual(slotOf(slot));
        const range = rangeIn(valueRange);
        if (id === 'unyielding') {
          // Fixed effect, but its trigger chance rolls (see the CSV note).
          expect(def.range).toEqual({ min: 50, max: 100 });
          expect(def.unit).toBe('pct');
        } else if (range) {
          expect(def.range).toEqual(range.range);
          expect(def.unit).toBe(range.unit);
        } else expect(def.range).toBeUndefined();
      }
    }
  });

  it('gives every non-heart component exactly one affix, on the types it fits', () => {
    for (const component of components.filter((c) => !c.element)) {
      const matches = affixes.filter(
        (affix) => affix.source.kind === 'component' && affix.source.componentId === component.id,
      );
      expect(matches).toHaveLength(1);
      expect(matches[0].slot).toEqual({ types: component.fits });
    }
  });

  it('gives every monster part one weapon and one armour/offhand affix', () => {
    for (const part of monsterParts) {
      const matches = affixes.filter((affix) => affix.source.kind === 'part' && affix.source.partId === part.id);
      expect(matches.filter((affix) => affix.slot === 'weapon')).toHaveLength(1);
      expect(matches.filter((affix) => affix.slot === 'armourOffhand')).toHaveLength(1);
    }
  });

  it('scopes the shared affixes once per party or roster', () => {
    expect(affixById.plunderer.scope).toBe('party');
    for (const id of ['foragers', 'wanderers', 'pocket']) expect(affixById[id].scope).toBe('roster');
  });
});
