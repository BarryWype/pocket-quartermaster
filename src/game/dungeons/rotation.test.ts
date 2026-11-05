import { dungeons } from '@/content/dungeons';
import { dungeonById } from '@/content/lookup';
import { rotationRules } from '@/content/rotation';
import { surges } from '@/content/threats';

import { composeBriefing, composeThreats } from '../threats/compose';
import { isDungeonAvailable, resolveExpedition, startExpedition } from '../expeditions/expeditions';
import { createInitialSave, type SaveData } from '../save';
import { equip } from '../team/team';
import type { Briefing, ThreatId } from '../types';
import { applyOverrides, briefingFor, dailyRotation, nextRotationAt, rotationDay } from './rotation';
import { tierChain } from './unlock';

const START = rotationDay(rotationRules.startDay);
const TIERS = [1, 2, 3, 4, 5];
/** A threat set as the rotation compares them: ids and levels. */
const threatKey = (threats: { id: ThreatId; level: number }[]) => threats.map((t) => `${t.id}${t.level}`).join(',');
/** A briefing's lead threat: the highest level, the first drawn on a tie. */
const mainThreat = (threats: { id: ThreatId; level: number }[]) =>
  threats.reduce((main, t) => (t.level > main.level ? t : main));

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
  it('is the same every time it is worked out, whatever dungeon array it is given', () => {
    const day = START + 250;
    // A copy of the content list skips the kept history, so this recomputes from the start.
    expect(dailyRotation(day)).toEqual(dailyRotation(day, [...dungeons]));
  });

  it('briefs every chain dungeon every day, the same for everyone', () => {
    const day = START + 10;
    const rotation = dailyRotation(day);
    for (const tier of TIERS) {
      for (const dungeon of tierChain(tier)) {
        expect(rotation.tiers[tier].briefings[dungeon.id]).toBeDefined();
        expect(briefingFor(rotation, dungeon)).toEqual(briefingFor(dailyRotation(day, [...dungeons]), dungeon));
      }
    }
  });

  it("changes every chain dungeon's threats from yesterday (30 days)", () => {
    for (let day = START + 1; day <= START + 30; day++) {
      const today = dailyRotation(day);
      const yesterday = dailyRotation(day - 1);
      for (const tier of TIERS) {
        for (const dungeon of tierChain(tier)) {
          const todays = today.tiers[tier].briefings[dungeon.id].threats;
          const yesterdays = yesterday.tiers[tier].briefings[dungeon.id].threats;
          // A surged day raises a threat level, which is a change of its own.
          if (todays.some((t) => t.surge) || yesterdays.some((t) => t.surge)) continue;
          if (threatKey(todays) !== threatKey(yesterdays)) continue;
          // Allowed only when the dungeon's table has no other draw to show.
          const salts = Array.from({ length: 8 }, (_, s) => threatKey(composeThreats(dungeon, day, s)));
          expect(salts.every((key) => key === threatKey(yesterdays))).toBe(true);
        }
      }
    }
  });

  it('spreads the main threats within a tier on most days', () => {
    let duplicated = 0;
    const tierDays = TIERS.length * 30;
    for (let day = START; day < START + 30; day++) {
      const rotation = dailyRotation(day);
      for (const tier of TIERS) {
        const mains = tierChain(tier).map((d) => mainThreat(rotation.tiers[tier].briefings[d.id].threats).id);
        if (new Set(mains).size < mains.length) duplicated++;
      }
    }
    // The tables of a tier can force a clash on some days, but not on most.
    expect(duplicated / tierDays).toBeLessThan(0.5);
  });

  it('can be overridden from debug', () => {
    const forced: Briefing = { threats: [{ id: 'traps', level: 3 }], restriction: 'barren', opportunity: 'bounty' };
    const rotation = applyOverrides(dailyRotation(START + 5), {
      briefings: { oldGraveyard: forced },
    });
    expect(briefingFor(rotation, dungeonById.oldGraveyard)).toEqual(forced);
  });
});

describe('daily surge', () => {
  it('hits about 30% of tiers, always a chain dungeon, raising an undead, traps or beasts threat', () => {
    const surged = TIERS.flatMap((tier) =>
      Array.from({ length: 100 }, (_, i) => dailyRotation(START + i).tiers[tier].surge),
    ).filter((s): s is NonNullable<typeof s> => !!s);
    expect(surged.length / (TIERS.length * 100)).toBeGreaterThan(0.15);
    expect(surged.length / (TIERS.length * 100)).toBeLessThan(0.45);
    for (const surge of surged) {
      expect(Object.keys(surges)).toContain(surge.threatId);
    }
  });

  it('targets a tier dungeon and is applied by briefingFor', () => {
    for (let i = 0; i < 200; i++) {
      const day = START + i;
      const rotation = dailyRotation(day);
      for (const tier of TIERS) {
        const surge = rotation.tiers[tier].surge;
        if (!surge) continue;
        const dungeon = tierChain(tier).find((d) => d.id === surge.dungeonId)!;
        expect(dungeon.tier).toBe(tier);
        const briefed = briefingFor(rotation, dungeon);
        const raised = briefed.threats.find((t) => t.surge);
        expect(raised?.id).toBe(surge.threatId);
        expect(raised?.level).toBeLessThanOrEqual(3);
        for (const other of tierChain(tier)) {
          if (other.id === surge.dungeonId) continue;
          expect(briefingFor(rotation, other).threats.some((t) => t.surge)).toBe(false);
        }
      }
    }
  });
});

describe('briefingFor', () => {
  it('composes a dungeon outside the rotation — overnight and secret ones — for the same day', () => {
    const day = START + 10;
    const rotation = dailyRotation(day);
    const overnight = dungeons.find((d) => d.overnight)!;
    expect(briefingFor(rotation, overnight)).toEqual(composeBriefing(overnight, day));
  });
});

describe('availability', () => {
  const done = (save: SaveData): SaveData => ({ ...save, tutorial: { ...createInitialSave().tutorial, step: 'done' } });

  it('opens every unlocked dungeon every day, and locks the chain behind clears', () => {
    const save = done(createInitialSave());
    for (const day of [START, START + 10]) {
      expect(isDungeonAvailable(save, dungeonById.ratCellar, dailyRotation(day))).toBe(true);
      expect(isDungeonAvailable(save, dungeonById.spiderBurrow, dailyRotation(day))).toBe(false);
      expect(() => startExpedition(save, 'spiderBurrow', ['bram'], 0, 1, dailyRotation(day))).toThrow();
    }
    const cleared = { ...save, clearedDungeons: ['ratCellar'] };
    expect(isDungeonAvailable(cleared, dungeonById.spiderBurrow, dailyRotation(START))).toBe(true);
  });

  it('keeps the tutorial dungeon the only one until the tutorial is done', () => {
    const during: SaveData = { ...createInitialSave(), tutorial: { ...createInitialSave().tutorial, step: 'awaitReport' } };
    expect(isDungeonAvailable(during, dungeonById.ratCellar, dailyRotation(START))).toBe(true);
    expect(isDungeonAvailable(during, dungeonById.spiderBurrow, dailyRotation(START))).toBe(false);
    expect(isDungeonAvailable(done(during), dungeonById.ratCellar, dailyRotation(START))).toBe(true);
  });

  it('lets a running expedition keep its dungeon and briefing after the rotation moves on', () => {
    const save = done({ ...createInitialSave(), gear: [{ uid: 'g', itemId: 'sword5', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 }] });
    const equipped = equip(save, 'bram', 'weapon', 'g');
    const started = startExpedition(equipped, 'ratCellar', ['bram'], 0, 1, dailyRotation(START));
    expect(started.expeditions[0].briefing).toEqual(briefingFor(dailyRotation(START), dungeonById.ratCellar));
    const { report } = resolveExpedition(started, started.expeditions[0]);
    expect(report.dungeonId).toBe('ratCellar');
    expect(report.briefing).toEqual(started.expeditions[0].briefing);
  });
});
