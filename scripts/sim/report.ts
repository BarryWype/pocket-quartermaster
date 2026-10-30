import { materialById } from '@/content/lookup';

import { misses, type ProfileSummary, type Stat } from '@/game/sim/metrics';
import { inRange, targets } from '@/game/sim/targets';

export type ReportInput = {
  summaries: ProfileSummary[];
  rules: string[];
  settings: { seeds: number; seed: string; overrides: string[]; elapsed: number; date: string };
};

const WARN = '⚠';
const n = (value: number | null | undefined, digits = 0) => (value === null || value === undefined ? '—' : value.toFixed(digits));
const pct = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`);
const range = ([min, max]: [number, number], format: (v: number) => string = String) => `${format(min)}–${format(max)}`;
const spread = (s: Stat, format: (v: number | null) => string) => (s.reached > 1 && s.min !== s.max ? ` (${format(s.min)}–${format(s.max)})` : '');
const mark = (value: number | null, target: [number, number]) => (value === null || inRange(value, target) ? '' : ` ${WARN}`);
const name = (id: string) => materialById[id]?.name ?? id;

function table(head: string[], rows: string[][]) {
  if (!rows.length) return '_None._\n';
  return [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n') + '\n';
}

function pace(summaries: ProfileSummary[]) {
  const rows = summaries.map((s) => {
    const target = targets.daysPerTier[s.profile];
    return [
      s.profile,
      range(target),
      ...s.tiers.map((t) => `${n(t.days.median)}${spread(t.days, (v) => n(v))}${mark(t.days.median, target)}${t.days.reached < s.seeds ? ` (${t.days.reached}/${s.seeds} seeds)` : ''}`),
      `${s.finished}/${s.seeds}`,
      n(s.totalDays.median),
    ];
  });
  return table(['Profile', 'Target', 'Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5', 'Finished', 'Days to the end'], rows);
}

function odds(s: ProfileSummary) {
  const rows = s.tiers.map((t) => {
    const o = t.odds;
    const line = (l: typeof o.prepared) => `${pct(l.start.median)} → ${pct(l.probe.median)}${mark(l.probe.median, l.target)}`;
    const actual = (l: typeof o.prepared) => (l.runs ? `${pct(l.actual)} of ${l.runs}` : '—');
    return [String(t.tier), line(o.prepared), actual(o.prepared), line(o.unprepared), pct(o.gap.median), line(o.boss), actual(o.boss), line(o.events), actual(o.events)];
  });
  const head = [
    'Tier',
    `Prepared (${range(targets.odds.prepared, pct)})`,
    'Launched, won',
    `Not prepared (${range(targets.odds.unprepared, pct)})`,
    'Gap',
    `Boss (${range(targets.odds.boss, pct)})`,
    'Boss runs, won',
    `Events and patrols (${range(targets.odds.events, pct)})`,
    'Fought, won',
  ];
  return table(head, rows);
}

function loot(s: ProfileSummary) {
  const rows = s.loot.map((r) => [
    r.column,
    n(r.designed, 1),
    n(r.observed, 1),
    `${r.off >= 0 ? '+' : ''}${pct(r.off)}${Math.abs(r.off) > targets.lootPacing ? ` ${WARN}` : ''}`,
  ]);
  return table(['Category', 'pacing.py (per week)', 'Observed', 'Off'], rows);
}

const top = (record: Record<string, number>, count = 4) =>
  Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([k, v]) => `${k} ${Math.round(v)}`)
    .join(', ') || '—';

function gold(s: ProfileSummary) {
  const rows = s.tiers.map((t) => {
    const income = Object.values(t.gold.income).reduce((a, b) => a + b, 0);
    const spent = Object.values(t.gold.spend).reduce((a, b) => a + b, 0);
    return [String(t.tier), n(income), top(t.gold.income), n(spent), top(t.gold.spend), `${n(t.gold.growth.median)}${t.gold.surplus ? ` ${WARN} growing surplus` : ''}`];
  });
  return table(['Tier', 'Income', 'Mostly from', 'Spent', 'Mostly on', `Gold held, change over the tier (max ${targets.goldSurplusDays} days of income)`], rows);
}

function materials(s: ProfileSummary) {
  const rows = s.tiers.map((t) => [
    String(t.tier),
    name(t.material.id),
    n(t.material.gathered.median),
    n(t.material.spent.median),
    `${pct(t.material.share.median)}${t.material.share.median !== null && t.material.share.median < targets.materialSpent ? ` ${WARN}` : ''}`,
  ]);
  return table(['Tier', 'Main material', 'Gathered', 'Spent', `Spent share (min ${pct(targets.materialSpent)})`], rows);
}

function levels(s: ProfileSummary) {
  const rows = s.tiers.map((t) => {
    const band: [number, number] = [t.level.target - targets.levelSlack, t.level.target + targets.levelSlack];
    return [String(t.tier), range(band), `${n(t.level.end.median, 1)}${mark(t.level.end.median, band)}`];
  });
  return table(['Tier', 'Target (top of the band ±1)', 'Top 3 heroes at the tier’s end'], rows);
}

function health(s: ProfileSummary) {
  const h = s.health;
  const list = (ids: string[]) => (ids.length ? ids.join(', ') : 'none');
  return [
    '**Pile-ups** (stocks growing at every tier end, above ' + targets.pileUp + '): ' + (h.pileUps.map((p) => `${name(p.id)} (${p.final})`).join(', ') || 'none'),
    '',
    '**Dead content**',
    '',
    `- Consumables never carried or made: ${list(h.dead.items)}`,
    `- Recipes known but never crafted: ${list(h.dead.recipes)}`,
    `- Classes never fielded: ${list(h.dead.classes)}`,
    `- Places never visited: ${list(h.dead.places)}`,
    `- Dungeons never picked: ${list(h.dead.dungeons)}`,
    '',
    '**Class spread** (share of party slots)',
    '',
    table(
      ['Class', 'Share'],
      Object.entries(h.classSpread)
        .sort((a, b) => b[1] - a[1])
        .map(([c, v]) => [c, pct(v)]),
    ),
    '**Milestones** (day, median over seeds that got there)',
    '',
    table(
      ['Milestone', 'Day', 'Seeds'],
      Object.entries(h.milestones).map(([k, v]) => [k, `${n(v.median)}${spread(v, (x) => n(x))}`, `${v.reached}/${v.seeds}`]),
    ),
    '**Visits skipped** (median per game: nothing there, or odds too low)',
    '',
    table(['Activity', 'Skipped'], Object.entries(h.skipped).map(([k, v]) => [k, n(v)])),
  ].join('\n');
}

/** The markdown report: targets next to results, ⚠ on anything out of range. */
export function renderReport({ summaries, rules, settings }: ReportInput) {
  const regular = summaries.find((s) => s.profile === 'regular');
  const worst = misses(summaries).slice(0, 10);
  const out: string[] = [
    '# Simulator report',
    '',
    `Generated by \`npm run sim\` on ${settings.date}: ${settings.seeds} seeds per profile (seed "${settings.seed}"), ${settings.elapsed.toFixed(0)} s.` +
      (settings.overrides.length ? ` Overrides: ${settings.overrides.join(', ')}.` : ''),
    'Targets come from `doc/design/simulator/README.md`; ⚠ marks a result out of range. Medians over seeds, with the range in brackets.',
    '',
    '## Furthest from target',
    '',
    table(['Result', 'Value', 'Target'], worst.map((w) => [w.what, w.target.includes('%') || w.value < 1.5 ? n(w.value, 2) : n(w.value, 1), w.target])),
    '## Pace: days per tier',
    '',
    pace(summaries),
    '## Win odds per tier',
    '',
    'Probe: after every session, the best prepared party from the whole roster at full HP against every open normal dungeon of the tier, the tier boss, and the fight events and patrols around; "not prepared" is the same party and gear with the kit slots empty. Each probe cell reads "at the tier\u2019s first probe → at its last" (gear of the tier); the last is checked against the target. The column after each probe is what the bot actually launched.',
    '',
  ];
  for (const s of summaries) out.push(`### ${s.profile}`, '', odds(s));
  if (regular) out.push('## Loot pacing (regular)', '', loot(regular));
  out.push('## Gold per tier', '');
  for (const s of summaries) out.push(`### ${s.profile}`, '', gold(s));
  out.push('## Materials: the tier’s main material', '');
  for (const s of summaries) out.push(`### ${s.profile}`, '', materials(s));
  out.push('## Hero levels at the end of each tier', '');
  for (const s of summaries) out.push(`### ${s.profile}`, '', levels(s));
  out.push('## Health', '');
  for (const s of summaries) out.push(`### ${s.profile}`, '', health(s), '');
  out.push('## Bot rules', '', ...rules.map((r) => `- ${r}`), '');
  return out.join('\n');
}
