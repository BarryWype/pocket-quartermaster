import * as path from 'node:path';

import { profiles } from '@/game/sim/config';
import { pacingLines } from '@/game/sim/pacing';

import { runLab } from './lab';

const USAGE = `npm run sim -- [options]
  --profile casual|regular|dedicated|all   (default regular)
  --days N        (default 30)
  --runs N        seeds per profile (default 5)
  --seed S        (default 1)
  --set path=value   override a number for this run, repeatable (e.g. guild.gold.baseCost=80)
  --out dir       (default sim-output/<timestamp>)
  --compare path/to/summary.json
  --skip-matrix   leave out the odds matrix
  --pacing        print weekly loot drops per category (as doc/design/loot/tools/pacing.py) and stop`;

function parse(argv: string[]) {
  const options = { profile: 'regular', days: 30, runs: 5, seed: '1', overrides: [] as string[], out: '', compareWith: undefined as string | undefined, matrix: true, pacing: false };
  for (let i = 0; i < argv.length; i++) {
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${argv[i - 1]} needs a value`);
      return next;
    };
    switch (argv[i]) {
      case '--profile': options.profile = value(); break;
      case '--days': options.days = Number(value()); break;
      case '--runs': options.runs = Number(value()); break;
      case '--seed': options.seed = value(); break;
      case '--set': options.overrides.push(value()); break;
      case '--out': options.out = value(); break;
      case '--compare': options.compareWith = value(); break;
      case '--skip-matrix': options.matrix = false; break;
      case '--pacing': options.pacing = true; break;
      case '--help': console.log(USAGE); process.exit(0);
      default: throw new Error(`Unknown option ${argv[i]}\n${USAGE}`);
    }
  }
  return options;
}

const options = parse(process.argv.slice(2));
if (options.pacing) {
  console.log(pacingLines().join('\n'));
  process.exit(0);
}
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
runLab({
  profiles: options.profile === 'all' ? Object.keys(profiles) : [options.profile],
  days: options.days,
  runs: options.runs,
  seed: options.seed,
  overrides: options.overrides,
  outDir: options.out || path.join('sim-output', stamp),
  compareWith: options.compareWith,
  matrix: options.matrix,
});
