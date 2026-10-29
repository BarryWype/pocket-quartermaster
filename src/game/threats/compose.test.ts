import { dungeons } from '@/content/dungeons';
import { itemById, threatById } from '@/content/lookup';
import { dungeonThreats, patrolThreats, threatRules } from '@/content/threats';

import type { ConsumableDef, DungeonDef, ThreatId } from '../types';
import { heroAnswers, type AnswersMember } from './answers';
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
    expect(patrolThreats).toEqual({
      goblins: { id: 'ambush', level: 1 },
      herd: { id: 'beasts', level: 1 },
      bandits: { id: 'thieves', level: 1 },
    });
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

  it('never draws two obstacles, or two threats sharing a kit', () => {
    for (const day of days(40)) {
      for (const id of ['watchtower', 'orcWarcamp', 'giantsHall'] as const) {
        const obstacles = compose(id, day).threats.filter((t) => threatById[t.id].category === 'obstacle');
        expect(obstacles.length).toBeLessThanOrEqual(1);
      }
      // The rogue’s roll covers traps, locked and thieves; the lantern darkness and ambush.
      const smugglers = compose('smugglersCove', day).threats.map((t) => t.id);
      expect(smugglers.filter((id) => id === 'traps' || id === 'locked' || id === 'thieves').length).toBeLessThanOrEqual(1);
      expect(smugglers.filter((id) => id === 'darkness' || id === 'ambush').length).toBeLessThanOrEqual(1);
    }
  });

  it('draws locals only where the pool has a locals encounter', () => {
    const noLocals: DungeonDef = {
      ...byId.witchMarsh,
      encounters: byId.witchMarsh.encounters.filter((e) => e.type !== 'locals'),
    };
    for (const day of days(40)) {
      expect(composeBriefing(noLocals, day).threats.some((t) => t.id === 'locals')).toBe(false);
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

  it('rolls a restriction only in tiers 4 and 5, never on overnight quests', () => {
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
  const member = (overrides: Partial<AnswersMember> = {}): AnswersMember => ({
    heroId: 'h',
    classId: 'warrior',
    traitId: 'none',
    gearKeywords: [],
    kit: null,
    salveElement: null,
    classResists: [],
    ...overrides,
  });
  const kit = (itemId: string) => ({ itemId, effect: (itemById[itemId] as ConsumableDef).kit! });
  const ambush = [{ id: 'ambush' as const, level: 1 as const }];

  it('keeps a threat answerable while some source remains', () => {
    // With every hero shape possible, some lantern always answers the ambush.
    expect(restrictionKeepsAnswers(ambush, 'thickFog')).toBe(true);
    expect(restrictionKeepsAnswers([{ id: 'darkness', level: 1 }], 'antiMagic')).toBe(true);
    // A world with no kits loses the last answer under a restriction.
    const bare = [member({ classId: 'ranger' })];
    expect(restrictionKeepsAnswers(ambush, 'thickFog', bare)).toBe(false);
    expect(restrictionKeepsAnswers(ambush, null, bare)).toBe(true);
    const lantern = [member({ kit: kit('lantern') })];
    expect(restrictionKeepsAnswers(ambush, 'thickFog', lantern)).toBe(true);
    expect(restrictionKeepsAnswers([{ id: 'darkness', level: 1 }], 'antiMagic', [member({ classId: 'fireMage' })])).toBe(
      false,
    );
  });

  it('refuses anti-magic when the only answers come from magic sources', () => {
    const undead = [{ id: 'undead' as const, level: 1 as const }];
    // Only a censer's Blessed answers the undead, and a censer is magic.
    const censer = [member({ gearKeywords: [{ keyword: 'blessed', magic: true }] })];
    expect(restrictionKeepsAnswers(undead, 'antiMagic', censer)).toBe(false);
    expect(restrictionKeepsAnswers(undead, null, censer)).toBe(true);
    // A mace's Blessed is physical gear; a kit's keyword is never magic.
    const mace = [member({ gearKeywords: [{ keyword: 'blessed', magic: false }] })];
    expect(restrictionKeepsAnswers(undead, 'antiMagic', mace)).toBe(true);
    const darkness = [{ id: 'darkness' as const, level: 1 as const }];
    expect(restrictionKeepsAnswers(darkness, 'antiMagic', [member({ classId: 'fireMage' })])).toBe(false);
    expect(restrictionKeepsAnswers(darkness, 'antiMagic', [member({ kit: kit('lantern') })])).toBe(true);
  });

  it('rejects narrow passages for a keyword threat needing more heroes than fit', () => {
    const swarm = [{ id: 'swarm' as const, level: 3 as const }];
    expect(restrictionKeepsAnswers(swarm, 'narrowPassages')).toBe(true);
    const wide = { ...threatRules, levels: { approach: [2, 3, 4], keyword: [1, 2, 4] } };
    expect(restrictionKeepsAnswers(swarm, 'narrowPassages', undefined, wide)).toBe(false);
  });

  it('answers through heroAnswers with the restriction applied', () => {
    const foggy = heroAnswers(member({ classId: 'ranger' }), 'thickFog');
    expect(foggy.keywords).toEqual([]);
  });
});

describe('daily surges', () => {
  const tierDungeons = ['harpyCliffs', 'thunderPlateau', 'boneField'] as const;
  const briefings = () =>
    Object.fromEntries(tierDungeons.map((id) => [id, compose(id, 12)])) as Record<string, ReturnType<typeof compose>>;

  it('rolls one surge some days, and none without a matching threat', () => {
    const rolled = days(50).map((day) => rollSurge(day, 4, briefings()));
    expect(rolled.some((s) => s !== null)).toBe(true);
    expect(rolled.filter(Boolean).every((s) => (tierDungeons as readonly string[]).includes(s!.dungeonId))).toBe(true);
    // Nothing to raise: no surge.
    const quiet = { d: { threats: [{ id: 'locked' as const, level: 1 as const }], restriction: null, opportunity: null } };
    expect(days(50).every((day) => rollSurge(day, 4, quiet) === null)).toBe(true);
    // The same day always rolls the same surge.
    expect(rollSurge(12, 4, briefings())).toEqual(rollSurge(12, 4, briefings()));
  });

  it('raises the threat by one level, capped at 3, and names the surge', () => {
    const raised = withSurge({ threats: [{ id: 'traps', level: 1 }], restriction: null, opportunity: null }, 'traps');
    expect(raised.threats[0]).toEqual({ id: 'traps', level: 2, surge: 'boobyTrapped' });
    const capped = withSurge({ threats: [{ id: 'undead', level: 3 }], restriction: null, opportunity: null }, 'undead');
    expect(capped.threats[0]).toEqual({ id: 'undead', level: 3, surge: 'restlessDead' });
    const hunted = withSurge({ threats: [{ id: 'beasts', level: 2 }], restriction: null, opportunity: null }, 'beasts');
    expect(hunted.threats[0]).toEqual({ id: 'beasts', level: 3, surge: 'packHunt' });
  });
});
