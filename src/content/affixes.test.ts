import * as fs from 'node:fs';
import * as path from 'node:path';

import { ELEMENTS } from '@/game/elements';

import { affixes, affixById } from './affixes';
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

/** The affix ids a CSV row stands for: one, or one per element. */
const idsFor = (row: string[]): string[] => {
  if (row[0] === 'infused') return ELEMENTS.map((element) => `infused${cap(element)}`);
  if (row[0] === 'warding') return ELEMENTS.map((element) => `warding${cap(element)}`);
  return [row[0]];
};

const slotOf = (csvSlot: string): 'weapon' | 'armourOffhand' | 'helmet' | 'any' =>
  csvSlot === 'offensive' ? 'weapon' : csvSlot === 'defensive' ? 'armourOffhand' : csvSlot === 'helmet' ? 'helmet' : 'any';

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
    expect(affixes).toHaveLength(catalogue.length - 2 + ELEMENTS.length * 2);
  });

  it('matches affixes.csv', () => {
    for (const row of catalogue) {
      const [id, name, source, group, slot, , valueRange] = row;
      for (const affixId of idsFor(row)) {
        const def = affixById[affixId];
        expect(def).toBeDefined();
        if (affixId === id) expect(def.name).toBe(name);
        if (source.startsWith('part:')) expect(def.source).toEqual({ kind: 'part', partId: source.slice(5) });
        else if (source === 'elemental stone') {
          expect(def.source.kind).toBe('element');
          expect((def.source as { element?: string }).element).toBe(affixId.slice(7).toLowerCase());
        } else expect(def.source).toEqual({ kind: 'loot' });
        expect(def.group).toBe(
          source.startsWith('part:') ? monsterParts.find((part) => part.id === source.slice(5))?.tag : group,
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

  it('gives every monster part one offensive, one defensive and one helmet affix', () => {
    for (const part of monsterParts) {
      const matches = affixes.filter((affix) => affix.source.kind === 'part' && affix.source.partId === part.id);
      expect(matches.filter((affix) => affix.slot === 'weapon')).toHaveLength(1);
      expect(matches.filter((affix) => affix.slot === 'armourOffhand')).toHaveLength(1);
      expect(matches.filter((affix) => affix.slot === 'helmet')).toHaveLength(1);
    }
  });

  it('scopes the shared affixes once per party or roster', () => {
    expect(affixById.plunderer.scope).toBe('party');
    expect(affixById.commander.scope).toBe('party');
    expect(affixById.haggler.scope).toBe('roster');
    for (const id of ['foragers', 'wanderers', 'pocket']) expect(affixById[id].scope).toBe('roster');
  });
});
