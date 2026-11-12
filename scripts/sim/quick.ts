import { simConfig } from '@/game/sim/config';
import { difficultyRules } from '@/content/difficulty';
import { applyOverrides, parseOverride } from '@/game/sim/overrides';
import { quickProbe, type QuickTier } from '@/game/sim/quick';
import { inRange, targets } from '@/game/sim/targets';
import { focusOdds, familyName, venomousOdds } from '@/game/sim/familyFocus';
import { threatCosts } from '@/game/sim/threatCosts';
import { elementalProtection } from '@/game/sim/elementalTier';
import { familyFocusTable, venomTable } from './report';

const USAGE = `npm run sim:quick -- [options]
  --days N        rotation days to sample (default: sim.quick.days)
  --runs N        odds runs per estimate (default: sim.quick.runs)
  --set path=value   override a number for this run, repeatable (e.g. dungeons.ratCellar.strength=1)
  --families      only the family tables (family focus, Venomous)`;

function parse(argv: string[]) {
  const options = { days: undefined as number | undefined, runs: undefined as number | undefined, overrides: [] as string[], families: false };
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
      case '--families': options.families = true; break;
      case '--help': console.log(USAGE); process.exit(0);
      default: throw new Error(`Unknown option ${argv[i]}\n${USAGE}`);
    }
  }
  return options;
}

const options = parse(process.argv.slice(2));
const started = performance.now();
const undo = applyOverrides(options.overrides.map(parseOverride));
const familyRuns = options.runs ?? simConfig.quick.runs;

/** The family tables: each playstyle family's focus odds and flag, and the Venomous affix outside Venom parties. */
function familyTables() {
  console.log('\n## Lift per family focus (odds with no tags: points at L1 / L2 / L3, L3 fires, level reached)');
  console.log(familyFocusTable(focusOdds(familyRuns)));
  console.log('\n## Venomous outside Venom parties (points over no affix)');
  console.log(venomTable(venomousOdds(familyRuns)));
}

if (options.families) {
  try {
    familyTables();
  } finally {
    undo();
  }
  console.log(`\n${((performance.now() - started) / 1000).toFixed(1)} s`);
  process.exit(0);
}
let tiers: QuickTier[];
try {
  const config = { ...simConfig, quick: { ...simConfig.quick, ...options.days !== undefined ? { days: options.days } : {}, ...options.runs !== undefined ? { runs: options.runs } : {} } };
  tiers = quickProbe(config);
} finally {
  undo();
}

/** `72% ✓` when the value sits in its target range, `—` when there is no sample. */
const pct0 = (value: number) => `${Math.round(value * 100)}%`;
const cell = (value: number | null, range: [number, number] | null) =>
  value === null ? '—' : `${Math.round(value * 100)}%${range ? ` ${inRange(value, range) ? '✓' : '✗'}` : ''}`;

console.log('| tier | medium prepared (fit team) | medium skipped | medium gap | hard prepared (fit team) | hard skipped | hard gap | boss | events | patrols |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const tier of tiers) {
  const pair = (d: 'medium' | 'hard') => {
    const { prepared, skipped } = tier.gap[d];
    const gap = prepared !== null && skipped !== null ? prepared - skipped : null;
    return [
      cell(prepared, difficultyRules.oddsTargets[d].end),
      skipped === null ? '—' : `${Math.round(skipped * 100)}%`,
      gap === null ? '—' : `${Math.round(gap * 100)} pts ${gap >= targets.odds.threatGap[d] ? '✓' : '✗'}`,
    ];
  };
  console.log(`| ${tier.tier} | ${[...pair('medium'), ...pair('hard'), cell(tier.boss, targets.odds.boss), cell(tier.events, targets.odds.events), cell(tier.patrols, targets.odds.events)].join(' | ')} |`);
}
const kinds = Object.keys(tiers[0].byKind);
const averages = kinds.map((kind) => {
  const values = tiers.map((t) => t.byKind[kind]).filter((v): v is number => v !== null);
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
});
console.log(`\n| tier | ${kinds.join(' | ')} |`);
console.log(`| --- |${kinds.map(() => ' --- |').join('')}`);
for (const tier of tiers) console.log(`| ${tier.tier} | ${kinds.map((k) => cell(tier.byKind[k], targets.odds.events)).join(' | ')} |`);
console.log(`| mean | ${averages.map((v) => cell(v, targets.odds.events)).join(' | ')} |`);

console.log('\n## Odds by difficulty (reference roster)');
console.log('| tier | easy start | easy end | medium start | medium end | hard start | hard end |');
console.log('| --- | --- | --- | --- | --- | --- | --- |');
for (const tier of tiers) {
  console.log(
    `| ${tier.tier} | ${(['easy', 'medium', 'hard'] as const)
      .flatMap((d) => [tier.difficulty[d].start, tier.difficulty[d].end].map((v, i) => cell(v, difficultyRules.oddsTargets[d][i ? 'end' : 'start'])))
      .join(' | ')} |`,
  );
}

const pts = (value: number | null) => (value === null ? '—' : (value * 100).toFixed(1));
// Differences of two estimates: twice the runs keeps their noise near the other tables'.
const breakdownRuns = 2 * (options.runs ?? simConfig.quick.runs);
const costs = threatCosts(breakdownRuns);
console.log('\n## Threat costs (fitted party at tier end, answering family stripped: points of odds lost to the threat alone, medium / hard)');
const costTiers = [1, 2, 3, 4, 5];
console.log(`| threat | level | ${costTiers.map((t) => `tier ${t}`).join(' | ')} |`);
console.log(`| --- | --- |${costTiers.map(() => ' --- |').join('')}`);
for (const key of [...new Set(costs.map((r) => `${r.threat}|${r.level}`))]) {
  const [threat, level] = key.split('|');
  const cells = costTiers.map((tier) => {
    const r = costs.find((c) => c.tier === tier && `${c.threat}|${c.level}` === key);
    return r ? `${pts(r.medium)} / ${pts(r.hard)}` : '';
  });
  console.log(`| ${threat} | ${level} | ${cells.join(' | ')} |`);
}

console.log('\n## Tier 3 protection (fitted party at tier end, elemental dungeons, no briefing: unprotected (target) / stones on gear / stones + Warding 2 + Spellweave 2)');
console.log('| dungeon | unprotected | stones | stones + families |');
console.log('| --- | --- | --- | --- |');
for (const row of elementalProtection(breakdownRuns)) {
  console.log(`| ${row.dungeonId} (${row.difficulty}, ${row.element}) | ${cell(row.unprotected, row.target)} (${row.target.map((v) => Math.round(v * 100)).join('–')}%) | ${pct0(row.stones)} | ${pct0(row.families)} |`);
}

familyTables();
console.log(`\n${((performance.now() - started) / 1000).toFixed(1)} s`);
