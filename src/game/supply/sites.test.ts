import { siteGroup, supplyRules } from '@/content/supplyLines';

import { distanceMeters } from '../generation/geo';
import { createInitialSave, type SaveData } from '../save';
import { checkPersonalSite, personalSites, siteQuality, sitesAround } from './sites';
import { emptySupply } from './state';
import type { PlaceSpawn } from '../places/generate';
import type { LatLng } from '../generation/types';

const origin: LatLng = { latitude: -41.2865, longitude: 174.7762 };
const now = Date.UTC(2026, 10, 2, 12);
const HOUR = 3_600_000;

/** Rules with no guarantee, so the personal site is always tried in the tests that want one. */
const noGuarantee = { ...supplyRules.sites, guaranteeMeters: 0 };

const save = (): SaveData => ({ ...createInitialSave(), supply: emptySupply(now) });

const spawn = (roll: number): PlaceSpawn => ({
  id: 'site:x',
  kind: 'site',
  group: siteGroup.id,
  tile: 't',
  position: origin,
  startsAt: now - HOUR,
  expiresAt: now + 6 * 24 * HOUR,
  roll,
});

describe('siteQuality', () => {
  it('draws the quality from the roll against the quality shares', () => {
    expect(siteQuality(spawn(0.0))).toBe(1);
    expect(siteQuality(spawn(0.49))).toBe(1);
    expect(siteQuality(spawn(0.5))).toBe(2);
    expect(siteQuality(spawn(0.84))).toBe(2);
    expect(siteQuality(spawn(0.85))).toBe(3);
    expect(siteQuality(spawn(0.99))).toBe(3);
  });
});

describe('sitesAround', () => {
  it('lists only sites, live at the time, and the same list every call', () => {
    const around = sitesAround(origin, now);
    expect(around.length).toBeGreaterThan(0);
    for (const site of around) expect(site.kind).toBe('site');
    expect(sitesAround(origin, now)).toEqual(around);
  });
});

describe('checkPersonalSite', () => {
  it('runs once per period: a second check of the same period changes nothing', () => {
    const first = checkPersonalSite(save(), origin, now, () => null, noGuarantee);
    expect(first.supply.personalSite?.period).toBeDefined();
    expect(checkPersonalSite(first, origin, now + HOUR, () => null, noGuarantee)).toBe(first);
  });

  it('settles on no spot when a world site sits within the guarantee', () => {
    // A guarantee of 10,000 km: every world site around counts, so no personal one is needed.
    const everywhere = { ...supplyRules.sites, guaranteeMeters: 10_000_000 };
    const checked = checkPersonalSite(save(), origin, now, () => null, everywhere);
    expect(checked.supply.personalSite).toMatchObject({ spot: null });
    expect(personalSites(checked, now)).toEqual([]);
  });

  it('takes the first snapped spot within its band, with the seeded id and roll', () => {
    const checked = checkPersonalSite(save(), origin, now, (point) => point, noGuarantee);
    const spot = checked.supply.personalSite!.spot!;
    expect(distanceMeters(origin, spot.position)).toBeGreaterThanOrEqual(supplyRules.sites.personal.meters[0]);
    expect(distanceMeters(origin, spot.position)).toBeLessThanOrEqual(supplyRules.sites.personal.meters[1]);
    expect(spot.id).toBe(`site:personal:${checked.playerSeed}:${checked.supply.personalSite!.period}`);
    expect(spot.roll).toBeGreaterThanOrEqual(0);
    expect(spot.roll).toBeLessThan(1);
    // The same seed gives the same spot again from a fresh save.
    const again = checkPersonalSite({ ...save(), playerSeed: checked.playerSeed }, origin, now, (point) => point, noGuarantee);
    expect(again.supply.personalSite).toEqual(checked.supply.personalSite);
  });

  it('skips spots the snap drops or pushes out of the band, and falls back to the first raw one', () => {
    let calls = 0;
    const snap = (point: LatLng): LatLng | null => {
      calls += 1;
      // The first spot cannot place; the second snaps home, out of band; the third is taken as it is.
      if (calls === 1) return null;
      if (calls === 2) return origin;
      return point;
    };
    const checked = checkPersonalSite(save(), origin, now, snap, { ...noGuarantee, personal: { meters: [300, 700], tries: 3 } });
    expect(calls).toBe(3);
    expect(checked.supply.personalSite!.spot).not.toBeNull();
    // Every snap failing falls back to the first raw spot, snapped or not.
    const none = checkPersonalSite(save(), origin, now, () => null, noGuarantee);
    const raw = none.supply.personalSite!.spot!;
    expect(distanceMeters(origin, raw.position)).toBeGreaterThanOrEqual(supplyRules.sites.personal.meters[0]);
  });
});

describe('personalSites', () => {
  it('shows the spot while its period lasts, and nothing after it', () => {
    const checked = checkPersonalSite(save(), origin, now, (point) => point, noGuarantee);
    const live = personalSites(checked, now);
    expect(live.map((site) => site.id)).toEqual([checked.supply.personalSite!.spot!.id]);
    expect(live[0].kind).toBe('site');
    expect(live[0].expiresAt).toBeGreaterThan(now);
    // Two days later the period has turned: the spot is gone.
    expect(personalSites(checked, now + 3 * 24 * HOUR)).toEqual([]);
  });

  it('shows nothing before any check ran', () => {
    expect(personalSites(save(), now)).toEqual([]);
  });
});
