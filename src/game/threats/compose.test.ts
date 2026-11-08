import { dungeons } from '@/content/dungeons';
import { threatById } from '@/content/lookup';
import { dungeonThreats, patrolThreatIds } from '@/content/threats';
import { PATROL_KINDS } from '@/game/patrols/generate';

import type { ThreatId } from '../types';
import { composeBriefing, maxThreatLevel, restrictionKeepsAnswers, rollSurge, withSurge } from './compose';

const byId = Object.fromEntries(dungeons.map((d) => [d.id, d]));
const days = (count: number) => Array.from({ length: count }, (_, i) => i + 1);

const compose = (id: string, day: number) => composeBriefing(byId[id], day);

describe('threat content', () => {
  it('gives every dungeon a threat table, and only names real threats', () => {
    expect(Object.keys(dungeonThreats).sort()).toEqual(dungeons.map((d) => d.id).sort());
    for (const table of Object.values(dungeonThreats)) {
      for (const id of Object.keys(table.weights) as ThreatId[]) {
        expect(threatById[id]).toBeDefined();
        expect(table.weights[id]).toBeGreaterThan(0);
      }
      // The Element threat needs the dungeon's element to bite with.
      if (table.weights.element) expect(table.element).toBeDefined();
    }
  });

  it('gives every patrol kind its threat', () => {
    expect(Object.keys(patrolThreatIds).sort()).toEqual([...PATROL_KINDS].sort());
    for (const kind of PATROL_KINDS) {
      expect(threatById[patrolThreatIds[kind]]).toBeDefined();
    }
  });
});

describe('composition', () => {
  it('draws one threat in tier 1 and two in the higher tiers', () => {
    for (const day of days(30)) {
      expect(compose('ratCellar', day).threats.length).toBe(1);
      expect(compose('nightWatch1', day).threats.length).toBe(1);
      for (const id of ['wolfDen', 'drownedCrypt', 'clockworkVault', 'dragonLair'] as const) {
        expect(compose(id, day).threats.length).toBe(2);
      }
    }
  });

  it('only draws threats the tier has met, and levels within their reach', () => {
    for (const day of days(30)) {
      for (const dungeon of dungeons) {
        const briefing = composeBriefing(dungeon, day);
        for (const threat of briefing.threats) {
          const def = threatById[threat.id];
          expect(def.firstTier).toBeLessThanOrEqual(dungeon.tier);
          expect(threat.level).toBeLessThanOrEqual(Math.min(3, 1 + dungeon.tier - def.firstTier));
        }
      }
    }
    // A tier 1 dungeon never sees its tier 2+ threats at all.
    const ratCellarThreats = new Set(days(40).flatMap((day) => compose('ratCellar', day).threats.map((t) => t.id)));
    expect(ratCellarThreats).toEqual(new Set(['beasts', 'traps', 'element']));
    // First-tier threats stay at level 1 the tier they appear in.
    for (const day of days(30)) {
      expect(compose('nightWatch1', day).threats.every((t) => t.level === 1)).toBe(true);
    }
  });

  it('only ever draws the seven threats, never twice in one briefing', () => {
    const ids = new Set(Object.keys(threatById));
    expect(ids).toEqual(new Set(['holy', 'beasts', 'darkness', 'traps', 'poison', 'element', 'armoured']));
    for (const dungeon of dungeons) {
      for (const day of days(60)) {
        const threats = composeBriefing(dungeon, day).threats;
        for (const threat of threats) expect(ids.has(threat.id)).toBe(true);
        expect(new Set(threats.map((t) => t.id)).size).toBe(threats.length);
      }
    }
  });

  it('caps a threat at one more level per tier above its first, at 3', () => {
    expect(maxThreatLevel(1, 1)).toBe(1);
    expect(maxThreatLevel(2, 1)).toBe(2);
    expect(maxThreatLevel(3, 1)).toBe(3);
    expect(maxThreatLevel(5, 1)).toBe(3);
    expect(maxThreatLevel(5, 3)).toBe(3);
  });

  it('takes the Element threat with the dungeon’s element', () => {
    for (const day of days(30)) {
      const threats = compose('cinderHollow', day).threats;
      const element = threats.find((t) => t.id === 'element');
      if (element) expect(element.element).toBe('fire');
      expect(threats.every((t) => t.id !== 'element' || t.element === 'fire')).toBe(true);
    }
  });

  it('offers an opportunity from tier 2 on, the trophy beast only where beasts live', () => {
    for (const day of days(40)) {
      expect(compose('ratCellar', day).opportunity).toBeNull();
      expect(compose('nightWatch1', day).opportunity).toBeNull();
      expect(compose('smugglersCove', day).opportunity).not.toBe('trophyBeast');
      expect(compose('clockworkVault', day).opportunity).not.toBe('trophyBeast');
    }
    // Somewhere in the month the wolf den does offer one.
    expect(days(40).some((day) => compose('wolfDen', day).opportunity !== null)).toBe(true);
  });

  it('rolls a restriction only in tiers 4 and 5, never on overnight expeditions', () => {
    for (const day of days(60)) {
      for (const id of ['dwarfhold', 'witchMarsh', 'nightWatch1'] as const) {
        expect(compose(id, day).restriction).toBeNull();
      }
      expect(compose('nightWatch4', day).restriction).toBeNull();
      expect(compose('nightWatch5', day).restriction).toBeNull();
    }
    expect(days(100).some((day) => compose('harpyCliffs', day).restriction !== null)).toBe(true);
    expect(days(100).some((day) => compose('dragonLair', day).restriction !== null)).toBe(true);
  });

  it('is the same briefing for everyone on the same day', () => {
    for (const id of ['ratCellar', 'dwarfhold', 'dragonLair'] as const) {
      expect(compose(id, 7)).toEqual(compose(id, 7));
    }
    // Different days shake the dungeon up somewhere in the week.
    expect(days(7).some((day) => JSON.stringify(compose('dwarfhold', day)) !== JSON.stringify(compose('dwarfhold', 1)))).toBe(
      true,
    );
  });
});

describe('restrictions and answers', () => {
  it('keeps Poison 3 answerable by a party squeezed down to 2: it needs 3 tags', () => {
    expect(restrictionKeepsAnswers([{ id: 'poison', level: 3 }], 'narrowPassages')).toBe(true);
  });
});

describe('daily surges', () => {
  const tierDungeons = ['harpyCliffs', 'thunderPlateau', 'boneField'] as const;
  const threats = () =>
    Object.fromEntries(tierDungeons.map((id) => [id, compose(id, 12).threats])) as Record<
      string,
      ReturnType<typeof compose>['threats']
    >;

  it('rolls one surge some days, and none without a matching threat', () => {
    const rolled = days(50).map((day) => rollSurge(day, 4, threats()));
    expect(rolled.some((s) => s !== null)).toBe(true);
    expect(rolled.filter(Boolean).every((s) => (tierDungeons as readonly string[]).includes(s!.dungeonId))).toBe(true);
    // Nothing to raise: no surge.
    const quiet = { d: [{ id: 'darkness' as const, level: 1 as const }] };
    expect(days(50).every((day) => rollSurge(day, 4, quiet) === null)).toBe(true);
    // The same day always rolls the same surge.
    expect(rollSurge(12, 4, threats())).toEqual(rollSurge(12, 4, threats()));
  });

  it('raises the threat by one level, capped at 3, and names the surge', () => {
    const raised = withSurge({ threats: [{ id: 'traps', level: 1 }], restriction: null, opportunity: null }, 'traps');
    expect(raised.threats[0]).toEqual({ id: 'traps', level: 2, surge: 'boobyTrapped' });
    const capped = withSurge({ threats: [{ id: 'holy', level: 3 }], restriction: null, opportunity: null }, 'holy');
    expect(capped.threats[0]).toEqual({ id: 'holy', level: 3, surge: 'restlessDead' });
    const hunted = withSurge({ threats: [{ id: 'beasts', level: 2 }], restriction: null, opportunity: null }, 'beasts');
    expect(hunted.threats[0]).toEqual({ id: 'beasts', level: 3, surge: 'packHunt' });
  });
});
