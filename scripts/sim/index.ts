import * as path from 'node:path';

import { profiles } from '@/game/sim/config';
import { pacingLines } from '@/game/sim/pacing';

import { runLab } from './lab';

const USAGE = `npm run sim -- [options]
  --profile casual|regular|heavy|all   (default all)
  --seeds N       games per profile (default 4)
  --seed S        (default 1)
  --max-days N    stop every game by then (default: each profile's cap)
  --set path=value   override a number for this run, repeatable (e.g. guild.gold.baseCost=80)
  --out dir       where the CSVs go (default sim-output/<timestamp>)
  --pacing        print weekly loot drops per category (as doc/design/loot/tools/pacing.py) and stop`;

function parse(argv: string[]) {
  const options = { profile: 'all', seeds: 4, seed: '1', maxDays: undefined as number | undefined, overrides: [] as string[], out: '', pacing: false };
  for (let i = 0; i < argv.length; i++) {
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${argv[i - 1]} needs a value`);
      return next;
    };
    switch (argv[i]) {
      case '--profile': options.profile = value(); break;
      case '--seeds': options.seeds = Number(value()); break;
      case '--seed': options.seed = value(); break;
      case '--max-days': options.maxDays = Number(value()); break;
      case '--set': options.overrides.push(value()); break;
      case '--out': options.out = value(); break;
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
  seeds: options.seeds,
  seed: options.seed,
  maxDays: options.maxDays,
  overrides: options.overrides,
  outDir: options.out || path.join('sim-output', stamp),
});
