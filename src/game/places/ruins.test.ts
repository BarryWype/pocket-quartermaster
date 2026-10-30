import { lootConfig } from '@/content/loot/config';
import { ruinRules } from '@/content/placeActivities';
import { itemById } from '@/content/lookup';

import { distanceMeters } from '../generation/geo';
import { lootChances } from '../loot/chances';
import type { LatLng } from '../generation/types';
import { createInitialSave, type SaveData } from '../save';
import type { GearDef } from '../types';
import type { PlaceSpawn } from './generate';
import { digProblem, digRuin, pruneDugRuins, ruinDig, ruinReplacements, ruinsDots } from './ruins';

const HOUR = 3_600_000;
const position: LatLng = { latitude: -41.2865, longitude: 174.7762 };
const far: LatLng = { latitude: -41.29, longitude: 174.7762 };
const now = 0;

const spawnOf = (suffix: string): PlaceSpawn => ({
  id: `place:ruins:tile:${suffix}`,
  kind: 'ruins',
  group: 'ruins',
  tile: 'tile',
  position,
  startsAt: 0,
  expiresAt: 1e15,
  roll: 0,
});

/** A save holding the wooden pickaxe, so the dig's ore draw has something to mine. */
const digger = (): SaveData => ({ ...createInitialSave(), tools: ['woodPickaxe'] });

describe('digRuin', () => {
  it('digs once, then the ruin is gone', () => {
    const spawn = spawnOf('1:0');
    const { save } = digRuin(digger(), spawn, position, now);
    expect(digProblem(save, spawn, position, now)).toBe('gone');
    expect(save.usedPlaces[spawn.id]).toBe(spawn.expiresAt);
  });

  it('pays stone or wood the player can mine, and keeps progress across digs', () => {
    let save = digger();
    const [min, max] = lootConfig.quantities.materials;
    for (let i = 0; i < ruinRules.relicEvery - 1; i++) {
      const { save: dug, relic, reward } = digRuin(save, spawnOf(`2:${i}`), position, now);
      expect(relic).toBe(false);
      expect(dug.ruinsProgress).toBe(i + 1);
      for (const { materialId, amount } of reward.materials) {
        expect(['stone', 'wood']).toContain(materialId);
        expect(amount).toBeGreaterThanOrEqual(min);
        expect(amount).toBeLessThanOrEqual(max);
      }
      save = dug;
    }
    expect(save.ruinsProgress).toBe(ruinRules.relicEvery - 1);
  });

  it('refuses ruins that are not started, not ruins, used up or too far', () => {
    const save = createInitialSave();
    expect(digProblem(save, { ...spawnOf('3:0'), kind: 'market' }, position, now)).toBe('gone');
    expect(digProblem(save, { ...spawnOf('3:1'), startsAt: 100 }, position, now)).toBe('gone');
    expect(digProblem(save, spawnOf('3:2'), far, now)).toBe('tooFar');
    const used = { ...save, usedPlaces: { 'place:ruins:tile:3:3': 1 } };
    expect(digProblem(used, spawnOf('3:3'), position, now)).toBe('gone');
  });

  it('pays a relic on the 5th dig, of a rare or legendary piece at the highest tier, and resets the count', () => {
    let save: SaveData = { ...digger(), ruinsProgress: 0 };
    for (let i = 0; i < ruinRules.relicEvery - 1; i++) save = digRuin(save, spawnOf(`4:${i}`), position, now).save;
    const { save: dug, relic, reward } = digRuin(save, spawnOf('4:last'), position, now);
    expect(relic).toBe(true);
    expect(dug.ruinsProgress).toBe(0);
    expect(reward.gear).toHaveLength(1);
    const item = reward.gear[0];
    expect(['rare', 'legendary']).toContain(item.quality);
    expect((itemById[item.itemId] as GearDef).tier).toBe(1);
    expect(dug.gear.at(-1)!.quality).toBe(item.quality);
  });

  it('gives a key fragment at the matrix chance over many ruins', () => {
    const save = digger();
    const chance = lootChances({ source: 'ruinsDig', luck: 0, modifiers: [] }).keyFragments;
    const fragments = Array.from({ length: 1000 }, (_, i) => ruinDig(save, spawnOf(`5:${i}`)).reward.keyFragments).reduce(
      (sum, n) => sum + n,
      0,
    );
    expect(fragments / 1000).toBeGreaterThan(chance - 0.08);
    expect(fragments / 1000).toBeLessThan(chance + 0.08);
  });
});

describe('ruinReplacements', () => {
  it('grows a replacement 24 h later, elsewhere, and not before', () => {
    const spawn = spawnOf('6:0');
    const { save } = digRuin(digger(), spawn, position, now);
    expect(ruinReplacements(save, now)).toEqual([]);
    expect(ruinReplacements(save, now + (ruinRules.respawnHours - 1) * HOUR)).toEqual([]);
    const [replacement] = ruinReplacements(save, now + (ruinRules.respawnHours + 1) * HOUR);
    expect(replacement.id).toBe(`${spawn.id}+`);
    expect(replacement.kind).toBe('ruins');
    const distance = distanceMeters(position, replacement.position);
    expect(distance).toBeGreaterThanOrEqual(ruinRules.replacementMeters[0]);
    expect(distance).toBeLessThanOrEqual(ruinRules.replacementMeters[1]);
    expect(replacement.startsAt).toBe(now + ruinRules.respawnHours * HOUR);
    // The replacement is diggable too, chaining on its own.
    expect(digProblem(save, replacement, replacement.position, replacement.startsAt)).toBe(null);
  });

  it('drops the replacement once its own window has lapsed', () => {
    const spawn = spawnOf('7:0');
    const { save } = digRuin(digger(), spawn, position, now);
    const horizon = now + (ruinRules.respawnHours + ruinRules.lifetimeHours) * HOUR;
    expect(ruinReplacements(save, horizon - 1)).toHaveLength(1);
    expect(ruinReplacements(save, horizon)).toEqual([]);
    expect(pruneDugRuins(save.dugRuins, horizon)).toEqual({});
    expect(pruneDugRuins(save.dugRuins, horizon - 1)).toEqual(save.dugRuins);
  });
});

describe('ruinsDots', () => {
  it('fills one dot per dig', () => {
    expect(ruinsDots(0)).toBe('○○○○○');
    expect(ruinsDots(2)).toBe('●●○○○');
    expect(ruinsDots(5)).toBe('●●●●●');
    expect(ruinsDots(2, 3)).toBe('●●○');
  });
});
