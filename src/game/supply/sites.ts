import { placeRules, type PlaceGroup } from '@/content/places';
import { siteGroup, supplyRules } from '@/content/supplyLines';

import { distanceMeters, offsetPosition } from '../generation/geo';
import { localDayStart } from '../generation/localDays';
import { createRng } from '../generation/rng';
import { tilesAround } from '../generation/tiles';
import type { LatLng } from '../generation/types';
import { generateTilePlaces, type PlaceSpawn } from '../places/generate';
import type { SaveData } from '../save';
import { tavernPeriod, tavernPeriodEnd } from '../taverns/personal';

type SiteRules = {
  qualityShares: number[];
  guaranteeMeters: number;
  personal: { meters: [number, number]; tries: number };
};

/** The site's quality: drawn from the spawn's roll against the quality shares. */
export function siteQuality(spawn: PlaceSpawn, rules: Pick<SiteRules, 'qualityShares'> = supplyRules.sites): 1 | 2 | 3 {
  const [one, two] = rules.qualityShares;
  return spawn.roll < one ? 1 : spawn.roll < one + two ? 2 : 3;
}

/** Every world site around a position at a time (the site group is not among the map's). */
export function sitesAround(position: LatLng, timeMs: number, group: PlaceGroup = siteGroup): PlaceSpawn[] {
  return tilesAround(position, group.precision).flatMap((tile) => generateTilePlaces(group, tile, timeMs));
}

/** The period's candidate spots for the personal site, drawn from the save's seed. */
export function personalSiteSpots(save: SaveData, origin: LatLng, now: number, rules: SiteRules = supplyRules.sites): LatLng[] {
  const period = tavernPeriod(now);
  const rng = createRng(`personal-site|${save.playerSeed}|${period}`);
  return Array.from({ length: rules.personal.tries }, () => {
    const bearing = rng.next() * 2 * Math.PI;
    const distance = rng.int(...rules.personal.meters);
    return offsetPosition(origin, Math.cos(bearing) * distance, Math.sin(bearing) * distance);
  });
}

/**
 * The period's site guarantee: the period's first map position either has a
 * world site within `guaranteeMeters`, or gets a personal one on the first
 * candidate spot that snaps (via `snap`, null when it cannot) within its band —
 * the first raw spot when none does. Ran once per period; returns the same save
 * when nothing changes.
 */
export function checkPersonalSite(
  save: SaveData,
  origin: LatLng,
  now: number,
  snap: (point: LatLng) => LatLng | null,
  rules: SiteRules = supplyRules.sites,
): SaveData {
  const period = tavernPeriod(now);
  if (save.supply.personalSite?.period === period) return save;
  const worldNear = sitesAround(origin, now).some(
    (site) =>
      site.kind === 'site' && site.startsAt <= now && now < site.expiresAt && distanceMeters(origin, site.position) <= rules.guaranteeMeters,
  );
  if (worldNear) return { ...save, supply: { ...save.supply, personalSite: { period, spot: null } } };
  const spots = personalSiteSpots(save, origin, now, rules);
  const id = `site:personal:${save.playerSeed}:${period}`;
  const roll = createRng(id).next();
  for (const spot of spots) {
    const position = snap(spot);
    if (position === null) continue;
    const distance = distanceMeters(origin, position);
    if (distance >= rules.personal.meters[0] && distance <= rules.personal.meters[1]) {
      return { ...save, supply: { ...save.supply, personalSite: { period, spot: { id, position, roll } } } };
    }
  }
  return { ...save, supply: { ...save.supply, personalSite: { period, spot: { id, position: spots[0], roll } } } };
}

/** The personal site of the period, while its check's spot is set: it lives until the period ends. */
export function personalSites(save: SaveData, now: number): PlaceSpawn[] {
  const { spot, period } = save.supply.personalSite ?? {};
  if (!spot || period !== tavernPeriod(now)) return [];
  return [
    {
      id: spot.id,
      kind: 'site',
      group: siteGroup.id,
      tile: 'personal',
      position: spot.position,
      startsAt: localDayStart(period * 2, placeRules.changeHourLocal),
      expiresAt: tavernPeriodEnd(period),
      roll: spot.roll,
    },
  ];
}
