import { createRng } from './rng';

/** Hours run 0–24 in local time; a span wraps past midnight when `from` > `to`. */
type Span = [from: number, to: number];

export const ambienceConfig = {
  /** Colour washed over the map through the day, eased between these stops: [hour, colour, opacity]. */
  tint: [
    [0, '#13204a', 0.35],
    [5, '#13204a', 0.3],
    [6.5, '#ff9a4d', 0.15],
    [8, '#ff9a4d', 0],
    [17, '#ff8a3d', 0],
    [19, '#ff8a3d', 0.18],
    [20.5, '#13204a', 0.3],
    [24, '#13204a', 0.35],
  ] as [number, string, number][],
  fireflies: [20, 5] as Span,
  butterflies: [9, 18] as Span,
  smoke: [17, 8] as Span,
  mist: [5, 9] as Span,
  /** In each window, a shower of `minutes` happens with this chance, at a seeded time. */
  rain: { windowMinutes: 120, chance: 0.15, minutes: 12 },
};

export const inSpan = (hour: number, [from, to]: Span) => (from <= to ? hour >= from && hour < to : hour >= from || hour < to);

/** The tint at a local hour, as an rgb colour and an opacity. */
export function tintAt(hour: number, stops = ambienceConfig.tint) {
  const next = stops.findIndex(([at]) => at > hour);
  const [fromHour, fromColor, fromOpacity] = stops[Math.max(0, next - 1)];
  const [toHour, toColor, toOpacity] = stops[next === -1 ? stops.length - 1 : next];
  const t = toHour === fromHour ? 0 : (hour - fromHour) / (toHour - fromHour);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  const [r1, g1, b1] = rgb(fromColor);
  const [r2, g2, b2] = rgb(toColor);
  return { color: `rgb(${mix(r1, r2)}, ${mix(g1, g2)}, ${mix(b1, b2)})`, opacity: fromOpacity + (toOpacity - fromOpacity) * t };
}

/** Whether a shower is falling at this time; the same for every player. */
export function rainingAt(timeMs: number, rules = ambienceConfig.rain) {
  const windowMs = rules.windowMinutes * 60_000;
  const window = Math.floor(timeMs / windowMs);
  const rng = createRng(`rain|${window}`);
  if (!rng.chance(rules.chance)) return false;
  const start = window * windowMs + rng.next() * (windowMs - rules.minutes * 60_000);
  return timeMs >= start && timeMs < start + rules.minutes * 60_000;
}

function rgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}
