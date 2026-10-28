import { dungeonById, itemById, materialById } from '@/content/lookup';
import { guildBuildings, guildTrackById, type GuildBuildingId } from '@/content/guild';
import { dungeons } from '@/content/dungeons';
import { heroClasses } from '@/content/heroes';
import { dungeonTagWeights } from '@/game/dungeons/tags';
import type { Point, ProfileSummary, Stat } from '@/game/sim/metrics';
import { bossTarget, recruitTarget, targets } from '@/game/sim/targets';
import type { HeroClassId } from '@/game/types';

import type { Comparison } from './compare';
import type { Summary } from './lab';

// Reference categorical palette (light / dark); profiles take the first three slots.
const SERIES = [
  ['#2a78d6', '#3987e5'],
  ['#eb6834', '#d95926'],
  ['#1baf7a', '#199e70'],
  ['#eda100', '#c98500'],
  ['#e87ba4', '#d55181'],
  ['#008300', '#008300'],
  ['#6250d6', '#9085e9'],
  ['#e34948', '#e66767'],
];

const esc = (text: unknown) =>
  String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmt = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined ? '—' : n.toLocaleString('en', { maximumFractionDigits: digits });
const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${Math.round(n * 100)}%`);
const range = (s: Stat | undefined) =>
  !s || s.median === null ? `<span class="muted">not reached</span>` : `${s.median} <span class="muted">(${fmt(s.p10)}–${s.p90 === null ? '…' : s.p90})</span>`;
const materialName = (id: string) => materialById[id]?.name ?? id;

function table(head: string[], rows: string[][], className = '') {
  return `<div class="scroll"><table class="${className}"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}

function niceMax(value: number) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 2.5, 5, 10].map((m) => m * power).find((m) => m >= value)!;
}

const legend = (items: { name: string; slot: number }[]) =>
  items.length < 2 ? '' : `<div class="legend">${items.map((i) => `<span><i style="background:var(--s${i.slot})"></i>${esc(i.name)}</span>`).join('')}</div>`;

/** Lines with a shaded 10th–90th band; hover a day for the values. */
function lineChart(title: string, series: { name: string; points: Point[]; slot: number }[], format: (n: number) => string = (n) => fmt(n, 1)) {
  const W = 720, H = 220, L = 64, R = 12, T = 10, B = 26;
  const days = series[0]?.points.length ?? 0;
  if (!days) return '';
  const max = niceMax(Math.max(...series.flatMap((s) => s.points.map((p) => p.p90))));
  const x = (day: number) => L + ((day - 1) / Math.max(1, days - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const grid = ticks.map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${format(v)}</text>`).join('');
  const xTicks = Array.from({ length: days }, (_, i) => i + 1)
    .filter((d) => d === 1 || d % 5 === 0)
    .map((d) => `<text class="tick" x="${x(d)}" y="${H - 8}" text-anchor="middle">${d}</text>`)
    .join('');
  const marks = series
    .map((s) => {
      const band = [...s.points.map((p) => `${x(p.day)},${y(p.p90)}`), ...[...s.points].reverse().map((p) => `${x(p.day)},${y(p.p10)}`)].join(' ');
      const line = s.points.map((p) => `${x(p.day)},${y(p.median)}`).join(' ');
      return `<polygon points="${band}" fill="var(--s${s.slot})" opacity="0.14"/><polyline points="${line}" fill="none" stroke="var(--s${s.slot})" stroke-width="2" stroke-linejoin="round"/>`;
    })
    .join('');
  const hover = Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    const lines = series.map((s) => `${s.name}: ${format(s.points[i].median)} (${format(s.points[i].p10)}–${format(s.points[i].p90)})`).join('\n');
    const w = (W - L - R) / Math.max(1, days - 1);
    return `<rect class="hit" x="${x(day) - w / 2}" y="${T}" width="${w}" height="${H - T - B}"><title>Day ${day}\n${esc(lines)}</title></rect>`;
  }).join('');
  return `<figure><figcaption>${esc(title)}</figcaption>${legend(series)}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${grid}${xTicks}${marks}${hover}</svg></figure>`;
}

/** One bar per day, stacked by category; hover a segment for its value. */
function stackedBars(title: string, rows: { day: number; values: Record<string, number> }[], categories: string[]) {
  const W = 720, H = 200, L = 64, R = 12, T = 10, B = 26;
  if (!rows.length || !categories.length) return '';
  const max = niceMax(Math.max(...rows.map((r) => categories.reduce((s, c) => s + (r.values[c] ?? 0), 0))));
  const band = (W - L - R) / rows.length;
  const y = (v: number) => (v / max) * (H - T - B);
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const grid = ticks.map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${H - B - y(v)}" y2="${H - B - y(v)}"/><text class="tick" x="${L - 6}" y="${H - B - y(v) + 4}" text-anchor="end">${fmt(v)}</text>`).join('');
  const bars = rows
    .map((r, i) => {
      let base = H - B;
      const x = L + i * band + 1;
      const parts = categories.map((c, ci) => {
        const h = y(r.values[c] ?? 0);
        if (h <= 0) return '';
        base -= h;
        return `<rect x="${x}" y="${base}" width="${Math.max(1, band - 2)}" height="${Math.max(0, h - 1)}" fill="var(--s${ci + 1})"><title>Day ${r.day} · ${esc(c)}: ${fmt(r.values[c])}</title></rect>`;
      });
      const label = r.day === 1 || r.day % 5 === 0 ? `<text class="tick" x="${x + band / 2}" y="${H - 8}" text-anchor="middle">${r.day}</text>` : '';
      return parts.join('') + label;
    })
    .join('');
  return `<figure><figcaption>${esc(title)}</figcaption>${legend(categories.map((name, i) => ({ name, slot: i + 1 })))}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${grid}${bars}</svg></figure>`;
}

function milestoneLabel(key: string) {
  const [kind, arg] = key.split(':');
  switch (kind) {
    case 'pickaxe': return itemById[arg]?.name ?? arg;
    case 'boss': return `Tier ${arg} boss (${dungeonById[Object.keys(dungeonById).find((id) => dungeonById[id].isBoss && dungeonById[id].tier === Number(arg))!]?.name})`;
    case 'recruit': return `Hero #${arg}`;
    case 'guild': return `⭐ ${guildTrackById[arg as keyof typeof guildTrackById]?.name ?? arg}`;
    case 'building': return `${guildBuildings[arg as GuildBuildingId]?.name ?? arg} maxed`;
    case 'rare': return `First Rare or better, tier ${arg}`;
    case 'legendary': return `First Legendary, tier ${arg}`;
    case 'masteryCap': return `A mastery at the tier ${arg} cap`;
    case 'coreKit': return `Tier ${arg} core kit (sword, bow, wand, armour) known`;
    case 'firstStone': return 'First elemental stone';
    case 'firstSanctumWin': return 'First Sanctum win';
    default: return key;
  }
}

const MILESTONE_ORDER = ['boss', 'pickaxe', 'recruit', 'coreKit', 'guild', 'building', 'rare', 'legendary', 'masteryCap', 'firstStone', 'firstSanctumWin'];
const milestoneSort = (a: string, b: string) =>
  MILESTONE_ORDER.indexOf(a.split(':')[0]) - MILESTONE_ORDER.indexOf(b.split(':')[0]) || a.localeCompare(b, 'en', { numeric: true });

function section(id: string, title: string, body: string) {
  return `<section id="${id}"><h2>${title}</h2>${body}</section>`;
}

type ReportInput = { summary: Summary; comparison: Comparison | null; elapsed: number; rules: string[]; compareWith: string | null };

export function renderReport({ summary, comparison, elapsed, rules, compareWith }: ReportInput) {
  const names = Object.keys(summary.profiles);
  const ps = names.map((n) => summary.profiles[n]);
  const bySlot = (pick: (p: ProfileSummary) => Point[]) => ps.map((p, i) => ({ name: p.profile, points: pick(p), slot: i + 1 }));
  const s = summary.settings;

  const allWarnings = ps.flatMap((p) => p.warnings.map((w) => `<li><b>${p.profile}</b>: ${esc(w)}</li>`));
  const warningsBlock = allWarnings.length ? `<ul class="warnings">${allWarnings.join('')}</ul>` : '<p>No warnings.</p>';

  const compareBlock = comparison
    ? section(
        'compare',
        `Changes since ${esc(compareWith)}`,
        (comparison.warningsAdded.length ? `<p><b>New warnings</b></p><ul>${comparison.warningsAdded.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '') +
          (comparison.warningsRemoved.length ? `<p><b>Gone</b></p><ul>${comparison.warningsRemoved.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : '') +
          table(
            ['What', 'Before', 'After', 'Change'],
            comparison.changes.map((c) => [
              esc(c.key),
              fmt(c.before, 2),
              fmt(c.after, 2),
              `<span class="${c.big ? 'big' : 'muted'}">${c.change === null ? (c.before === null ? 'new' : 'gone') : `${c.change > 0 ? '+' : ''}${Math.round(c.change * 100)}%`}</span>`,
            ]),
          ),
      )
    : '';

  // 2. Milestones
  const keys = [...new Set(ps.flatMap((p) => Object.keys(p.milestones)))].sort(milestoneSort);
  const milestones = table(
    ['Milestone', ...names.map((n) => `${n}<br><span class="muted">day: median (10th–90th)</span>`)],
    keys.map((k) => [
      esc(milestoneLabel(k)),
      ...ps.map((p) => {
        const stat = p.milestones[k];
        const n = Number(k.split(':')[1]);
        const target = k.startsWith('boss:') ? bossTarget(n, p.profile) : k.startsWith('recruit:') && targets.recruitDays[n] ? recruitTarget(n, p.profile) : null;
        if (!target) return range(stat);
        const [min, max] = target;
        const off = !stat || stat.median === null ? max <= p.days : stat.median < min || stat.median > max;
        return `${range(stat)} <span class="${off ? 'flag' : 'ok'}">${off ? '⚠' : '✓'} target ${min}–${max}</span>`;
      }),
    ]),
  );

  // 3. Gold
  const sources = (p: ProfileSummary, kind: 'income' | 'spend') => Object.keys(p.gold[kind]).sort((a, b) => p.gold[kind][b] - p.gold[kind][a]);
  const gold =
    lineChart('Gold held', bySlot((p) => p.gold.held), (n) => fmt(n)) +
    ps
      .map(
        (p) =>
          `<h3>${p.profile}</h3>` +
          `<p>Spent ${pct(p.gold.spentShare)} of the gold earned (median run).</p>` +
          stackedBars('Gold in per day, by source (median)', p.gold.incomePerDay, sources(p, 'income')) +
          stackedBars('Gold out per day, by sink (median)', p.gold.spendPerDay, sources(p, 'spend')) +
          table(
            ['', ...sources(p, 'income'), 'total in', ...sources(p, 'spend'), 'total out'],
            [[
              'Median run total',
              ...sources(p, 'income').map((k) => fmt(p.gold.income[k])),
              `<b>${fmt(Object.values(p.gold.income).reduce((a, b) => a + b, 0))}</b>`,
              ...sources(p, 'spend').map((k) => fmt(p.gold.spend[k])),
              `<b>${fmt(Object.values(p.gold.spend).reduce((a, b) => a + b, 0))}</b>`,
            ]],
          ) +
          table(
            ['Gold per day while playing', ...sources(p, 'income')],
            Object.entries(p.gold.perDayByTier).map(([tier, v]) => [`Tier ${tier}`, ...sources(p, 'income').map((k) => fmt(v[k]))]),
          ),
      )
      .join('');

  // 4. Heroes
  const heroes =
    lineChart('Roster size', bySlot((p) => p.heroes.roster)) +
    lineChart('Average hero level', bySlot((p) => p.heroes.avgLevel)) +
    lineChart('Share of heroes left at home after each session', bySlot((p) => p.heroes.idle), pct) +
    table(['Profile', 'Idle share', 'Level on the last day (avg / max)'], ps.map((p) => [p.profile, pct(p.heroes.idleShare), `${fmt(p.heroes.avgLevel.at(-1)?.median, 1)} / ${fmt(p.heroes.maxLevel.at(-1)?.median)}`]));

  // 5. Materials
  const materials = ps
    .map((p) => {
      const ids = Object.keys({ ...p.materials.gathered, ...p.materials.used }).sort((a, b) => (p.materials.gathered[b] ?? 0) - (p.materials.gathered[a] ?? 0));
      return (
        `<h3>${p.profile}</h3>` +
        `<p>The daily walking bonus gathered ${pct(p.materials.bonusShare)} of all materials.</p>` +
        `<p>Bottleneck (most often missing for a wanted forge): ${Object.entries(p.materials.bottleneck)
          .filter(([, m]) => m)
          .map(([t, m]) => `tier ${t}: <b>${esc(materialName(m!))}</b>`)
          .join(' · ') || 'none'}</p>` +
        table(
          ['Material', 'Gathered', 'Used', 'Held at the end', 'Main sources'],
          ids.map((id) => {
            const top = Object.entries(p.materials.gatheredBySource[id] ?? {}).sort((a, b) => b[1] - a[1]).filter(([, n]) => n > 0).slice(0, 3);
            const unused = p.materials.neverUsed.includes(id);
            return [
              `${esc(materialName(id))}${unused ? ' <span class="flag">⚠ never used</span>' : ''}`,
              fmt(p.materials.gathered[id]),
              fmt(p.materials.used[id] ?? 0),
              fmt(p.materials.final[id] ?? 0),
              top.map(([src, n]) => `${src} ${fmt(n)}`).join(', '),
            ];
          }),
        )
      );
    })
    .join('');

  // 5b. Locked ore nodes seen on the measured walks (see walking.ts).
  const ORE_TIERS = [2, 3, 4];
  const nodes =
    `<p class="muted">Locked ore nodes seen on the measured walks, by the pickaxes owned: how many read as a minable ore (converted) and how many stayed greyed out, by the ore's own pickaxe tier (2 = copper, 3 = iron, 4 = coal).</p>` +
    table(
      ['Pickaxes owned', ...ORE_TIERS.flatMap((tier) => [`Tier ${tier} converted`, `Tier ${tier} greyed`])],
      summary.nodes
        .map((n, pickaxes) => ({ n, pickaxes }))
        .filter(({ pickaxes }) => pickaxes >= 1)
        .map(({ n, pickaxes }) => [
          String(pickaxes),
          ...ORE_TIERS.flatMap((tier) => [fmt(n.converted[tier] ?? 0), fmt(n.greyed[tier] ?? 0)]),
        ]),
    );

  // 6. Crafting
  const crafting = ps
    .map(
      (p) =>
        `<h3>${p.profile}</h3>` +
        table(
          ['Tier', 'Forges per run', 'At max mastery', 'Crappy', 'Normal', 'Rare', 'Legendary', 'Roll 1', 'Roll 2', 'Roll 3', 'Roll 4', 'Roll 5', 'Roll 6', 'Roll 7', 'Re-forges per run', 'Boss attempts per run', 'Worn at boss: Crappy / Normal / Rare / Legendary'],
          [1, 2, 3, 4, 5].map((t) => {
            const q = p.crafting.quality[t];
            const b = p.crafting.bossQuality[t];
            const r = p.crafting.rolls[t];
            return [
              String(t),
              fmt(p.crafting.forgesPerTier[t] ?? 0, 1),
              pct(p.crafting.maxedShare[t]),
              pct(q?.crappy), pct(q?.normal), pct(q?.rare), pct(q?.legendary),
              ...[1, 2, 3, 4, 5, 6, 7].map((scale) => (r ? pct(r[scale]) : '—')),
              fmt(p.crafting.reforges[t] ?? 0, 1),
              fmt(b?.attempts, 1),
              b ? `${b.crappy > 0.5 ? '<span class="flag">⚠</span> ' : ''}${pct(b.crappy)} / ${pct(b.normal)} / ${pct(b.rare)} / ${pct(b.legendary)}` : '—',
            ];
          }),
        ) +
        lineChart('Mastery level by type', Object.entries(p.crafting.mastery).map(([type, points], i) => ({ name: type, points, slot: i + 1 }))) +
        `<p>Returned by salvage (median run): ${Object.entries(p.crafting.salvageReturned).filter(([, n]) => n > 0).map(([m, n]) => `${esc(materialName(m))} ${fmt(n)}`).join(', ') || 'nothing'}</p>`,
    )
    .join('');

  // 7. Expeditions
  const expeditions = ps
    .map(
      (p) =>
        `<h3>${p.profile}</h3>` +
        table(
          ['Dungeon', 'Tier', 'Runs (per run / total)', 'Odds at launch', 'Won (95% interval)', 'Gold per hour', 'Outcomes'],
          Object.entries(p.expeditions.perDungeon)
            .sort((a, b) => a[1].tier - b[1].tier || b[1].runs - a[1].runs)
            .map(([id, d]) => {
              const off = d.total >= 20 && (d.predicted < d.interval[0] || d.predicted > d.interval[1]);
              return [
                esc(dungeonById[id]?.name ?? id) + (dungeonById[id]?.isBoss ? ' 👑' : ''),
                String(d.tier),
                `${fmt(d.runs, 1)} / ${d.total}`,
                pct(d.predicted),
                `${pct(d.actual)} <span class="muted">(${pct(d.interval[0])}–${pct(d.interval[1])})</span>${off ? ' <span class="flag">⚠ odds outside</span>' : ''}`,
                fmt(d.goldPerHour),
                Object.entries(d.outcomes).map(([o, n]) => `${o} ${n}`).join(', '),
              ];
            }),
        ) +
        table(
          ['Boss tier', 'Runs per day', 'Daily bonuses claimed per run', 'Party level at the first attempt'],
          Object.entries(p.expeditions.bosses).map(([tier, b]) => [tier, fmt(b.perDay, 1), fmt(b.bonuses, 1), fmt(b.firstLevel, 1)]),
        ) +
        `<p>Overnight quests: ${fmt(p.expeditions.overnight.runsPerDay, 2)} runs per day, bringing ${pct(p.expeditions.overnight.goldShare)} of the gold and ${pct(p.expeditions.overnight.xpShare)} of the XP. Daily guaranteed blueprints claimed: ${fmt(p.expeditions.blueprints, 1)} per run.</p>` +
        `<p>Sanctums per run: ${fmt(p.expeditions.sanctums.attempts, 1)} attempts, ${fmt(p.expeditions.sanctums.wins, 1)} wins.</p>` +
        table(
          ['Ability effect', 'Times per run (median)'],
          Object.entries(p.expeditions.effects).sort((a, b) => b[1] - a[1]).map(([k, n]) => [esc(k), fmt(n)]),
        ),
    )
    .join('');

  const className = (id: string) => (id in heroClasses ? heroClasses[id as HeroClassId].name : id === 'local' ? 'Locals’ tips' : id);
  const classes =
    `<p class="muted">Share of expeditions each class took part in, and what their abilities did (median times per run).</p>` +
    ps
      .map(
        (p) =>
          `<h3>${p.profile}</h3>` +
          table(
            ['Class', 'Share of expeditions', 'Ability triggers per run'],
            [...new Set([...Object.keys(p.expeditions.classShare), ...Object.keys(p.expeditions.classEffects)])]
              .sort((a, b) => (p.expeditions.classShare[b] ?? 0) - (p.expeditions.classShare[a] ?? 0))
              .map((c) => [
                esc(className(c)),
                pct(p.expeditions.classShare[c] ?? 0),
                Object.entries(p.expeditions.classEffects[c] ?? {})
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, n]) => `${esc(k)} ${fmt(n)}`)
                  .join(', ') || '—',
              ]),
          ),
      )
      .join('');

  // Tags: share of encounter weight carrying each tag, per tier (bosses count like `tagRules.bossWeight` encounters).
  const tagRows = [1, 2, 3, 4, 5].map((tier) => {
    const totals: Record<string, number> = {};
    for (const d of dungeons.filter((x) => x.tier === tier)) {
      const weights = dungeonTagWeights(d);
      const sum = Object.values(weights).reduce((a, b) => a + (b ?? 0), 0) || 1;
      for (const [tag, w] of Object.entries(weights)) totals[tag] = (totals[tag] ?? 0) + (w ?? 0) / sum;
    }
    const count = dungeons.filter((x) => x.tier === tier).length;
    return { tier, shares: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v / count])) };
  });
  const tagNames = [...new Set(tagRows.flatMap((r) => Object.keys(r.shares)))];
  const tags = table(
    ['Tier', ...tagNames.map((t) => esc(t))],
    tagRows.map((r) => [String(r.tier), ...tagNames.map((t) => (r.shares[t] ? pct(r.shares[t]) : '—'))]),
  );

  // 8. Odds matrix
  const cell = (v: number | undefined) =>
    v === undefined ? '—' : `<span class="heat" style="--v:${v.toFixed(2)}">${pct(v)}</span>`;
  const matrix = summary.oddsMatrix.length
    ? `<p class="muted">The three starting classes at the tier's expected level, every hero in the tier's weapon and armour at one quality, with a healing potion each, no traits. “Counter” swaps in the class that counters the dungeon best.</p>` +
      table(
        ['Dungeon', 'Tier', 'Crappy', 'Normal', 'Rare', 'Counter class', 'Crappy', 'Normal', 'Rare', 'Counter at Normal'],
        summary.oddsMatrix.map((r) => {
          const delta = r.counter ? Math.round((r.counter.odds.normal - r.base.normal) * 100) : null;
          return [
            esc(dungeonById[r.dungeonId]?.name ?? r.dungeonId) + (r.boss ? ' 👑' : ''),
            String(r.tier),
            cell(r.base.crappy), cell(r.base.normal), cell(r.base.rare),
            r.counter ? esc(heroClasses[r.counter.classId as HeroClassId].name) : '—',
            cell(r.counter?.odds.crappy), cell(r.counter?.odds.normal), cell(r.counter?.odds.rare),
            delta === null ? '—' : `${delta > 0 ? '+' : ''}${delta} pts`,
          ];
        }),
        'matrix',
      )
    : '<p class="muted">Skipped.</p>';

  // 7d. Provisions and HP
  const prov = (pick: (p: ProfileSummary['provisions']) => string) => ps.map((p) => pick(p.provisions));
  const foodTarget = targets.foodUse;
  const flag = (off: boolean) => `<span class="${off ? 'flag' : 'ok'}">${off ? '⚠' : '✓'}</span>`;
  const mealIds = [...new Set(ps.flatMap((p) => Object.keys(p.provisions.meals)))];
  const kitIds = [...new Set(ps.flatMap((p) => Object.keys(p.provisions.kits)))];
  const itemName = (id: string) => esc(itemById[id]?.name ?? id);
  const spam = summary.spam;
  const provisions =
    table(
      ['', ...names],
      [
        ['Average starting HP', ...prov((v) => pct(v.startHp))],
        ['Runs started below 70% HP', ...prov((v) => pct(v.lowStart))],
        ['Potions drunk at home / in dungeons (per run)', ...prov((v) => `${fmt(v.potionsAtHome, 1)} / ${fmt(v.potionsInDungeons, 1)}`)],
        ['Supply points used (per run)', ...prov((v) => fmt(v.supplyUsed))],
        ['Underfed runs', ...prov((v) => pct(v.underfed))],
        [`Starving runs (target under ${targets.starvingShare * 100}%)`, ...prov((v) => `${pct(v.starving)} ${flag(v.starving > targets.starvingShare)}`)],
        ['Emergency jerky bought (per run)', ...prov((v) => fmt(v.emergencySupply, 1))],
        [
          `Meat and berries: gathered → cooked (target ${foodTarget.map((x) => x * 100).join('–')}%)`,
          ...prov((v) => `${fmt(v.food.gathered)} → ${fmt(v.food.used)} (${pct(v.food.share)}) ${flag(v.food.share < foodTarget[0] || v.food.share > foodTarget[1])}`),
        ],
      ],
    ) +
    `<h3>Meals and kits (expeditions per run)</h3>` +
    table(
      ['Item', ...names],
      [
        ...mealIds.map((id) => [itemName(id), ...ps.map((p) => fmt(p.provisions.meals[id] ?? 0, 1))]),
        ...kitIds.map((id) => [
          `${itemName(id)} <span class="muted">taken / triggered</span>`,
          ...ps.map((p) => `${fmt(p.provisions.kits[id]?.taken ?? 0, 1)} / ${fmt(p.provisions.kits[id]?.triggered ?? 0, 1)}`),
        ]),
      ],
    ) +
    `<h3>Spam check</h3><p class="muted">One party at a time on ${esc(dungeonById[spam.dungeonId]?.name ?? spam.dungeonId)} for ${spam.hours} h, relaunched as soon as it is back, without potions: always the same 3 heroes, or the 3 healthiest of 6 (see spam.ts).</p>` +
    table(
      ['', 'XP per hour', 'Gold per hour'],
      [
        ['Same 3 heroes', fmt(spam.spam.xpPerHour), fmt(spam.spam.goldPerHour)],
        ['Rotating 6', fmt(spam.rotate.xpPerHour), fmt(spam.rotate.goldPerHour)],
        [`Ratio (target ×${targets.spamAdvantage})`, `×${spam.ratio.xp}`, `×${spam.ratio.gold} ${flag(!spam.ok)}`],
      ],
    );

  // 9. Guild Hall
  const guild =
    `<p class="muted">Days for a rank to earn back its cost, from the median gold per day the runs earned while playing the tier the rank opens at (see payback.ts).</p>` +
    table(
      ['Rank', 'Cost', 'Opens at tier', ...names.map((n) => `${n} (days)`)],
      (ps[0]?.guild.paybacks ?? []).map((m) => [
        `${guildTrackById[m.track].name} ${m.rank}`,
        fmt(m.cost),
        String(m.tier),
        ...ps.map((p) => {
          const r = p.guild.paybacks.find((x) => x.track === m.track && x.rank === m.rank);
          const off = r?.days !== null && r?.days !== undefined && (r.days < 3 || r.days > 7);
          return `${fmt(r?.days, 1)}${off ? ' <span class="flag">⚠</span>' : ''}`;
        }),
      ]),
    ) +
    table(['Building maxed (day)', ...names], (Object.keys(guildBuildings) as GuildBuildingId[]).map((b) => [guildBuildings[b].name, ...ps.map((p) => range(p.guild.buildings[b]))]));

  const body = [
    compareBlock,
    section('warnings-top', 'Warnings', warningsBlock),
    section(
      'rules',
      '1. Bot rules and run settings',
      `<p>Profiles: <b>${esc(s.profiles.join(', '))}</b> · ${s.days} days · ${s.runs} seeds from “${esc(s.seed)}” · walk efficiency ${s.walkEfficiency} · overrides: ${
        s.overrides.length ? s.overrides.map((o) => `<code>${esc(o)}</code>`).join(' ') : 'none'
      } · took ${elapsed.toFixed(1)} s</p><ol>${rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>`,
    ),
    section('milestones', '2. Milestones', milestones),
    section('gold', '3. Gold', gold),
    section('heroes', '4. Heroes', heroes),
    section('materials', '5. Materials', materials),
    section('nodes', '5b. Map nodes', nodes),
    section('crafting', '6. Crafting', crafting),
    section('expeditions', '7. Expeditions', expeditions),
    section('classes', '7b. Classes and abilities', classes),
    section('provisions', '7d. Provisions and HP', provisions),
    section('tags', '7c. Tags in encounters', `<p class="muted">Share of each tier's encounter weight that carries a tag, averaged over the tier's dungeons.</p>${tags}`),
    section('matrix', '8. Odds matrix', matrix),
    section('guild', '9. Guild Hall', guild),
    section('warnings', '10. Warnings', warningsBlock),
  ].join('');

  const light = SERIES.map(([l], i) => `--s${i + 1}:${l};`).join('');
  const dark = SERIES.map(([, d], i) => `--s${i + 1}:${d};`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Balance lab</title><style>
:root{color-scheme:light;--bg:#fcfcfb;--text:#0b0b0b;--muted:#52514e;--line:#e4e3df;--flag:#b3261e;--ok:#1b7f4b;--heat:42,120,214;${light}}
@media (prefers-color-scheme: dark){:root{color-scheme:dark;--bg:#1a1a19;--text:#f0efec;--muted:#c3c2b7;--line:#3a3a37;--flag:#ff8a80;--ok:#7bd8a4;--heat:57,135,229;${dark}}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,-apple-system,sans-serif}
main{max-width:1100px;margin:0 auto;padding:16px}h1{font-size:22px;margin:8px 0}h2{font-size:18px;margin:32px 0 8px;border-bottom:1px solid var(--line);padding-bottom:4px}h3{font-size:15px;margin:20px 0 6px}
nav{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:13px}nav a{color:var(--muted)}
.scroll{overflow-x:auto}table{border-collapse:collapse;margin:8px 0;font-variant-numeric:tabular-nums}th,td{padding:4px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-weight:600;font-size:12px}
.muted{color:var(--muted)}.flag{color:var(--flag);font-weight:600}.ok{color:var(--ok)}.big{color:var(--flag);font-weight:600}
.warnings li{margin:2px 0}figure{margin:12px 0}figcaption{font-weight:600;font-size:13px}svg{width:100%;height:auto;display:block}
.grid{stroke:var(--line);stroke-width:1}.tick{fill:var(--muted);font-size:11px}.hit{fill:transparent}.hit:hover{fill:var(--text);opacity:.06}
.legend{display:flex;gap:12px;font-size:12px;color:var(--muted);margin:4px 0}.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.heat{display:inline-block;min-width:44px;padding:0 6px;border-radius:4px;background:rgba(var(--heat),calc(var(--v)*.55))}
code{font-size:12px}
</style></head><body><main><h1>Balance lab</h1><nav>${[
    comparison ? ['compare', 'Changes'] : null,
    ['warnings-top', 'Warnings'], ['rules', 'Rules'], ['milestones', 'Milestones'], ['gold', 'Gold'], ['heroes', 'Heroes'], ['materials', 'Materials'], ['nodes', 'Map nodes'],
    ['crafting', 'Crafting'], ['expeditions', 'Expeditions'], ['classes', 'Classes'], ['provisions', 'Provisions'], ['tags', 'Tags'], ['matrix', 'Odds matrix'], ['guild', 'Guild Hall'],
  ]
    .filter((x): x is string[] => x !== null)
    .map(([id, name]) => `<a href="#${id}">${name}</a>`)
    .join('')}</nav>${body}</main></body></html>`;
}
