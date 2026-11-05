import { gathererRules } from '@/content/jobs';

import { offsetPosition } from '../generation/geo';
import type { LatLng } from '../generation/types';
import { addAnchor, gathererFinds } from '../jobs/gatherer';
import { assignJob } from '../jobs/jobs';
import { createInitialSave, type SaveData } from '../save';

const MINUTE = 60_000;
/** How fast a walking player moves; the bot's walk loop keeps the anchor at this pace too. */
export const playerMetersPerMinute = 80;
/** A fixed home and start, so the pace is measured on the same nodes every time. */
const HOME: LatLng = { latitude: 48.2, longitude: 7.6 };
const START = new Date(2026, 10, 2, 8).getTime();

/** A past-tutorial save with one hero on the gatherer, anchored at home just before the start; walking moves the anchor onward. */
function pacedSave(walking: boolean): SaveData {
  const base = createInitialSave('pace');
  let save: SaveData = { ...base, tools: ['woodPickaxe'], tutorial: { ...base.tutorial, step: 'done' } };
  save = assignJob(addAnchor(save, HOME, START - MINUTE), save.heroes[0].id, 'gatherer', START);
  if (!walking) return save;
  const every = gathererRules.anchorEveryMinutes;
  const steps = (gathererRules.capHours * 60) / every;
  for (let k = 1; k <= steps; k++) {
    save = addAnchor(save, offsetPosition(HOME, 0, k * every * playerMetersPerMinute), START + k * every * MINUTE);
  }
  return save;
}

/** The gatherer's nodes per hour under the real rules: anchored at home, and following a walking player. */
export function gathererPace(): { stillPerHour: number; walkingPerHour: number } {
  const hours = gathererRules.capHours;
  const span = hours * 60 * MINUTE;
  const rate = (walking: boolean) => gathererFinds(pacedSave(walking), 'gatherer', START, START + span).nodes.length / hours;
  return { stillPerHour: rate(false), walkingPerHour: rate(true) };
}
