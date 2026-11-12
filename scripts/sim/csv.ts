import type { RunLog } from '@/game/sim/bot';

const cell = (value: unknown) => {
  const text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function toCsv(rows: Record<string, unknown>[]) {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return [columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}

export function dailyCsv(logs: RunLog[]) {
  return toCsv(
    logs.flatMap((log) =>
      log.daily.map(({ stock, ...row }) => ({
        profile: log.profile,
        seed: log.seed,
        ...row,
        goldIn: log.goldIn.filter((g) => g.day === row.day).reduce((s, g) => s + g.amount, 0),
        goldOut: log.goldOut.filter((g) => g.day === row.day).reduce((s, g) => s + g.amount, 0),
        ...Object.fromEntries(Object.entries(stock).map(([k, v]) => [`stock_${k}`, v])),
      })),
    ),
  );
}

export function expeditionsCsv(logs: RunLog[]) {
  return toCsv(
    logs.flatMap((log) =>
      log.expeditions.map(({ classes, heroIds, rarities, effects, ...row }) => ({
        profile: log.profile,
        seed: log.seed,
        ...row,
        classes: classes.join(' '),
        heroIds: heroIds.join(' '),
        ...Object.fromEntries(Object.entries(rarities).map(([k, v]) => [`gear_${k}`, v])),
        effects: Object.entries(effects).map(([k, v]) => `${k}×${v}`).join(' '),
      })),
    ),
  );
}

export function craftsCsv(logs: RunLog[]) {
  return toCsv(
    logs.flatMap((log) =>
      log.crafts.map(({ materials, ...row }) => ({
        profile: log.profile,
        seed: log.seed,
        ...row,
        materials: Object.entries(materials).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(' '),
      })),
    ),
  );
}
