import { expeditionRules } from '@/content/dungeons';
import { heroClasses, newHero } from '@/content/heroes';
import { dungeonById, itemById } from '@/content/lookup';

import { createInitialSave } from '../save';
import type { Briefing, ConsumableDef, DungeonDef, EncounterDef, HeroClassId, MobGroup, ThreatId } from '../types';
import { untriggeredSalvage } from './expeditions';
import { healingPotion } from '../team/team';
import { prepareParty, simulateRun, type PartyMember } from './simulate';

// Class signatures inside the run: what simulateRun does with them.

const steady = { ...expeditionRules, mishapChance: 0, fortune: 0, damageVariance: 0, enemyCritChance: 0 };
const briefing = (extra: Partial<Briefing> = {}): Briefing => ({ threats: [], restriction: null, opportunity: null, ...extra });
const threat = (id: ThreatId, level: 1 | 2 | 3, extra: Partial<Briefing> = {}): Briefing => briefing({ threats: [{ id, level }], ...extra });
const consumable = (id: string) => itemById[id] as ConsumableDef;

/** A party member of this class, with its class abilities. */
function member(heroId: string, classId: HeroClassId, overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    heroId,
    name: heroId,
    classId,
    traitId: 'none',
    weaponName: null,
    gearKeywords: [],
    heavy: false,
    concealed: false,
    maxHp: 1e4,
    hp: overrides.hp ?? overrides.maxHp ?? 1e4,
    power: 1000,
    magic: 0,
    damageStat: 'power',
    armour: 0,
    resistance: 0,
    evasion: 0,
    speed: 0,
    crit: 0,
    luck: 0,
    threat: 1,
    resists: [],
    familyTags: [],
    abilities: heroClasses[classId].abilities,
    consumable: null,
    ...overrides,
  };
}

const pool = (encounters: EncounterDef[], boss: Partial<DungeonDef['boss']> = {}, count: [number, number] = [4, 4]): DungeonDef => ({
  ...dungeonById.ratCellar,
  encounterCount: count,
  encounters,
  boss: { id: 'testBoss', name: 'test boss', hp: 40, damage: 1, damageType: 'power', speed: 5, tags: [], ...boss },
});
const fight = (mobs: MobGroup[]): EncounterDef => ({ type: 'fight', weight: 1, mobs });
/** Family tags from gear, enough to answer an opportunity of that family at `level`. */
const answers = (family: PartyMember['familyTags'][number]['family'], level: 1 | 2) => [
  { family, count: level === 1 ? 2 : 4, source: 'gear' as const },
];
const wolves = pool([fight([{ mobId: 'wolfPup', count: 2 }])]);
const run = (party: PartyMember[], dungeon: DungeonDef, b: Briefing, extra = {}) =>
  simulateRun(party, dungeon, 's', { rules: steady, briefing: b, ...extra });

describe('the Smuggler', () => {
  it('lifts the whole run’s gold by 10%', () => {
    const smuggled = run([member('s', 'smuggler')], wolves, briefing());
    const plain = run([member('w', 'warrior')], wolves, briefing());
    expect(smuggled.bonusGold).toBeCloseTo(plain.bonusGold * 1.1, 5);
  });
});

describe('opportunity signatures', () => {
  it('doubles Old inscriptions for a Scholar', () => {
    const inscriptions = briefing({ opportunity: 'oldInscriptions' });
    expect(run([member('s', 'scholar', { familyTags: answers('watch', 2) })], wolves, inscriptions).opportunity?.xpMultiplier).toBeCloseTo(1.5);
    expect(run([member('f', 'frostMage', { familyTags: answers('watch', 2) })], wolves, inscriptions).opportunity?.xpMultiplier).toBeCloseTo(1.25);
  });

  it('raises the Bounty to +50% for a Diplomat', () => {
    const bounty = briefing({ opportunity: 'bounty' });
    expect(run([member('d', 'diplomat', { familyTags: answers('rally', 1) })], wolves, bounty).opportunity?.goldMultiplier).toBeCloseTo(1.5);
    expect(run([member('t', 'troubadour', { familyTags: answers('rally', 1) })], wolves, bounty).opportunity?.goldMultiplier).toBeCloseTo(1.3);
  });
});

describe('the Duelist', () => {
  const oneRound = { ...steady, maxRounds: 1 };
  const strike = (classId: HeroClassId, dungeon: DungeonDef) =>
    simulateRun([member('a', classId, { power: 10, crit: 100 })], dungeon, 's', { rules: oneRound }).encounters.at(-1)!.dealt.a;

  it('lands bigger crits against a lone enemy, and normal ones against a group', () => {
    const lone = pool([], { hp: 1e6 }, [1, 1]);
    expect(strike('duelist', lone)).toBeCloseTo(10 * 2.25);
    expect(strike('warrior', lone)).toBeCloseTo(10 * expeditionRules.critMultiplier);
    const group = pool([fight([{ mobId: 'ghoul', count: 2 }])], {}, [2, 2]);
    expect(simulateRun([member('a', 'duelist', { power: 1, crit: 100 })], group, 's', { rules: oneRound }).encounters[0].dealt.a).toBeCloseTo(
      expeditionRules.critMultiplier,
    );
  });
});

describe('raised allies', () => {
  const bones = pool([fight([{ mobId: 'restlessBones', count: 2 }])]);

  it('at Holy 1, the first undead fight’s fallen fight for the party in the next fight only', () => {
    const result = run([member('n', 'necromancer')], bones, threat('holy', 1));
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'n', key: 'raise', tag: 'undead' });
    expect(result.encounters[1].effects.some((e) => e.key === 'allies')).toBe(true);
    expect(result.encounters[2].effects.some((e) => e.key === 'allies' || e.key === 'raise')).toBe(false);
  });

  it('raises at every Holy level, and nobody without the threat', () => {
    for (const level of [2, 3] as const) {
      expect(run([member('n', 'necromancer')], bones, threat('holy', level)).encounters[0].effects).toContainEqual({ heroId: 'n', key: 'raise', tag: 'undead' });
    }
    expect(run([member('n', 'necromancer')], bones, briefing()).encounters.some((e) => e.effects.some((x) => x.key === 'raise'))).toBe(false);
  });

  it('lets the Beastmaster raise beasts at Beasts 1', () => {
    const result = run([member('b', 'beastmaster')], wolves, threat('beasts', 1));
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'b', key: 'raise', tag: 'beast' });
    expect(result.encounters[1].effects.some((e) => e.key === 'allies')).toBe(true);
  });
});

describe('the Cook', () => {
  it('heals everyone a little after every fight', () => {
    const result = run([member('c', 'cook', { hp: 5000 }), member('w', 'warrior', { hp: 5000 })], wolves, briefing());
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'c', key: 'fightHeal' });
    expect(result.encounters[0].healed.w).toBeCloseTo(0.03 * 1e4);
  });

  it('doubles the meal, and keeps it under Spoiled stores', () => {
    const stew = { kind: 'bossHeal' as const, pct: 0.15 };
    expect(run([member('c', 'cook')], wolves, briefing(), { meal: stew }).meal).toEqual({ kind: 'bossHeal', pct: 0.3 });
    expect(run([member('c', 'cook')], wolves, briefing({ restriction: 'spoiledStores' }), { meal: stew }).meal).toEqual({ kind: 'bossHeal', pct: 0.3 });
    expect(run([member('w', 'warrior')], wolves, briefing({ restriction: 'spoiledStores' }), { meal: stew }).meal).toBeNull();
  });
});

describe('the Monk', () => {
  it('hits at full strength on Sacred ground and in an anti-magic zone', () => {
    const ghouls = pool([fight([{ mobId: 'ghoul', count: 1 }])], {}, [2, 2]);
    const dealt = (classId: HeroClassId, restriction: Briefing['restriction'], magic = false) =>
      simulateRun([member('m', classId, { power: 1, magic: magic ? 1 : 0, damageStat: magic ? 'magic' : 'power' })], ghouls, 's', {
        rules: { ...steady, maxRounds: 1 },
        briefing: briefing({ restriction }),
      }).encounters[0].dealt.m;
    expect(dealt('monk', 'sacredGround')).toBeCloseTo(dealt('monk', null));
    expect(dealt('warrior', 'sacredGround')).toBeLessThan(dealt('warrior', null));
    // Anti-magic cuts a Monk's Magic like anyone's.
    expect(dealt('monk', 'antiMagic', true)).toBeLessThan(dealt('monk', null, true));
  });
});

describe('the Thief', () => {
  const lone = pool([], { hp: 1e6 }, [1, 1]);
  const strike = (classId: HeroClassId, concealed: boolean) =>
    simulateRun([member('a', classId, { power: 10, crit: 100, concealed })], lone, 's', { rules: { ...steady, maxRounds: 1 } }).encounters.at(-1)!.dealt.a;

  it('crits ×1.5 harder with a Concealed weapon only', () => {
    expect(strike('thief', true)).toBeCloseTo(strike('thief', false) * 1.5);
    expect(strike('warrior', true)).toBeCloseTo(strike('warrior', false));
  });

  it('opens a hidden cache step alone, with its ×2', () => {
    const caches = pool([{ type: 'event', weight: 1, eventId: 'cache' }], {}, [2, 2]);
    const opened = run([member('t', 'thief')], caches, briefing());
    expect(opened.encounters[0].effects).toContainEqual({ heroId: 't', key: 'cacheOpen' });
    expect(opened.encounters[0].gold).toBe(Math.round(0.25 * caches.gold[1] * 2));
    expect(run([member('w', 'warrior')], caches, briefing()).encounters[0].gold).toBe(0);
  });
});

describe('the Sorcerer', () => {
  it('attunes to the element that beats the dungeon’s', () => {
    const embers = pool([], { hp: 1e6, element: 'fire' }, [1, 1]);
    const dealt = (classId: HeroClassId) =>
      simulateRun([member('s', classId, { power: 0, magic: 10, damageStat: 'magic', crit: 0 })], embers, 's', { rules: { ...steady, maxRounds: 1 } }).encounters.at(-1)!
        .dealt.s;
    // Water beats fire: the advantage applies on top of the element wheel.
    expect(dealt('sorcerer')).toBeGreaterThan(dealt('frostMage') * 1.5);
  });
});

describe('the Druid', () => {
  it('sends one beast of the first beast fight away, once a run', () => {
    const packs = pool([fight([{ mobId: 'wolfPup', count: 2 }])], {}, [3, 3]);
    const result = run([member('d', 'druid')], packs, briefing());
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'd', key: 'calmBeast' });
    expect(result.encounters[1].effects.some((e) => e.key === 'calmBeast')).toBe(false);
  });
});

describe('the Diplomat', () => {
  it('talks the first fight out, once a run', () => {
    const packs = pool([fight([{ mobId: 'wolfPup', count: 2 }])], {}, [3, 3]);
    const result = run([member('d', 'diplomat')], packs, briefing());
    expect(result.encounters[0]).toMatchObject({ kind: 'quiet', cleared: true, mobs: [] });
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'd', key: 'parley' });
    expect(result.encounters[1].kind).toBe('fight');
  });
});

describe('the Engineer and the Ranger at a trap', () => {
  const snare = pool([{ type: 'trap', weight: 1, name: 'snare' }], {}, [2, 2]);
  const wounds = (classId: HeroClassId) => {
    const result = run([member('h', classId, { maxHp: 1000, hp: 1000 })], snare, threat('traps', 3));
    return result.encounters[0].taken.h ?? 0;
  };

  it('halves trap wounds for an Engineer and a Ranger alike', () => {
    expect(wounds('engineer')).toBeCloseTo(wounds('warrior') * 0.5);
    expect(wounds('ranger')).toBeCloseTo(wounds('warrior') * 0.5);
  });
});

describe('the Alchemist’s second slot', () => {
  const hitter = pool([], { hp: 1e6, damage: 1 }, [1, 1]);

  it('drinks the second potion once the first is gone, and salvages it when never drunk', () => {
    const potion = consumable('healingPotion');
    const low = member('a', 'alchemist', { maxHp: 100, hp: 3, power: 0, consumable: potion, potion });
    const result = simulateRun([low], hitter, 's', { rules: { ...steady, maxRounds: 1 } });
    expect(result.potionsDrunk).toEqual(['a']);
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'a', key: 'secondPotion' });

    const healthy = member('a', 'alchemist', { maxHp: 100, power: 0, consumable: potion, potion });
    const calm = simulateRun([healthy], hitter, 's', { rules: { ...steady, maxRounds: 1 } });
    expect(untriggeredSalvage([healthy], calm).map((s) => s.itemId)).toEqual(['healingPotion', 'healingPotion']);
  });

  it('only takes healing consumables, and only for an Alchemist', () => {
    expect(healingPotion('healingPotion')).not.toBeNull();
    expect(healingPotion('trailMix')).toBeNull();
    const alchemist = newHero('a', 'A', 'alchemist', 'none');
    const warrior = newHero('w', 'W', 'warrior', 'none');
    const save = {
      ...createInitialSave(),
      heroes: [
        { ...alchemist, equipment: { ...alchemist.equipment, potion: 'healingPotion' } },
        { ...warrior, equipment: { ...warrior.equipment, potion: 'healingPotion' } },
      ],
    };
    const [a, w] = prepareParty(save, ['a', 'w']);
    expect(a.potion?.id).toBe('healingPotion');
    expect(w.potion).toBeNull();
  });
});
