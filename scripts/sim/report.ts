import { materialById } from '@/content/lookup';
import { lootMatrix } from '@/content/loot/matrix';
import { gathererRules } from '@/content/jobs';
import { RARITIES } from '@/content/gear';
import { REVEAL_KINDS } from '@/content/reveal';
import { difficultyRules } from '@/content/difficulty';
import type { DifficultyOdds } from '@/game/sim/difficultyOdds';
import { affinityChanges } from '@/game/sim/affinity';
import { affixById } from '@/content/affixes';
import { FOCUS_FLAG, familyName, focusFlags, VENOM_RIVALS, type AffixRow, type FocusRow } from '@/game/sim/familyFocus';
import { cunningSpeedup, misses, type ProfileSummary, type Stat, type Summary } from '@/game/sim/metrics';
import { familyById, familyOfThreat, families } from '@/content/families';
import { gathererPace } from '@/game/sim/gathererPace';
import { inRange, targets } from '@/game/sim/targets';
import type { HeroClassId, ThreatId, WeaponType } from '@/game/types';

export type ReportInput = {
  summaries: ProfileSummary[];
  rules: string[];
  settings: { seeds: number; seed: string; overrides: string[]; elapsed: number; date: string };
  /** The reference roster's odds per tier and difficulty (summary.json's `difficultyOdds`). */
  difficultyOdds: Record<number, DifficultyOdds>;
  /** The family probes (summary.json's `familyProbes`). */
  familyProbes?: Summary['familyProbes'];
  /** The "Class affinity changes" section's table, measured with the quick odds machinery. */
  affinity?: string | null;
  /** A summary to compare days per tier against, e.g. a run with `--no-jobs`. */
  baseline?: Summary | null;
  /** The specials section carried over from the previous report, written by `npm run sim:specials`. */
  specials?: string | null;
};

/**
 * The favoured weapon lists before the weapon-types change (the pre-change
 * table): what the classes below favoured before crossbow, throwing, totem,
 * runestone and flasks joined the weapon types.
 */
export const OLD_FAVOURED_WEAPONS: Record<string, WeaponType[]> = {
  thief: ['sword', 'dagger', 'knuckles'],
  gambler: ['dagger', 'lute'],
  scout: ['dagger', 'bow', 'spear'],
  smuggler: ['dagger', 'bow'],
  engineer: ['axe', 'bow', 'warhammer'],
  druid: ['wand', 'staff'],
  scholar: ['wand', 'staff'],
  necromancer: ['wand', 'staff', 'censer'],
  alchemist: ['wand', 'censer'],
  curseBreaker: ['wand', 'staff', 'censer'],
};

/** The "Class affinity changes" table: each changed class's reference win odds per tier with its old vs new reference weapon. */
export function affinityTable(runs?: number) {
  const rows = affinityChanges(
    (Object.entries(OLD_FAVOURED_WEAPONS) as [HeroClassId, WeaponType[]][]).map(([classId, oldFavoured]) => ({ classId, oldFavoured })),
    runs,
  ).flatMap((c) => c.tiers.map((t) => [c.classId, String(t.tier), t.oldWeapon, t.newWeapon, pct(t.oldOdds), pct(t.newOdds)]));
  return table(['Class', 'Tier', 'Old reference weapon', 'New reference weapon', 'Old odds', 'New odds'], rows);
}

/** Win odds per family focus: each playstyle family's team per tier at level 3 and with its tags stripped, then the lift and its flag. */
export function familyFocusTable(rows: FocusRow[]) {
  const tiers = [...new Set(rows.map((r) => r.tier))];
  const flags = focusFlags(rows);
  const body = flags.map(({ family, lift, flag }) => {
    const mine = rows.filter((r) => r.family === family);
    return [
      `${familyName(family)} (${mine[0].classes.join(', ')})`,
      ...tiers.map((tier) => {
        const r = mine.find((row) => row.tier === tier)!;
        return `${pct(r.none)} → ${pct(r.level3)} (L${r.reached})`;
      }),
      `${n(lift * 100, 1)} pts`,
      flag === 'high' ? `${WARN} above ${FOCUS_FLAG.above}× median` : flag === 'low' ? `${WARN} below ${FOCUS_FLAG.below}× median` : flag === 'loot' ? 'loot family, not flagged' : '',
    ];
  });
  return table(['Family (team)', ...tiers.map((t) => `Tier ${t}: none → L3 (reached)`), 'Lift', 'Flag'], body);
}

/** The Venomous affix outside Venom parties against the rival weapon affixes, per tier and on average (flagged below half the rivals' median), with Venom 2 for comparison. */
export function venomTable(rows: AffixRow[]) {
  const avg = (pick: (r: AffixRow) => number) => rows.reduce((sum, r) => sum + pick(r), 0) / rows.length;
  const line = (label: string, lift: (pick: (r: AffixRow) => number) => number, flag = '') => [
    label,
    `${n(lift((r) => r.venomous) * 100, 1)}${flag}`,
    n(lift((r) => r.venom2) * 100, 1),
    ...VENOM_RIVALS.map((id) => n(lift((r) => r.rivals[id]) * 100, 1)),
  ];
  const body = rows.map((r) => line(`Tier ${r.tier} (${pct(r.plain)})`, (pick) => pick(r) - r.plain));
  const meanLift = (pick: (r: AffixRow) => number) => avg((r) => pick(r) - r.plain);
  const rivals = VENOM_RIVALS.map((id) => meanLift((r) => r.rivals[id])).sort((a, b) => a - b);
  const weak = meanLift((r) => r.venomous) < FOCUS_FLAG.below * rivals[Math.floor(rivals.length / 2)];
  body.push(line('Mean', meanLift, weak ? ` ${WARN} below ${FOCUS_FLAG.below}× the rivals’ median` : ''));
  return table(['Tier (odds with no affix)', 'Venomous (no Venom)', 'Venomous (Venom 2)', ...VENOM_RIVALS.map((id) => affixById[id].name)], body);
}

/** Components per week for the regular player on main before families step 4 (report of 2026-11-06), and the pacing plan's. */
const MAIN_COMPONENTS = { observed: 0.69, designed: 2.46, date: '2026-11-06' };

/** A Cunning 2 party faster than this over the game is flagged. */
const CUNNING_FLAG = 0.1;

/** One profile's Families tables: families reached, threats answered, natural parties, Cunning 2 pace and trophies. */
function familyProfile(s: ProfileSummary) {
  const tiers = s.families.filter((t) => t.runs > 0 || t.natural.probes > 0);
  const head = (first: string) => [first, ...tiers.map((t) => `Tier ${t.tier}`)];
  const reachedRows = families
    .filter((f) => tiers.some((t) => t.reached[f.id]))
    .map((f) => [
      f.name,
      ...tiers.map((t) => {
        const r = t.reached[f.id];
        return r ? `${pct(r[0])} / ${pct(r[1])} / ${pct(r[2])}` : '—';
      }),
    ]);
  const threatIds = [...new Set(tiers.flatMap((t) => Object.keys(t.threats)))];
  const threatRows = threatIds.map((id) => [
    `${id} (${familyById[familyOfThreat(id as ThreatId)].name})`,
    ...tiers.map((t) => {
      const c = t.threats[id];
      const seen = c ? c.met + c.half + c.full : 0;
      return seen ? `${pct(c.met / seen)} met, ${pct(c.half / seen)} half (${seen})` : '—';
    }),
  ]);
  const overall = cunningSpeedup(s.families);
  const hoursCell = (pair: [number, number] | null) => (pair ? `${n(pair[0], 1)} vs ${n(pair[1], 1)}` : '—');
  return [
    `**Families reached** (share of the tier’s dungeon runs with the family at level 1+ / 2+ / 3; ${tiers.map((t) => `tier ${t.tier}: ${t.runs} runs`).join(', ')})`,
    '',
    table(head('Family'), reachedRows),
    '',
    '**Threats answered** (share of the tier’s runs whose briefing had the threat: met, half met; runs in brackets)',
    '',
    table(head('Threat'), threatRows),
    '',
    '**Natural parties** (the probe’s not-prepared party: picked as if there were no threats, in fixed natural gear)',
    '',
    table(['Tier', 'Probes', 'Level 2+', 'Level 3'], tiers.map((t) => [String(t.tier), String(t.natural.probes), pct(t.natural.level2), pct(t.natural.level3)])),
    '',
    `**Cunning 2 pace** (runs with Cunning 2+ against the rest on the same dungeons; a cycle is launch to the session that collected the run, what limits runs a week). Over the game: ${overall === null ? '—' : `${n(overall * 100, 1)}% faster`}${overall !== null && overall > CUNNING_FLAG ? ` ${WARN} above ${CUNNING_FLAG * 100}%` : ''}.`,
    '',
    table(
      ['Tier', 'Cunning 2 runs', 'Run hours (with vs without)', 'Cycle hours (with vs without)', 'Faster'],
      tiers.map((t) => [String(t.tier), `${t.cunning.runs} (${pct(t.cunning.share)})`, hoursCell(t.cunning.hours), hoursCell(t.cunning.cycle), t.cunning.speedup === null ? '—' : `${n(t.cunning.speedup * 100, 1)}%`]),
    ),
    '',
    '**Trophies** (boss and elite trophies and a complete blueprint tier’s overflow, which replaced components; per seed over the tier)',
    '',
    table(
      ['Tier', 'Drops', 'A week', 'Gold', 'Monster parts', 'Relics', 'Stones'],
      s.families.map((t) => [String(t.tier), cellStat(t.trophies.drops), cellStat(t.trophies.perWeek, 1), cellStat(t.trophies.gold), cellStat(t.trophies.parts), cellStat(t.trophies.relics), cellStat(t.trophies.stones)]),
    ),
    '',
  ].join('\n');
}

/** A Stat as "median (min–max)". */
const cellStat = (st: Stat, digits = 0) => `${n(st.median, digits)}${spread(st, (v) => n(v, digits))}`;

/** The report's Families section. */
function familiesSection(summaries: ProfileSummary[], probes: Summary['familyProbes'] | undefined) {
  const out = [
    '## Families',
    '',
    'How the families play out: the family focus probe (each playstyle family at level 3 against the same team with its tags stripped, so only the family’s effects differ), the Venomous affix outside Venom parties, then per profile what the bot’s parties reached, how often each threat was answered, how often natural parties reach level 2 and 3 in real gear, how much faster Cunning 2 parties go, and what trophies bring.',
    '',
  ];
  if (probes) {
    out.push(
      '### Win odds per family focus',
      '',
      `Each playstyle family’s focus team (its first two classes, filled from the starting trio) at each tier’s end, in Uncommon gear of the tier and dressed to push the family, over the tier’s chain dungeons: odds with the family’s tags stripped → at level 3, and the level the team reaches in its own gear. Lift: level 3 minus none, averaged over the tiers. ${WARN} flags a lift above ${FOCUS_FLAG.above}× or below ${FOCUS_FLAG.below}× the median lift; Plunder (gold, parts and rarity, nothing in a fight) is shown but not flagged.`,
      '',
      familyFocusTable(probes.focus),
      '',
      '### Venomous outside Venom parties',
      '',
      `The reference trio at each tier’s end, each weapon with one more affix at the middle of its range: points of win odds over no affix. Venomous is measured outside a Venom party (Venom tags stripped: one poison per enemy) and with Venom 2 (stacks to 3); ${WARN} if its mean is below ${FOCUS_FLAG.below}× the rivals’ median.`,
      '',
      venomTable(probes.venom),
      '',
    );
  }
  out.push(
    `Components on main (report of ${MAIN_COMPONENTS.date}): ${MAIN_COMPONENTS.observed.toFixed(1)} a week for the regular player (${MAIN_COMPONENTS.designed.toFixed(1)} planned); compare with the trophies a week below.`,
    '',
  );
  for (const s of summaries) out.push(`### ${s.profile}`, '', familyProfile(s));
  return out;
}

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
    const difficulty = (d: 'easy' | 'medium' | 'hard') => {
      const l = o.difficulty[d];
      return `${pct(l.start.median)}${l.target.start ? mark(l.start.median, l.target.start) : ''} → ${pct(l.end.median)}${mark(l.end.median, l.target.end)}`;
    };
    const gap = (d: 'medium' | 'hard') => `${pct(o.gap[d].median)}${mark(o.gap[d].median, [targets.odds.threatGap[d], 1])}`;
    const runs = (l: { actual: number | null; runs: number }) => (l.runs ? `${pct(l.actual)} of ${l.runs}` : '—');
    const launched = (['easy', 'medium', 'hard'] as const).map((d) => runs(o.difficulty[d])).join(', ');
    return [
      String(t.tier),
      difficulty('easy'),
      difficulty('medium'),
      difficulty('hard'),
      launched,
      gap('medium'),
      gap('hard'),
      `${pct(o.boss.first.median)}${mark(o.boss.first.median, o.boss.target)} → ${pct(o.boss.last.median)}`,
      runs(o.boss),
      `${pct(o.events.start.median)} → ${pct(o.events.probe.median)}${mark(o.events.probe.median, o.events.target)}`,
      runs(o.events),
    ];
  });
  const span = (d: 'easy' | 'medium' | 'hard') => {
    const { start, end } = targets.odds.difficulty[d];
    return start ? `${range(start, pct)} → ${range(end, pct)}` : `end ${range(end, pct)}`;
  };
  const head = [
    'Tier',
    `Easy (${span('easy')})`,
    `Medium (${span('medium')})`,
    `Hard (${span('hard')})`,
    'Launched, won (easy, medium, hard)',
    `Medium gap (≥ ${pct(targets.odds.threatGap.medium)})`,
    `Hard gap (≥ ${pct(targets.odds.threatGap.hard)})`,
    `Boss, first attempts → last (${range(targets.odds.boss, pct)})`,
    'Boss runs, won',
    `Events and patrols (${range(targets.odds.events, pct)})`,
    'Fought, won',
  ];
  return table(head, rows);
}

function kindOdds(s: ProfileSummary) {
  const head = ['Kind', ...s.tiers.flatMap((t) => [`Tier ${t.tier} probe`, `Tier ${t.tier} fought, won`])];
  const rows = (s.tiers[0]?.odds.kinds ?? []).map((k) => [
    k.id,
    ...s.tiers.flatMap((t) => {
      const kind = t.odds.kinds.find((x) => x.id === k.id);
      if (!kind) return ['—', '—'];
      const probe = `${pct(kind.line.start.median)} → ${pct(kind.line.probe.median)}${mark(kind.line.probe.median, kind.line.target)}`;
      return [probe, kind.fought ? `${kind.fought}, ${kind.won}` : '—'];
    }),
  ]);
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

/** Pieces looted per tier by rarity (trinkets included, relics apart), with the per-day rates. */
function gearRarity(s: ProfileSummary) {
  const rareTarget = targets.gear.daysPerRare[s.profile];
  const legendaryMark = (stat: Stat) => (s.profile === 'regular' ? mark(stat.median, targets.gear.legendariesPerTier) : '');
  const rows = s.tiers.map((t) => {
    const g = t.gear;
    return [
      String(t.tier),
      ...RARITIES.map((rarity) => `${n(g.rarity[rarity].median)}${spread(g.rarity[rarity], (v) => n(v))}${rarity === 'legendary' ? legendaryMark(g.rarity[rarity]) : ''}`),
      `${n(g.relics.median)}${spread(g.relics, (v) => n(v))}`,
      n(g.uncommonPerDay.median, 2),
      n(g.rarePerDay.median, 2),
      g.daysPerRare.median === null ? '—' : `${n(g.daysPerRare.median, 1)}${rareTarget ? mark(g.daysPerRare.median, rareTarget) : ''}`,
    ];
  });
  const legendaryHead = s.profile === 'regular' ? `Legendary (${range(targets.gear.legendariesPerTier, (v) => n(v, 1))})` : 'Legendary';
  const rareHead = rareTarget ? `Days per Rare (${range(rareTarget, (v) => n(v))})` : 'Days per Rare';
  return table(['Tier', ...RARITIES.map((rarity) => (rarity === 'legendary' ? legendaryHead : capitalize(rarity))), 'Relics', 'Uncommon/day', 'Rare/day', rareHead], rows);
}

/** The observed rarity split of looted pieces by the ladder their loot source rolls on. */
function gearLadders(s: ProfileSummary) {
  const rows = s.ladders.map((l) => [l.ladder, n(l.drops.median), ...RARITIES.map((rarity) => pct(l.split[rarity]))]);
  return table(['Ladder', 'Drops per game', ...RARITIES.map(capitalize)], rows);
}

/** Pieces gained per week by source (medians over seeds), gear and trinkets apart, with the Rares and Legendaries among them. */
function gearSources(s: ProfileSummary) {
  const label = (source: ProfileSummary['gearSources'][number]['source']) =>
    source === 'total' ? '**Loot total**' : source === 'shop' ? 'Shops (work tools)' : lootMatrix[source].name;
  const { piecesPerWeek } = targets.gear;
  const band: [number, number] = [piecesPerWeek * (1 - targets.lootPacing), piecesPerWeek * (1 + targets.lootPacing)];
  const rows = s.gearSources.map((r) => [
    r.group,
    label(r.source),
    `${n(r.gear.median, 1)}${r.source === 'total' && s.profile === 'regular' ? mark(r.gear.median, band) : ''}`,
    n(r.trinkets.median, 1),
    n(r.rare.median, 2),
    n(r.legendary.median, 2),
    r.rare.median ? n(7 / r.rare.median, 1) : '—',
  ]);
  return table(['Group', 'Source', s.profile === 'regular' ? `Gear/week (${piecesPerWeek} ± ${targets.lootPacing * 100}%)` : 'Gear/week', 'Trinkets/week', 'Rare/week', 'Legendary/week', 'Days per Rare'], rows);
}

/** The share of the roster's trinket slots holding loot trinkets, sampled daily and averaged over each tier. */
function lootTrinketSlots(s: ProfileSummary) {
  return table(['Tier', 'Loot trinket slots'], s.tiers.map((t) => [String(t.tier), pct(t.lootTrinkets.median)]));
}

/** Affixes and helmets worn at each tier's end, and the gear actions over the tier. */
function gearActions(s: ProfileSummary) {
  const rows = s.tiers.map((t) => {
    const g = t.gear;
    const materials =
      Object.entries(g.rerollMaterials)
        .map(([id, amount]) => `${name(id)} ${Math.round(amount)}`)
        .join(', ') || '—';
    return [
      String(t.tier),
      `${n(g.affixes.median, 1)}${spread(g.affixes, (v) => n(v, 1))}`,
      pct(g.helmets.median),
      `${n(g.rerolls.median)}${spread(g.rerolls, (v) => n(v))}`,
      n(g.rerollGold.median),
      materials,
      `${n(g.stones.median)}${spread(g.stones, (v) => n(v))}`,
      `${n(g.forges.median)}${spread(g.forges, (v) => n(v))}`,
    ];
  });
  return table(['Tier', 'Affixes per hero', 'Heroes in a helmet', 'Rerolls', 'Gold on rerolls', 'Reroll materials', 'Stones applied', 'Ingredient forges'], rows);
}

const capitalize = (word: string) => word[0].toUpperCase() + word.slice(1);

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

/** Wood per day over each tier, and the woodcutter's share of what was spent. */
function jobsTable(s: ProfileSummary) {
  const rows = s.tiers.map((t) => {
    const w = t.wood;
    return [
      String(t.tier),
      n(w?.walked.median, 1),
      n(w?.spent.median, 1),
      n(w?.woodcutter.median, 1),
      `${pct(w?.share.median)}${w && w.share.median !== null ? mark(w.share.median, targets.woodcutterShare) : ''}`,
    ];
  });
  return table(['Tier', 'Wood walked/day', 'Wood spent/day', 'Woodcutter/day', `Woodcutter share (target ${range(targets.woodcutterShare, pct)})`], rows);
}

/** Each job's material over each tier: what walking brought in, what the job added, and the job's share of the walk. */
function jobsVsWalking(s: ProfileSummary) {
  const rows = s.tiers.flatMap((t) =>
    Object.entries(t.jobs ?? {})
      .filter(([, j]) => (j.fromJob.median ?? 0) > 0 || (j.walked.median ?? 0) > 0)
      .map(([material, j]) => [
        String(t.tier),
        j.job,
        name(material),
        n(j.walked.median, 1),
        n(j.fromJob.median, 1),
        `${pct(j.share.median)}${j.share.median !== null && j.share.median > targets.jobShareMax ? ` ${WARN}` : ''}`,
      ]),
  );
  return table(['Tier', 'Job', 'Material', 'Walked/day', 'Job/day', `Share of walking (max ${pct(targets.jobShareMax)})`], rows);
}

/** Each station's work tool over each tier: job output per day with and without the tool, scavenge per day, against the walking intake. */
function toolsTable(s: ProfileSummary) {
  const rows = s.tiers.flatMap((t) =>
    Object.entries(t.tools ?? {})
      .filter(([, x]) => (x.withTool.median ?? 0) > 0 || (x.withoutTool.median ?? 0) > 0 || (x.scavenge.median ?? 0) > 0)
      .map(([material, x]) => [
        String(t.tier),
        x.job,
        name(material),
        n(x.withTool.median, 1),
        n(x.withoutTool.median, 1),
        n(x.scavenge.median, 1),
        n(x.walked.median, 1),
        `${pct(x.share.median)}${x.share.median !== null && x.share.median > targets.jobShareMax ? ` ${WARN}` : ''}`,
      ]),
  );
  return table(['Tier', 'Job', 'Material', 'Job/day with tool', 'Job/day without tool', 'Scavenge/day', 'Walked/day', `Share of walking, job + scavenge (max ${pct(targets.jobShareMax)})`], rows);
}

/** The gatherer's nodes gathered and wounds settled per day, per tier. */
function gathererNodes(s: ProfileSummary) {
  const rows = s.tiers.map((t) => [String(t.tier), n(t.gatherer?.nodes.median, 1), n(t.gatherer?.wounds.median, 1)]);
  return table(['Tier', 'Nodes/day', 'Wounds/day'], rows);
}

/** The gatherer's materials over each tier, against the same walking intake as the guild jobs. */
function gathererVsWalking(s: ProfileSummary) {
  const rows = s.tiers.flatMap((t) =>
    Object.entries(t.gatherer?.materials ?? {})
      .filter(([, m]) => (m.fromJob.median ?? 0) > 0 || (m.walked.median ?? 0) > 0)
      .map(([material, m]) => [
        String(t.tier),
        name(material),
        n(m.walked.median, 1),
        n(m.fromJob.median, 1),
        `${pct(m.share.median)}${m.share.median !== null && m.share.median > targets.gathererShareMax ? ` ${WARN}` : ''}`,
      ]),
  );
  return table(['Tier', 'Material', 'Walked/day', 'Gatherer/day', `Share of walking (max ${pct(targets.gathererShareMax)})`], rows);
}

/** Days per tier against a baseline run (e.g. with `--no-jobs`). */
function baselineTable(s: ProfileSummary, baseline: Summary) {
  const before = baseline.profiles[s.profile];
  const rows = s.tiers.map((t) => [String(t.tier), n(before?.tiers[t.tier - 1]?.days.median ?? null), n(t.days.median)]);
  return table(['Tier', 'Days before', 'Days after'], rows);
}

/** The median day each map kind first shows, per profile; no target. */
function reveals(summaries: ProfileSummary[]) {
  const rows = REVEAL_KINDS.map((kind) => [kind, ...summaries.map((s) => n(s.reveals[kind].median))]);
  return table(['Kind', ...summaries.map((s) => s.profile)], rows);
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
    `- Classes never offered: ${list(h.classes.neverOffered)}`,
    `- Classes offered but never recruited: ${list(h.classes.offeredNeverRecruited)}`,
    `- Classes recruited but never fielded: ${list(h.classes.recruitedNeverFielded)}`,
    `- Places never visited: ${list(h.dead.places)}`,
    `- Dungeons never picked: ${list(h.dead.dungeons)}`,
    '',
    '**Classes** (offers seen, heroes recruited and party slots fielded, over all seeds; the starting trio is never offered or recruited)',
    '',
    table(
      ['Class', 'Offered', 'Recruited', 'Fielded', 'Share of slots'],
      Object.entries(h.classCounts)
        .sort((a, b) => b[1].fielded - a[1].fielded || b[1].offered - a[1].offered)
        .map(([c, v]) => [c, String(v.offered), String(v.recruited), String(v.fielded), pct(h.classSpread[c] ?? 0)]),
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

function visitsTable(s: ProfileSummary) {
  return table(
    ['Activity', 'Planned visits/day', 'Done visits/day (median)'],
    s.visits.map((v) => [v.activity, n(v.planned, 2), n(v.done.median, 2)]),
  );
}

const NOT_LAUNCHED_LABELS: Record<string, string> = {
  noParty: 'No free party (heroes away or resting)',
  hp: 'HP too low',
  odds: 'Odds below the threshold',
  noSession: 'No session left',
};

const NOT_DONE_LABELS: Record<string, string> = {
  nothing: 'Nothing there',
  odds: 'Odds too low',
  noParty: 'No free party',
  hidden: 'Hidden by the reveal',
};

/** One reason table: every reason in its fixed order, even at 0. */
function reasonsTable(labels: Record<string, string>, stats: Record<string, Stat>) {
  return table(['Reason', 'Per day'], Object.entries(labels).map(([key, label]) => [label, n(stats[key]?.median ?? null, 2)]));
}

/** The reference roster's odds per tier and difficulty, the fitting script's target table. */
function difficultyTable(difficultyOdds: Record<number, DifficultyOdds>) {
  const cell = (value: number, range: [number, number] | null) => `${pct(value)}${range ? mark(value, range) : ''}`;
  const rows = Object.entries(difficultyOdds)
    .map(([tier, odds]) => Number(tier))
    .sort((a, b) => a - b)
    .map((tier) =>
      [
        String(tier),
        ...(['easy', 'medium', 'hard'] as const).flatMap((d) => [
          cell(difficultyOdds[tier][d].start, difficultyRules.oddsTargets[d].start),
          cell(difficultyOdds[tier][d].end, difficultyRules.oddsTargets[d].end),
        ]),
      ].join(' | '),
    );
  return ['| Tier | easy start | easy end | medium start | medium end | hard start | hard end |', '| --- | --- | --- | --- | --- | --- | --- |', ...rows.map((r) => `| ${r} |`)].join('\n') + '\n';
}

/** The specials section between its markers, carried over from the previous report (written by `npm run sim:specials`). */
export function specialsBlock(markdown: string): string | null {
  const start = markdown.indexOf('<!-- specials -->');
  const end = markdown.indexOf('<!-- /specials -->');
  return start !== -1 && end !== -1 ? markdown.slice(start, end + '<!-- /specials -->'.length) : null;
}

/** The markdown report: targets next to results, ⚠ on anything out of range. */
export function renderReport({ summaries, rules, settings, difficultyOdds, familyProbes, affinity, baseline, specials }: ReportInput) {
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
    'Probe: after the day\u2019s last session every `probeEveryDays` days (and after the first session of a new tier and every session the tier boss is out), the best prepared party from the whole roster at full HP (the bot\u2019s own pick, `suggestParty`) against every open normal dungeon of the tier, the tier boss once it opens, and the fight events and patrols around. Each difficulty reads "at the end of its first day in the tier → at its last probe" (dungeons open in chain order, so medium and hard start later than easy); the end is checked, and the start for easy only. The gap is prepared minus the briefing skipped (the strongest party picked as if there were no threats, the roster in fixed natural gear, no consumables) over the same dungeons at the tier\u2019s last probe. The boss reads "first attempts (its probes on the day it first opens) → last probe"; the first attempts are checked.',
    '',
  ];
  for (const s of summaries) out.push(`### ${s.profile}`, '', odds(s));
  out.push(
    '## Difficulty odds (reference roster)',
    '',
    'The fitting script\u2019s target table: each tier\u2019s sources of each difficulty, for the party the bot would send from the reference roster at the tier\u2019s start and end (see rosterSave in src/game/sim/reference.ts and src/game/sim/difficultyOdds.ts). ⚠ marks an odds outside its difficulty\u2019s target range.',
    '',
    difficultyTable(difficultyOdds),
  );
  if (affinity)
    out.push(
      '## Class affinity changes',
      '',
      'Each class whose favoured weapons changed: the reference team’s win odds per tier with its old reference weapon (picked from the pre-change favoured list) against its new one, measured with the quick odds machinery (src/game/sim/affinity.ts).',
      '',
      affinity,
      '',
    );
  out.push(...familiesSection(summaries, familyProbes));
  if (specials) out.push(specials);
  out.push(
    '## Events and patrols by kind',
    '',
    'The same probe and fight record split by kind: each patrol kind and each fight event kind.',
    '',
  );
  for (const s of summaries) out.push(`### ${s.profile}`, '', kindOdds(s));
  out.push(
    '## Visits planned vs done',
    '',
    'Each activity: the profile’s planned visits per day next to the median over seeds of visits done per day. Below each, why expeditions went unlaunched and places undone: "No session left" is the day’s whole planned expeditions still owed after its last session, which had just sent a party out. A visit owed for a kind the reveal still hides is kept back and made once the kind shows, not lost.',
    '',
  );
  for (const s of summaries)
    out.push(
      `### ${s.profile}`,
      '',
      visitsTable(s),
      '',
      '**Expeditions not launched (per day, median)**',
      '',
      reasonsTable(NOT_LAUNCHED_LABELS, s.notLaunched),
      '',
      '**Places not done (per day, median)**',
      '',
      reasonsTable(NOT_DONE_LABELS, s.placesNotDone),
      '',
    );
  if (regular) out.push('## Loot pacing (regular)', '', loot(regular));
  out.push(
    '## Gear',
    '',
    'The gear system across the games: pieces looted per tier by rarity (trinkets included, relics apart) with their per-day rates, the pieces gained per week by source (gear and trinkets apart; the Rares and Legendaries among them; first-win and first-clear bonuses count with their dungeon run or boss), the rarity split by the loot ladder the piece’s source rolls on, the affixes and helmets worn at each tier’s end, the share of the roster’s trinket slots holding loot trinkets, and the gear actions — rerolls (gold and materials), elemental stones and ingredient forges. Tier times and win odds are in the pace and odds tables above.',
    '',
  );
  for (const s of summaries)
    out.push(`### ${s.profile}`, '', gearRarity(s), '', gearSources(s), '', gearLadders(s), '', gearActions(s), '', lootTrinketSlots(s), '');
  out.push('## Gold per tier', '');
  for (const s of summaries) out.push(`### ${s.profile}`, '', gold(s));
  out.push('## Materials: the tier’s main material', '');
  for (const s of summaries) out.push(`### ${s.profile}`, '', materials(s));
  out.push(
    '## Jobs',
    '',
    'Every guild job over each tier: wood for the woodcutter, then each job’s materials — what walking and the map brought in, what the job added, and the job’s share of that walking (walk first).',
    '',
  );
  const gatherer = gathererPace();
  out.push(
    `Gatherer pace (rules, ${gathererRules.minMinutesPerNode} min per node at most): ${gatherer.stillPerHour.toFixed(1)} nodes/h while still, ${gatherer.walkingPerHour.toFixed(1)} nodes/h while walking.`,
    '',
  );
  for (const s of summaries)
    out.push(`### ${s.profile}`, '', jobsTable(s), '', '**Jobs vs walking**', '', jobsVsWalking(s), '', '**Work tools**', '', toolsTable(s), '', '**Outdoor gatherer**', '', gathererNodes(s), '', gathererVsWalking(s), '');
  out.push(
    'The bot collects every station at the start of a session, recalls a worker whenever a send needs them, and staffs every open station at the end of a session — the one shortest of its material first, so a worker never costs a party member; the miner digs the unlocked ore the bot holds least of (see the Jobs rule under Bot rules).',
    '',
  );
  if (baseline) {
    for (const s of summaries) out.push(`### ${s.profile}`, '', baselineTable(s, baseline));
  } else {
    out.push('Days per tier before jobs: run with `--no-jobs` for a baseline, then pass that summary with `--baseline <summary.json>`.', '');
  }
  out.push('## Hero levels at the end of each tier', '');
  for (const s of summaries) out.push(`### ${s.profile}`, '', levels(s));
  out.push('## Reveal days', '', 'The median day each map kind first shows (the gradual reveal); no target.', '', reveals(summaries));
  out.push('## Health', '');
  for (const s of summaries) out.push(`### ${s.profile}`, '', health(s), '');
  out.push('## Bot rules', '', ...rules.map((r) => `- ${r}`), '');
  return out.join('\n');
}
