import * as fs from 'node:fs';
import * as path from 'node:path';

import { parseMatrixCsv } from '@/game/loot/matrixCsv';
import { LOOT_SOURCES, type LootSourceRow } from '@/game/loot/types';

const csvPath = path.resolve('doc/design/loot/matrix.csv');
const outPath = path.resolve('src/content/loot/matrix.ts');

const matrix = parseMatrixCsv(fs.readFileSync(csvPath, 'utf8'));

// Readable strings: single quotes unless the text itself has one.
const q = (text: string) => (text.includes("'") ? JSON.stringify(text) : `'${text}'`);

const row = (id: string, source: LootSourceRow) => {
  const lines = [
    `  ${id}: {`,
    `    name: ${q(source.name)},`,
    `    visitsPerDay: ${source.visitsPerDay},`,
    '    marks: {',
  ];
  for (const [category, mark] of Object.entries(source.marks)) {
    lines.push(`      ${category}: '${mark}',`);
  }
  lines.push('    },', `    notes: ${q(source.notes)},`, '  },');
  return lines.join('\n');
};

const body = LOOT_SOURCES.map((id) => row(id, matrix[id])).join('\n\n');

const file = `// Generated from doc/design/loot/matrix.csv by \`npm run loot:matrix\`; do not edit by hand.
import type { LootSourceId, LootSourceRow } from '@/game/loot/types';

export const lootMatrix: Record<LootSourceId, LootSourceRow> = {
${body}
};
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, file);
console.log(`Wrote ${outPath}`);
