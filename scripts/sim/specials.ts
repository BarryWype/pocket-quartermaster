import * as fs from 'node:fs';
import * as path from 'node:path';

import { SPECIALS_RUNS, specialsCheck, specialsTable } from '@/game/sim/specials';

const USAGE = `npm run sim:specials -- [options]
  --runs N     odds runs per estimate (default: ${SPECIALS_RUNS})
  --report dir  where report.md goes (default doc/design/simulator)`;

function parse(argv: string[]) {
  const options = { runs: undefined as number | undefined, reportDir: 'doc/design/simulator' };
  for (let i = 0; i < argv.length; i++) {
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${argv[i - 1]} needs a value`);
      return next;
    };
    switch (argv[i]) {
      case '--runs': options.runs = Number(value()); break;
      case '--report': options.reportDir = value(); break;
      case '--help': console.log(USAGE); process.exit(0);
      default: throw new Error(`Unknown option ${argv[i]}\n${USAGE}`);
    }
  }
  return options;
}

const options = parse(process.argv.slice(2));
const started = performance.now();
const rows = specialsCheck(options.runs);
const table = specialsTable(rows);

console.log(table);
console.log(`\n${((performance.now() - started) / 1000).toFixed(1)} s (${options.runs ?? SPECIALS_RUNS} runs per estimate)`);

// The section lives between the markers, so the full sim can carry it over (see scripts/sim/report.ts).
const file = path.resolve(process.cwd(), options.reportDir, 'report.md');
const section = `<!-- specials -->\n## Specials balance\n\nThe quick reference trio against every tier's whole chain, each special carried by one hero at a time: the gain in win odds over the no-special baseline, averaged over every tier, dungeon and hero. Steal only adds loot, so it is never flagged; the others should stay within 0.5×–1.5× of the median average gain.\n\n${table}\n<!-- /specials -->\n`;
const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
const open = '<!-- specials -->';
const close = '<!-- /specials -->';
const start = previous?.indexOf(open) ?? -1;
const end = previous === null ? -1 : previous.indexOf(close);
fs.mkdirSync(path.dirname(file), { recursive: true });
if (previous !== null && start !== -1 && end !== -1) {
  fs.writeFileSync(file, previous.slice(0, start) + section + previous.slice(end + close.length));
} else if (previous !== null) {
  fs.writeFileSync(file, `${previous.trimEnd()}\n\n${section}`);
} else {
  fs.writeFileSync(file, section);
}
console.log(`→ ${file}`);
