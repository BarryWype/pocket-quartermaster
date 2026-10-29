import { dungeons } from '@/content/dungeons';
import { heroClasses } from '@/content/heroes';
import { dungeonById } from '@/content/lookup';
import { surges } from '@/content/threats';
import { rotationRules } from '@/content/rotation';

import { composeBriefing } from '../threats/compose';
import { isDungeonAvailable, resolveExpedition, startExpedition } from '../expeditions/expeditions';
import { migrateV6Save } from '../migrations';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import type { Briefing } from '../types';
import {
  applyOverrides,
  briefingFor,
  dailyRotation,
  nextRotationAt,
  openDungeonIds,
  rotationDay,
  type Rotation,
} from './rotation';
import { mainTag } from './tags';

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

  it('can be overridden from debug', () => {
    const forced: Briefing = { threats: [{ id: 'traps', level: 3 }], restriction: 'barren', opportunity: 'bounty' };
    const rotation = applyOverrides(dailyRotation(START + 5), {
      slots: { '1:short': 'oldGraveyard' },
      briefings: { oldGraveyard: forced },
    });
    expect(rotation.tiers[1]).toMatchObject({ short: 'oldGraveyard' });
    expect(briefingFor(rotation, dungeonById.oldGraveyard)).toEqual(forced);
  });
});

describe('daily surge', () => {
  it('hits about 30% of tiers, always one of the tier\'s three dungeons, raising an undead, traps or beasts threat', () => {
    const tiers = days(100).flatMap((r) => Object.values(r.tiers));
    const surged = tiers.filter((t) => t.surge);
    expect(surged.length / tiers.length).toBeGreaterThan(0.15);
    expect(surged.length / tiers.length).toBeLessThan(0.45);
    for (const t of surged) {
      expect([t.boss, t.short, t.long]).toContain(t.surge!.dungeonId);
      expect(Object.keys(surges)).toContain(t.surge!.threatId);
    }
  });

  it('raises the targeted dungeon\'s threat by one level, capped at 3, and marks the surge', () => {
    for (let i = 0; i < 200; i++) {
      const day = START + i;
      const rotation = dailyRotation(day);
      for (const tier of Object.values(rotation.tiers)) {
        const surge = tier.surge;
        if (!surge) continue;
        const plain = composeBriefing(dungeonById[surge.dungeonId], day);
        const surged = briefingFor(rotation, dungeonById[surge.dungeonId]);
        const plainThreat = plain.threats.find((t) => t.id === surge.threatId)!;
        const surgedThreat = surged.threats.find((t) => t.id === surge.threatId)!;
        expect(surgedThreat.level).toBe(Math.min(3, plainThreat.level + 1));
        expect(surgedThreat.surge).toBeDefined();
      }
    }
  });

  it('leaves the other two dungeons of the tier alone', () => {
    for (let i = 0; i < 100; i++) {
      const day = START + i;
      const rotation = dailyRotation(day);
      for (const tier of Object.values(rotation.tiers)) {
        const surge = tier.surge;
        if (!surge) continue;
        for (const id of [tier.boss, tier.short, tier.long]) {
          if (id === surge.dungeonId) continue;
          expect(briefingFor(rotation, dungeonById[id]).threats).toEqual(composeBriefing(dungeonById[id], day).threats);
        }
      }
    }
  });
});

describe('briefingFor', () => {
  it('composes the day\'s briefing: same day, same briefing for everyone', () => {
    const day = START + 10;
    const rotation = dailyRotation(day);
    for (const dungeon of pool) {
      expect(briefingFor(rotation, dungeon)).toEqual(composeBriefing(dungeon, day));
    }
    // And it is the same whatever rotation instance is at hand.
    expect(briefingFor(dailyRotation(day), dungeonById.wolfDen)).toEqual(briefingFor(rotation, dungeonById.wolfDen));
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

  it('lets a running expedition keep its dungeon and briefing after the rotation moves on', () => {
    const save = done(equip({ ...createInitialSave(), gear: [{ uid: 'g', itemId: 'steelSword', quality: 'normal' }] }, 'bram', 'weapon', 'g'));
    const started = startExpedition(save, 'spiderBurrow', ['bram'], 0, 1, rotation);
    expect(started.expeditions[0].briefing).toEqual(briefingFor(rotation, dungeonById.spiderBurrow));
    // Tomorrow it may be gone from the rotation; resolving doesn't look at the rotation at all.
    const { report } = resolveExpedition(started, started.expeditions[0]);
    expect(report.dungeonId).toBe('spiderBurrow');
    expect(report.briefing).toEqual(started.expeditions[0].briefing);
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

describe('class answers', () => {
  it('gives every class something to answer threats with: an approach above the base, or a keyword', () => {
    for (const heroClass of Object.values(heroClasses)) {
      const approaches = Object.values(heroClass.approaches).some((score) => score > 1);
      expect(approaches || heroClass.keywords.length > 0).toBe(true);
    }
  });
});
