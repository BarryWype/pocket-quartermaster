import { simConfig } from '@/game/sim/config';
import { applyOverrides, parseOverride } from '@/game/sim/overrides';
import { quickProbe, type QuickTier } from '@/game/sim/quick';
import { inRange, targets } from '@/game/sim/targets';

const USAGE = `npm run sim:quick -- [options]
  --days N        rotation days to sample (default: sim.quick.days)
  --runs N        odds runs per estimate (default: sim.quick.runs)
  --set path=value   override a number for this run, repeatable (e.g. dungeons.ratCellar.strength=1)`;

function parse(argv: string[]) {
  const options = { days: undefined as number | undefined, runs: undefined as number | undefined, overrides: [] as string[] };
  for (let i = 0; i < argv.length; i++) {
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${argv[i - 1]} needs a value`);
      return next;
    };
    switch (argv[i]) {
      case '--days': options.days = Number(value()); break;
      case '--runs': options.runs = Number(value()); break;
      case '--set': options.overrides.push(value()); break;
      case '--help': console.log(USAGE); process.exit(0);
      default: throw new Error(`Unknown option ${argv[i]}\n${USAGE}`);
    }
  }
  return options;
}

const options = parse(process.argv.slice(2));
const started = performance.now();
const undo = applyOverrides(options.overrides.map(parseOverride));
let tiers: QuickTier[];
try {
  const config = { ...simConfig, quick: { ...simConfig.quick, ...options.days !== undefined ? { days: options.days } : {}, ...options.runs !== undefined ? { runs: options.runs } : {} } };
  tiers = quickProbe(config);
} finally {
  undo();
}

/** `72% ✓` when the value sits in its target range, `—` when there is no sample. */
const cell = (value: number | null, range: [number, number]) =>
  value === null ? '—' : `${Math.round(value * 100)}% ${inRange(value, range) ? '✓' : '✗'}`;

console.log('| tier | prepared | not prepared | gap | boss | events | patrols |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
for (const tier of tiers) {
  const gap = tier.prepared !== null && tier.notPrepared !== null ? `${Math.round((tier.prepared - tier.notPrepared) * 100)} pts` : '—';
  console.log(
    `| ${tier.tier} | ${cell(tier.prepared, targets.odds.prepared)} | ${cell(tier.notPrepared, targets.odds.unprepared)} | ${gap} | ${cell(tier.boss, targets.odds.boss)} | ${cell(tier.events, targets.odds.events)} | ${cell(tier.patrols, targets.odds.events)} |`,
  );
}
console.log(`\n${((performance.now() - started) / 1000).toFixed(1)} s`);
