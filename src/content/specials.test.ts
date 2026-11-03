import * as fs from 'node:fs';
import * as path from 'node:path';

import type { HeroClassId, SpecialId } from '@/game/types';

import { classSpecials } from './classSpecials';
import { specials } from './specials';

const dir = path.resolve(__dirname, '../../doc/design/abilities');

const rows = (file: string): string[][] =>
  fs.readFileSync(path.join(dir, file), 'utf8').trim().split('\n').map((line) => line.split(','));

const catalogue = rows('specials.csv').slice(1);
const pools = rows('class-specials.csv').slice(1);

const usesOf = (text: string) =>
  text === 'once per fight' ? 'perFight' : text === 'once per expedition' ? 'perExpedition' : 'betweenFights';

/** Every number in a CSV text, as the data stores it: 60% → 0.6, ×3 → 3, +15% → 1.15. */
const numbersIn = (text: string): number[] => {
  const marked = text.replace(/(\d+)\/(\d+)/g, '$1% $2%');
  const values: number[] = [];
  for (const match of marked.matchAll(/(\d+(?:\.\d+)?)/g)) {
    const n = Number(match[1]);
    const at = match.index ?? 0;
    if (marked[at + match[1].length] === '%') values.push(marked[at - 1] === '+' ? 1 + n / 100 : n / 100);
    else values.push(n);
  }
  return values;
};

/** Every number stored in an effect or a trigger, booleans and strings skipped. */
const numbersOf = (value: object): number[] =>
  Object.values(value).flatMap((v) => (typeof v === 'number' ? [v] : v && typeof v === 'object' ? numbersOf(v) : []));

describe('the specials catalogue', () => {
  it('matches specials.csv', () => {
    expect(catalogue.length).toBe(Object.keys(specials).length);
    for (const [id, name, kind, effect, trigger, uses] of catalogue) {
      const def = specials[id as SpecialId];
      expect(def).toBeDefined();
      expect(def.name).toBe(name);
      expect(def.kind).toBe(kind);
      expect(def.uses).toBe(usesOf(uses));
      const stored = [...numbersOf(def.effect), ...numbersOf(def.trigger)];
      for (const value of [...numbersIn(effect), ...numbersIn(trigger)]) {
        expect(stored).toContain(value);
      }
    }
  });

  it('gives every class the pool from class-specials.csv', () => {
    expect(Object.keys(classSpecials).length).toBe(pools.length);
    for (const [classId, common1, common2, common3, rare] of pools) {
      expect(classSpecials[classId as HeroClassId]).toEqual({ common: [common1, common2, common3], rare });
    }
  });

  it('pools only hold known specials', () => {
    for (const pool of Object.values(classSpecials)) {
      for (const id of [...pool.common, pool.rare]) expect(specials[id]).toBeDefined();
    }
  });
});
