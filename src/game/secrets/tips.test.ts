import { secretRules } from '@/content/secrets';

import { distanceMeters } from '../generation/geo';
import type { LatLng } from '../generation/types';
import { createInitialSave, type SaveData } from '../save';
import type { SecretTip } from '../types';
import {
  activeTip,
  duplicateTipGold,
  grantTip,
  rollTip,
  secretPlaceId,
  secretPlaces,
  tipPosition,
  tipSpots,
} from './tips';

const HOUR = 3_600_000;
const now = 0;
const anchor: LatLng = { latitude: -41.2865, longitude: 174.7762 };

describe('secret tips', () => {
  it('rolls deterministically, near its chance', () => {
    expect(rollTip('library', 'lib-1')).toBe(rollTip('library', 'lib-1'));
    const hits = Array.from({ length: 4000 }, (_, i) => rollTip('library', `lib-${i}`)).filter(Boolean).length;
    expect(hits / 4000).toBeGreaterThan(secretRules.tips.library.chance - 0.03);
    expect(hits / 4000).toBeLessThan(secretRules.tips.library.chance + 0.03);
  });

  it('grants a tip that stays for the rule lifetime', () => {
    const { save, outcome } = grantTip(createInitialSave(), { source: 'library', sourceId: 'lib-1', anchor }, now);
    expect(outcome.kind).toBe('tip');
    if (outcome.kind !== 'tip') return;
    expect(outcome.tip.secret).toBe('hiddenDen');
    expect(outcome.tip.foundAt).toBe(now);
    expect(outcome.tip.expiresAt).toBe(now + secretRules.lifetimeHours * HOUR);
    expect(save.secretTips).toEqual([outcome.tip]);
  });

  it('pays duplicate gold while the same secret is already tipped', () => {
    const first = grantTip(createInitialSave(), { source: 'library', sourceId: 'lib-1', anchor }, now).save;
    const { save, outcome } = grantTip(first, { source: 'traveller', sourceId: 'trav-1', anchor }, now);
    expect(outcome).toEqual({ kind: 'gold', gold: duplicateTipGold(first) });
    expect(save.gold).toBe(duplicateTipGold(first));
    expect(save.secretTips).toHaveLength(1);
  });

  it('still tips off another secret', () => {
    const first = grantTip(createInitialSave(), { source: 'library', sourceId: 'lib-1', anchor }, now).save;
    const { save, outcome } = grantTip(first, { source: 'heist', sourceId: 'heist-1', anchor }, now);
    expect(outcome.kind).toBe('tip');
    expect(save.secretTips.map((tip) => tip.secret)).toEqual(['hiddenDen', 'blackMarket']);
  });

  it('no longer blocks once the tip expired, and prunes it', () => {
    const first = grantTip(createInitialSave(), { source: 'library', sourceId: 'lib-1', anchor }, now).save;
    const later = now + secretRules.lifetimeHours * HOUR;
    const { save, outcome } = grantTip(first, { source: 'traveller', sourceId: 'trav-1', anchor }, later);
    expect(outcome.kind).toBe('tip');
    expect(save.secretTips).toHaveLength(1);
    expect(save.secretTips[0].foundAt).toBe(later);
  });

  it('no longer blocks once the place was used up', () => {
    const first = grantTip(createInitialSave(), { source: 'library', sourceId: 'lib-1', anchor }, now).save;
    const used = { ...first, usedPlaces: { [secretPlaceId(first.secretTips[0])]: now } };
    expect(activeTip(used, 'hiddenDen', now)).toBeUndefined();
    const { save, outcome } = grantTip(used, { source: 'traveller', sourceId: 'trav-1', anchor }, now);
    expect(outcome.kind).toBe('tip');
    expect(save.secretTips).toHaveLength(2);
  });

  it('sits every spot 500–1500 m from the anchor', () => {
    const tip: SecretTip = {
      id: 'underwaterDungeon|dock-1',
      secret: 'underwaterDungeon',
      source: 'fishingDock',
      sourceId: 'dock-1',
      anchor,
      foundAt: now,
      expiresAt: now + HOUR,
    };
    const spots = tipSpots(tip);
    expect(spots).toHaveLength(secretRules.waterSpots);
    for (const spot of spots) {
      expect(distanceMeters(anchor, spot)).toBeGreaterThanOrEqual(499);
      expect(distanceMeters(anchor, spot)).toBeLessThanOrEqual(1501);
    }
  });

  it('picks the underwater spot near water, or falls back to the first', () => {
    const tip: SecretTip = {
      id: 'underwaterDungeon|dock-1',
      secret: 'underwaterDungeon',
      source: 'fishingDock',
      sourceId: 'dock-1',
      anchor,
      foundAt: now,
      expiresAt: now + HOUR,
    };
    const spots = tipSpots(tip);
    expect(tipPosition(tip)).toBeNull();
    const chosen = spots[3];
    expect(tipPosition(tip, (point) => point.latitude === chosen.latitude)).toEqual(chosen);
    expect(tipPosition(tip, () => false)).toEqual(spots[0]);
  });

  it('puts only live, unused tips on the map', () => {
    const expired: SecretTip = {
      id: 'hiddenDen|lib-old',
      secret: 'hiddenDen',
      source: 'library',
      sourceId: 'lib-old',
      anchor,
      foundAt: now - 2 * HOUR,
      expiresAt: now - HOUR,
    };
    const used: SecretTip = {
      id: 'hiddenDen|lib-used',
      secret: 'hiddenDen',
      source: 'library',
      sourceId: 'lib-used',
      anchor,
      foundAt: now,
      expiresAt: now + secretRules.lifetimeHours * HOUR,
    };
    const live: SecretTip = {
      id: 'blackMarket|heist-1',
      secret: 'blackMarket',
      source: 'heist',
      sourceId: 'heist-1',
      anchor,
      foundAt: now,
      expiresAt: now + secretRules.lifetimeHours * HOUR,
    };
    const save: SaveData = {
      ...createInitialSave(),
      secretTips: [expired, used, live],
      usedPlaces: { [secretPlaceId(used)]: now },
    };
    const spawns = secretPlaces(save, now);
    expect(spawns).toHaveLength(1);
    expect(spawns[0]).toEqual({
      id: secretPlaceId(live),
      kind: 'blackMarket',
      group: 'secret',
      tile: 'secret',
      position: tipPosition(live),
      startsAt: live.foundAt,
      expiresAt: live.expiresAt,
      roll: 0,
    });
  });
});
