import { heroClasses } from '@/content/heroes';
import { components } from '@/content/loot/components';
import { secretRules } from '@/content/secrets';
import { shopRules } from '@/content/shops';
import { trinkets } from '@/content/trinkets';
import { traits } from '@/content/traits';

import type { LatLng } from '../generation/types';
import { createInitialSave, type SaveData } from '../save';
import type { SecretTip } from '../types';
import { offerLevel, recruitPrice } from '../taverns/taverns';
import {
  blackMarketGoods,
  buyAtBlackMarket,
  enterProblem,
  enterSecret,
  isEntered,
  marketBuyProblem,
  recruitAtSecret,
  secretRecruit,
  secretRecruitProblem,
} from './places';
import { secretPlaceId } from './tips';

const HOUR = 3_600_000;
const now = 0;
const anchor: LatLng = { latitude: -41.2865, longitude: 174.7762 };
const far: LatLng = { latitude: -41.29, longitude: 174.7762 };

const tipOf = (secret: SecretTip['secret'], sourceId: string): SecretTip => ({
  id: `${secret}|${sourceId}`,
  secret,
  source: secret === 'blackMarket' ? 'heist' : 'library',
  sourceId,
  anchor,
  foundAt: now,
  expiresAt: now + secretRules.lifetimeHours * HOUR,
});

const marketTipOf = (): SecretTip => tipOf('blackMarket', 'heist-1');

const placeOf = (tip: SecretTip) => ({
  id: secretPlaceId(tip),
  kind: tip.secret,
  group: 'secret',
  tile: 'secret',
  position: anchor,
  startsAt: tip.foundAt,
  expiresAt: tip.expiresAt,
  roll: 0,
});

const saveWith = (tip: SecretTip, extra: Partial<SaveData> = {}): SaveData => ({
  ...createInitialSave(),
  secretTips: [tip],
  keyFragments: 4,
  gold: 100_000,
  ...extra,
});

describe('entering a secret place', () => {
  const tip = tipOf('hiddenDen', 'lib-1');
  const place = placeOf(tip);

  it('spends one key, needs one, and marks the tip entered', () => {
    const save = saveWith(tip);
    const next = enterSecret(save, place, anchor, now);
    expect(next.keyFragments).toBe(0);
    expect(isEntered(next, place)).toBe(true);
    expect(next.secretTips[0].entered).toBe(true);

    const keyless = saveWith(tip, { keyFragments: 0 });
    expect(enterProblem(keyless, place, anchor, now)).toBe('noKey');
    expect(() => enterSecret(keyless, place, anchor, now)).toThrow();
  });

  it('refuses a place with no tip, expired, used up, or too far away', () => {
    expect(enterProblem(createInitialSave(), place, anchor, now)).toBe('gone');
    expect(enterProblem(saveWith({ ...tip, expiresAt: now }), place, anchor, now)).toBe('gone');
    expect(enterProblem(saveWith(tip, { usedPlaces: { [place.id]: now } }), place, anchor, now)).toBe('gone');
    expect(enterProblem(saveWith(tip), place, far, now)).toBe('tooFar');
  });
});

describe('the secret recruit', () => {
  const tip = tipOf('hiddenDen', 'lib-1');
  const place = placeOf(tip);

  it('offers a rare class at the rare recruit price', () => {
    const save = saveWith(tip);
    const offer = secretRecruit(save, place);
    expect(heroClasses[offer.classId].rarity).toBe('rare');
    const positive = traits.find((t) => t.id === offer.trait)!.positive;
    expect(offer.price).toBe(
      recruitPrice('rare', offerLevel(save), save.heroes.length, positive, 1, offer.grade),
    );
    expect(offer.expiresAt).toBe(place.expiresAt);
    expect(secretRecruit(save, place)).toEqual(offer);
  });

  it('keeps the offer after re-reading the save, and needs entering first', () => {
    const save = saveWith(tip);
    expect(secretRecruitProblem(save, place, anchor, now)).toBe('notEntered');
    const entered = enterSecret(save, place, anchor, now);
    expect(secretRecruit(entered, place)).toEqual(secretRecruit(save, place));
    expect(secretRecruitProblem(entered, place, anchor, now)).toBe(null);
    expect(secretRecruitProblem(entered, place, far, now)).toBe('tooFar');
  });

  it('recruiting at the den uses the place up', () => {
    const entered = enterSecret(saveWith(tip), place, anchor, now);
    const next = recruitAtSecret(entered, place, anchor, now);
    expect(next.heroes).toHaveLength(4);
    expect(next.heroes[3]).toMatchObject({ classId: secretRecruit(entered, place).classId });
    expect(next.gold).toBe(entered.gold - secretRecruit(entered, place).price);
    expect(next.usedPlaces[place.id]).toBe(place.expiresAt);
    expect(secretRecruitProblem(next, place, anchor, now)).toBe('gone');
  });

  it('recruiting at the black market leaves it open, with goods still buyable', () => {
    const market = placeOf(tipOf('blackMarket', 'heist-1'));
    const entered = enterSecret(saveWith(marketTipOf()), market, anchor, now);
    const next = recruitAtSecret(entered, market, anchor, now);
    expect(next.usedPlaces).toEqual({});
    const line = blackMarketGoods(next, market)[0];
    expect(marketBuyProblem(next, market, line.key, anchor, now)).toBe(null);
  });
});

describe('the black market goods', () => {
  const tip = marketTipOf();
  const place = placeOf(tip);

  it('sells components without a boss id, and only one of each', () => {
    const lines = blackMarketGoods(saveWith(tip), place, ['components']);
    expect(lines.length).toBeGreaterThanOrEqual(secretRules.blackMarket.lines[0]);
    const noBoss = components.filter((c) => !c.bossId);
    for (const line of lines) {
      expect(line.kind).toBe('component');
      expect(noBoss.some((c) => c.id === line.id)).toBe(true);
      expect(line.price).toBe(Math.round(noBoss.find((c) => c.id === line.id)!.sellPrice * secretRules.blackMarket.markup));
    }
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
  });

  it('sells rare trinkets of the player’s tier, never the ring of fortune', () => {
    const lines = blackMarketGoods(saveWith(tip), place, ['trinkets']);
    for (const line of lines) {
      expect(line.kind).toBe('gear');
      expect(trinkets.some((t) => t.id === line.id)).toBe(true);
      expect(line.gear).toMatchObject({ quality: 'rare' });
      expect(line.id).not.toContain('ringOfFortune');
      expect(line.price).toBe(
        Math.round(shopRules.gearPrice[0] * shopRules.qualityPrice.rare * secretRules.blackMarket.markup),
      );
    }
  });

  it('needs entering first, and buying a good charges gold and marks it sold out', () => {
    const save = saveWith(tip);
    const line = blackMarketGoods(save, place)[0];
    expect(marketBuyProblem(save, place, line.key, anchor, now)).toBe('notEntered');
    expect(marketBuyProblem(save, place, line.key, far, now)).toBe('notEntered');

    const entered = enterSecret(save, place, anchor, now);
    expect(marketBuyProblem(entered, place, line.key, anchor, now)).toBe(null);
    const next = buyAtBlackMarket(entered, place, line.key, anchor, now);
    expect(next.gold).toBe(entered.gold - line.price);
    expect(next.placePurchases[place.id]).toEqual({ expiresAt: place.expiresAt, bought: { [line.key]: 1 } });
    expect(marketBuyProblem(next, place, line.key, anchor, now)).toBe('soldOut');
    expect(marketBuyProblem({ ...next, gold: 0 }, place, blackMarketGoods(next, place).find((l) => l.key !== line.key)!.key, anchor, now)).toBe('gold');

    if (line.kind === 'component') {
      expect(next.materials[line.id]).toBe(1);
    } else {
      expect(next.gear).toEqual([{ ...line.gear!, uid: 'g1' }]);
      expect(next.nextUid).toBe(2);
    }
  });
});
