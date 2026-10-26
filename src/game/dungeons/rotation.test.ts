import { dungeons } from '@/content/dungeons';
import { heroClasses } from '@/content/heroes';
import { dungeonById } from '@/content/lookup';
import { dungeonModifiers, modifierById } from '@/content/modifiers';
import { rotationRules } from '@/content/rotation';

import { isDungeonAvailable, resolveExpedition, startExpedition } from '../expeditions/expeditions';
import { migrateV6Save } from '../migrations';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import { countersFor } from './counters';
import {
  allowedModifiers,
  applyOverrides,
  dailyRotation,
  nextRotationAt,
  openDungeonIds,
  rotationDay,
  withModifier,
  type Rotation,
} from './rotation';
import { dungeonTags, mainTag } from './tags';

const START = rotationDay(rotationRules.startDay);
const days = (count: number, from = START + 100) => Array.from({ length: count }, (_, i) => dailyRotation(from + i));
const pool = dungeons.filter((d) => d.slot);

describe('rotation days', () => {
  it('resets at the configured UTC hour, not the local day', () => {
    const midnight = Date.UTC(2026, 9, 26);
    expect(rotationDay(midnight - 1)).toBe(rotationDay(midnight) - 1);
    expect(nextRotationAt(midnight + 5 * 3_600_000)).toBe(midnight + 86_400_000);
    const late = { ...rotationRules, resetHourUtc: 6 };
    expect(rotationDay(midnight + 5 * 3_600_000, late)).toBe(rotationDay(midnight, late));
  });
});

describe('daily rotation', () => {
  it('is the same every time it is worked out', () => {
    const day = START + 250;
    // A copy of the content list skips the kept history, so this recomputes from the start.
    expect(dailyRotation(day)).toEqual(dailyRotation(day, [...dungeons]));
  });

  it('opens each tier boss plus one short and one long dungeon', () => {
    const rotation = dailyRotation(START + 10);
    for (const tier of [1, 2, 3, 4, 5]) {
      const t = rotation.tiers[tier];
      expect(dungeonById[t.boss].isBoss).toBe(true);
      expect(dungeonById[t.short]).toMatchObject({ tier, slot: 'short' });
      expect(dungeonById[t.long]).toMatchObject({ tier, slot: 'long' });
    }
  });

  it('never opens two dungeons with the same main tag in a tier, nor repeats a slot two days running (60 days)', () => {
    const rotations = days(60);
    rotations.forEach((today, i) => {
      for (const [tier, t] of Object.entries(today.tiers)) {
        expect(mainTag(dungeonById[t.short])).not.toBe(mainTag(dungeonById[t.long]));
        const yesterday = rotations[i - 1]?.tiers[Number(tier)];
        if (yesterday) {
          expect(t.short).not.toBe(yesterday.short);
          expect(t.long).not.toBe(yesterday.long);
        }
      }
    });
  });

  it('shows every pool dungeon within 30 days', () => {
    const seen = new Set(days(30).flatMap(openDungeonIds));
    for (const dungeon of pool) expect(seen).toContain(dungeon.id);
  });

  it('gives about 60% of tiers a modifier, always one their dungeon allows', () => {
    const tiers = days(100).flatMap((r) => Object.values(r.tiers));
    const modified = tiers.filter((t) => t.modifier);
    expect(modified.length / tiers.length).toBeGreaterThan(0.45);
    expect(modified.length / tiers.length).toBeLessThan(0.75);
    for (const t of modified) {
      expect([t.boss, t.short, t.long]).toContain(t.modifier!.dungeonId);
      expect(allowedModifiers(dungeonById[t.modifier!.dungeonId]).map((m) => m.id)).toContain(t.modifier!.modifierId);
    }
  });

  it('can be overridden from debug', () => {
    const rotation = applyOverrides(dailyRotation(START + 5), {
      slots: { '1:short': 'oldGraveyard' },
      modifiers: { 1: { dungeonId: 'oldGraveyard', modifierId: 'bounty' }, 2: null },
    });
    expect(rotation.tiers[1]).toMatchObject({ short: 'oldGraveyard', modifier: { modifierId: 'bounty' } });
    expect(rotation.tiers[2].modifier).toBeNull();
  });
});

describe('availability', () => {
  /** A rotation where tier 1 has the Spider Burrow and the Collapsed Mill. */
  const rotation: Rotation = applyOverrides(dailyRotation(START), {
    slots: { '1:short': 'spiderBurrow', '1:long': 'millRuins', '2:short': 'wolfDen' },
  });
  const done = (save: SaveData): SaveData => ({ ...save, tutorial: { step: 'done', woodSpot: null } });

  it('opens only today’s dungeons, plus the bosses', () => {
    const save = done(createInitialSave());
    expect(isDungeonAvailable(save, dungeonById.spiderBurrow, rotation)).toBe(true);
    expect(isDungeonAvailable(save, dungeonById.banditStockade, rotation)).toBe(true);
    expect(isDungeonAvailable(save, dungeonById.goblinWarren, rotation)).toBe(false);
    expect(() => startExpedition(save, 'goblinWarren', ['bram'], 0, 1, rotation)).toThrow();
  });

  it('shows today’s dungeons of a tier unlocked mid-day', () => {
    const save = done(createInitialSave());
    expect(isDungeonAvailable(save, dungeonById.wolfDen, rotation)).toBe(false);
    expect(isDungeonAvailable({ ...save, clearedDungeons: ['banditStockade'] }, dungeonById.wolfDen, rotation)).toBe(true);
  });

  it('keeps the tutorial dungeon open until the tutorial is done', () => {
    const during: SaveData = { ...createInitialSave(), tutorial: { step: 'awaitReport', woodSpot: null } };
    expect(isDungeonAvailable(during, dungeonById.ratCellar, rotation)).toBe(true);
    expect(isDungeonAvailable(done(during), dungeonById.ratCellar, rotation)).toBe(false);
  });

  it('lets a running expedition keep its dungeon and modifier after the rotation moves on', () => {
    const save = done(equip({ ...createInitialSave(), gear: [{ uid: 'g', itemId: 'steelSword', quality: 'normal' }] }, 'bram', 'weapon', 'g'));
    const bounty = applyOverrides(rotation, { modifiers: { 1: { dungeonId: 'spiderBurrow', modifierId: 'bounty' } } });
    const started = startExpedition(save, 'spiderBurrow', ['bram'], 0, 1, bounty);
    expect(started.expeditions[0]).toMatchObject({ dungeonId: 'spiderBurrow', modifierId: 'bounty' });
    // Tomorrow it may be gone from the rotation; resolving doesn't look at the rotation at all.
    const { report } = resolveExpedition(started, started.expeditions[0]);
    expect(report.dungeonId).toBe('spiderBurrow');
  });
});

describe('modifiers', () => {
  it('are only allowed on dungeons with the tags they need', () => {
    const restless = modifierById.restlessDead;
    expect(allowedModifiers(dungeonById.oldGraveyard)).toContain(restless);
    expect(allowedModifiers(dungeonById.millRuins)).not.toContain(restless);
    for (const dungeon of dungeons) {
      for (const modifier of allowedModifiers(dungeon)) {
        const tags = dungeonTags(dungeon, { bossWeight: 3, minShare: 0, maxShown: Infinity });
        modifier.requires.forEach((tag) => expect(tags).toContain(tag));
      }
    }
    expect(dungeonModifiers.length).toBeGreaterThanOrEqual(5);
  });

  it('boost the weight of encounters with their tag', () => {
    const boosted = withModifier(dungeonById.clockworkVault, modifierById.boobyTrapped);
    dungeonById.clockworkVault.encounters.forEach((e, i) =>
      expect(boosted.encounters[i].weight).toBe(e.type === 'trap' ? e.weight * 2.5 : e.weight),
    );
  });

  it('change the enemy element and the rewards', () => {
    expect(withModifier(dungeonById.wolfDen, modifierById.flooded).enemyElement).toBe('water');
    expect(withModifier(dungeonById.wolfDen, modifierById.bounty).rewardMultipliers).toEqual({ gold: 1.3, materials: 1 });
    expect(withModifier(dungeonById.wolfDen, modifierById.richVeins).rewardMultipliers).toEqual({ gold: 1, materials: 1.3 });
  });
});

describe('first-clear bonus', () => {
  const geared = (): SaveData => {
    let save: SaveData = {
      ...createInitialSave(),
      tutorial: { step: 'done', woodSpot: null },
      gear: ['steelSword', 'steelBow', 'steelWand'].map((itemId, i) => ({ uid: `g${i}`, itemId, quality: 'normal' as const })),
      heroes: createInitialSave().heroes.map((h) => ({ ...h, level: 9 })),
    };
    ['bram', 'lyra', 'mira'].forEach((id, i) => (save = equip(save, id, 'weapon', `g${i}`)));
    return save;
  };
  const win = (save: SaveData) => {
    const started = startExpedition(save, 'spiderBurrow', ['bram', 'lyra', 'mira'], 0);
    return resolveExpedition(started, started.expeditions[0]);
  };

  it('is paid once per pool dungeon', () => {
    const firstRun = win(geared());
    expect(firstRun.report.success).toBe(true);
    expect(firstRun.report.firstClear).toEqual({ gold: 12, xp: 15 });
    expect(firstRun.save.firstClears).toEqual(['spiderBurrow']);
    expect(win(firstRun.save).report.firstClear).toBeUndefined();
  });

  it('is not paid for bosses', () => {
    const started = startExpedition(geared(), 'banditStockade', ['bram', 'lyra', 'mira'], 0);
    expect(resolveExpedition(started, started.expeditions[0]).report.firstClear).toBeUndefined();
  });

  it('counts dungeons cleared before the update as claimed', () => {
    const old = { ...createInitialSave(), clearedDungeons: ['ratCellar', 'banditStockade'] } as Partial<SaveData>;
    delete old.firstClears;
    expect(migrateV6Save(old).firstClears).toEqual(['ratCellar', 'banditStockade']);
  });
});

describe('counters', () => {
  it('flags heroes whose abilities match the dungeon', () => {
    expect(countersFor(heroClasses.warrior.abilities, dungeonById.millRuins)).toEqual(heroClasses.warrior.abilities);
    expect(countersFor(heroClasses.fireMage.abilities, dungeonById.goblinWarren)).toEqual(heroClasses.fireMage.abilities);
    expect(countersFor(heroClasses.ranger.abilities, dungeonById.wolfDen).map((a) => a.kind)).toEqual(['trapReduce', 'damageVsTag']);
    expect(countersFor(heroClasses.warrior.abilities, dungeonById.wolfDen)).toEqual([]);
  });
});
