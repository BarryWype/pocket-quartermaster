import type { LootCategory, LootMark, LootSourceId, LootSourceRow } from './types';

/** CSV column names, in matrix.csv order, mapped to loot categories. */
const CATEGORY_COLUMNS: Record<string, LootCategory> = {
  Gold: 'gold',
  XP: 'xp',
  Materials: 'materials',
  Shards: 'shards',
  Blueprints: 'blueprints',
  Gear: 'gear',
  Trinkets: 'trinkets',
  Components: 'components',
  Relics: 'relics',
  'Monster parts': 'monsterParts',
  Valuables: 'valuables',
  Consumables: 'consumables',
  'Treasure maps': 'treasureMaps',
  Manuals: 'manuals',
  'Key fragments': 'keyFragments',
};

/** Source ids, in matrix.csv row order, with their row name. */
const SOURCE_BY_NAME: Record<string, LootSourceId> = {
  'Dungeon run': 'dungeonRun',
  'Dungeon, first win of the day': 'firstWin',
  'First clear of a new tier': 'firstTierClear',
  'Tier boss': 'tierBoss',
  'Overnight quest': 'overnightQuest',
  'Patrol: goblin scouts': 'patrolGoblins',
  'Patrol: game herd': 'patrolHerd',
  'Patrol: bandits': 'patrolBandits',
  Traveller: 'traveller',
  'Bandit camp': 'banditCamp',
  'Goblin raiding party': 'goblinRaid',
  'Beast den': 'beastDen',
  'Haunted crypt': 'hauntedCrypt',
  'Elemental rift': 'elementalRift',
  'Abandoned caravan': 'abandonedCaravan',
  'Wanted outlaw': 'wantedOutlaw',
  'Monster lair': 'monsterLair',
  'Ruins, a dig': 'ruinsDig',
  "Thieves' guild heist": 'heist',
  'Fishing dock': 'fishingDock',
  'Treasure spot': 'treasureSpot',
  Sanctum: 'sanctum',
  'Step chest': 'stepChest',
};

/** One CSV line, splitting on commas outside quoted fields. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      fields.push(field);
      field = '';
    } else field += char;
  }
  fields.push(field);
  return fields;
}

/** The loot matrix CSV: one row per source, one mark column per category. */
export function parseMatrixCsv(text: string): Record<LootSourceId, LootSourceRow> {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  const header = parseCsvLine(lines[0]);
  const categories: LootCategory[] = [];
  for (const column of header.slice(2, header.length - 1)) {
    const category = CATEGORY_COLUMNS[column];
    if (!category) throw new Error(`Unknown matrix column: ${column}`);
    categories.push(category);
  }
  const rows: Record<LootSourceId, LootSourceRow> = {} as Record<LootSourceId, LootSourceRow>;
  for (const line of lines.slice(1)) {
    const fields = parseCsvLine(line);
    if (fields.length !== header.length) throw new Error(`Matrix row has ${fields.length} fields, expected ${header.length}: ${fields[0]}`);
    const id = SOURCE_BY_NAME[fields[0]];
    if (!id) throw new Error(`Unknown matrix source: ${fields[0]}`);
    const marks = {} as Record<LootCategory, LootMark>;
    categories.forEach((category, index) => {
      const mark = fields[index + 2] as LootMark;
      if (!['—', 'R/2', 'R', 'S', 'O', 'A'].includes(mark)) throw new Error(`Unknown mark: ${mark}`);
      marks[category] = mark;
    });
    rows[id] = {
      name: fields[0],
      visitsPerDay: Number(fields[1]),
      marks,
      notes: fields[fields.length - 1] ?? '',
    };
  }
  return rows;
}
