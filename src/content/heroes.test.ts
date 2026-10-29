import { readFileSync } from 'fs';
import { join } from 'path';

import { classAffinities } from '@/content/equipment';
import { heroClasses } from '@/content/heroes';
import { heroNames } from '@/content/roster';

import type { Approach, ClassFamily, ClassRarity, HeroClassId, Keyword, StatKey } from '@/game/types';

/** CSV class names keyed by hero class id. */
const CLASS_IDS: Record<string, HeroClassId> = {
  Warrior: 'warrior',
  Barbarian: 'barbarian',
  Paladin: 'paladin',
  Ranger: 'ranger',
  Thief: 'thief',
  'Fire mage': 'fireMage',
  'Frost mage': 'frostMage',
  Sorcerer: 'sorcerer',
  Cleric: 'cleric',
  Druid: 'druid',
  Troubadour: 'troubadour',
  Scholar: 'scholar',
  Exorcist: 'exorcist',
  Duelist: 'duelist',
  Smuggler: 'smuggler',
  Diplomat: 'diplomat',
  Necromancer: 'necromancer',
  Beastmaster: 'beastmaster',
  Engineer: 'engineer',
  Alchemist: 'alchemist',
  Porter: 'porter',
  Scout: 'scout',
  'Curse-breaker': 'curseBreaker',
  Cook: 'cook',
  Monk: 'monk',
  Gambler: 'gambler',
};

const FAMILIES: Record<string, ClassFamily> = {
  Answerer: 'answerer',
  Fighter: 'fighter',
  Converter: 'converter',
  'Rule-bender': 'ruleBender',
};

const RARITIES: Record<string, ClassRarity> = { Common: 'common', Uncommon: 'uncommon' };

const PRIMARY_COLUMNS: [string, StatKey][] = [
  ['Primary HP', 'hp'],
  ['Primary Power', 'power'],
  ['Primary Magic', 'magic'],
  ['Primary Armour', 'armour'],
  ['Primary Resistance', 'resistance'],
  ['Primary Evasion', 'evasion'],
  ['Primary Speed', 'speed'],
  ['Primary Crit', 'crit'],
];

const APPROACH_COLUMNS: [string, Approach][] = [
  ['Might score', 'might'],
  ['Finesse score', 'finesse'],
  ['Wits score', 'wits'],
  ['Faith score', 'faith'],
  ['Presence score', 'presence'],
];

const KEYWORD_COLUMNS: [string, Keyword][] = [
  ['Light', 'light'],
  ['Watchful', 'watchful'],
  ['Calm', 'calm'],
  ['Antidote', 'antidote'],
  ['Pierce', 'pierce'],
  ['Cleave', 'cleave'],
  ['Blessed', 'blessed'],
  ['Guard', 'guard'],
  ['Inspire', 'inspire'],
];

const AFFINITY_COLUMNS = [
  'Sword',
  'Axe',
  'Mace',
  'Dagger',
  'Bow',
  'Spear',
  'Warhammer',
  'Wand',
  'Staff',
  'Lute',
  'Censer',
  'Knuckles',
  'Plate',
  'Mail',
  'Leather',
  'Robes',
] as const;

/** Splits a CSV line into cells, keeping quoted fields with commas in one cell. */
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
    return Object.fromEntries(rows.map((header, i) => [header, cells[i]]));
  });
}

const classesCsv = parseCsv(join(__dirname, '../../doc/design/threats/classes.csv'));
const affinitiesCsv = parseCsv(join(__dirname, '../../doc/design/threats/affinities.csv'));
const damageStats = new Map(affinitiesCsv.map((row) => [row.Class, row['Damage stat']]));
const affinities = new Map(affinitiesCsv.map((row) => [row.Class, row]));

describe('heroClasses matches classes.csv', () => {
  test('every class row', () => {
    expect(classesCsv).toHaveLength(26);
    for (const row of classesCsv) {
      const id = CLASS_IDS[row.Class];
      expect(id).toBeDefined();
      const def = heroClasses[id];
      expect(def).toBeDefined();
      expect(def.name).toBe(row.Class);
      expect(def.rarity).toBe(row.Rarity.startsWith('Rare') ? 'rare' : RARITIES[row.Rarity]);
      expect(def.family).toBe(FAMILIES[row.Family]);
      expect(def.poolTier).toBe(row['Tavern pool from tier'].startsWith('Secret') ? null : Number(row['Tavern pool from tier']));
      expect(def.threat).toBe(Number(row['Threat (aggro)']));
      expect(def.damageStat).toBe((damageStats.get(row.Class) === 'Varies' ? 'power' : damageStats.get(row.Class))?.toLowerCase());
      expect(def.halfRate).toBe(row['Half-rate stat'].toLowerCase() || undefined);
      for (const stat of ['HP', 'Power', 'Magic', 'Armour', 'Resistance', 'Evasion', 'Speed', 'Crit'] as const) {
        expect(def.baseStats[stat.toLowerCase() as StatKey]).toBe(Number(row[`Base ${stat}`]));
      }
      expect(def.primary).toEqual(PRIMARY_COLUMNS.filter(([column]) => Number(row[column]) === 1).map(([, stat]) => stat));
      // The Gambler's CSV scores are "Random"; the rolled ones start at 0.
      for (const [column, approach] of APPROACH_COLUMNS) {
        expect(def.approaches[approach]).toBe(id === 'gambler' ? 0 : Number(row[column]));
      }
      if (id !== 'gambler') {
        expect(APPROACH_COLUMNS.reduce((sum, [column]) => sum + Number(row[column]), 0)).toBe(8);
      }
      expect(def.keywords).toEqual(KEYWORD_COLUMNS.filter(([column]) => Number(row[column]) === 1).map(([, keyword]) => keyword));
    }
  });

  test('every affinity column of affinities.csv', () => {
    for (const row of classesCsv) {
      const affinityRow = affinities.get(row.Class);
      expect(affinityRow).toBeDefined();
      const expected = Object.fromEntries(
        AFFINITY_COLUMNS.map((column) => [column.toLowerCase(), affinityRow![column].toLowerCase()]),
      );
      expect({ class: row.Class, ...classAffinities[CLASS_IDS[row.Class]] }).toEqual({ class: row.Class, ...expected });
    }
  });

  test('every class has 6 hero names', () => {
    expect(Object.keys(heroClasses)).toHaveLength(26);
    for (const names of Object.values(heroNames)) {
      expect(names).toHaveLength(6);
      expect(new Set(names).size).toBe(6);
    }
  });
});
