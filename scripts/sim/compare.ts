import type { Summary } from './lab';

export type Change = { key: string; before: number | null; after: number | null; change: number | null; big: boolean };
export type Comparison = { changes: Change[]; warningsAdded: string[]; warningsRemoved: string[] };

/** The numbers compare mode looks at, by a readable key. */
function flatten(summary: Summary): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const [name, p] of Object.entries(summary.profiles)) {
    for (const [key, s] of Object.entries(p.milestones)) out[`${name} · milestone ${key} (day)`] = s.median;
    for (const [key, v] of Object.entries(p.gold.income)) out[`${name} · gold in · ${key}`] = v;
    for (const [key, v] of Object.entries(p.gold.spend)) out[`${name} · gold out · ${key}`] = v;
    out[`${name} · gold held at the end`] = p.gold.final.median;
    out[`${name} · idle share`] = p.heroes.idleShare;
    if (p.provisions) {
      out[`${name} · food use share`] = p.provisions.food.share;
      out[`${name} · starting HP`] = p.provisions.startHp;
      out[`${name} · starving share`] = p.provisions.starving;
    }
    for (const [tier, q] of Object.entries(p.crafting.quality)) {
      for (const [quality, share] of Object.entries(q)) out[`${name} · tier ${tier} ${quality} share`] = share;
    }
  }
  return out;
}

export function compare(before: Summary, after: Summary, threshold: number): Comparison {
  const a = flatten(before);
  const b = flatten(after);
  const changes = [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .map((key) => {
      const was = a[key] ?? null;
      const now = b[key] ?? null;
      const change = was !== null && now !== null && was !== 0 ? (now - was) / Math.abs(was) : null;
      return { key, before: was, after: now, change, big: change === null ? was !== now : Math.abs(change) > threshold };
    })
    .filter((c) => c.before !== c.after)
    .sort((x, y) => Number(y.big) - Number(x.big) || x.key.localeCompare(y.key));
  const warnings = (s: Summary) => Object.entries(s.profiles).flatMap(([name, p]) => p.warnings.map((w) => `${name}: ${w}`));
  const old = new Set(warnings(before));
  const fresh = new Set(warnings(after));
  return {
    changes,
    warningsAdded: [...fresh].filter((w) => !old.has(w)),
    warningsRemoved: [...old].filter((w) => !fresh.has(w)),
  };
}
