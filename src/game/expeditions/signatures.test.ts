import { expeditionRules } from '@/content/dungeons';
import { heroClasses, newHero } from '@/content/heroes';
import { dungeonById, itemById } from '@/content/lookup';

import { createInitialSave } from '../save';
import type { Briefing, ConsumableDef, DungeonDef, EncounterDef, HeroClassId, MobGroup, ThreatId } from '../types';
import { untriggeredSalvage } from './expeditions';
import { healingPotion, prepareParty, simulateRun, type PartyMember } from './simulate';

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
const wolves = pool([fight([{ mobId: 'wolfPup', count: 2 }])]);
const run = (party: PartyMember[], dungeon: DungeonDef, b: Briefing, extra = {}) =>
  simulateRun(party, dungeon, 's', { rules: steady, briefing: b, ...extra });

describe('the Smuggler', () => {
  it('fences what the thieves would take: no loot lost, a share of the top gold instead', () => {
    const fenced = run([member('s', 'smuggler')], wolves, threat('thieves', 2));
    expect(fenced.lostLoot).toBe(0);
    expect(fenced.fenceGold).toBe(Math.round(0.08 * wolves.gold[1]));
    expect(fenced.bonusGold).toBeGreaterThanOrEqual(fenced.fenceGold);
    const robbed = run([member('w', 'warrior')], wolves, threat('thieves', 2));
    expect(robbed.lostLoot).toBeGreaterThan(0);
    expect(robbed.fenceGold).toBe(0);
  });
});

describe('opportunity signatures', () => {
  it('doubles Old inscriptions for a Scholar', () => {
    const inscriptions = briefing({ opportunity: 'oldInscriptions' });
    expect(run([member('s', 'scholar')], wolves, inscriptions).opportunity?.xpMultiplier).toBeCloseTo(1.5);
    expect(run([member('f', 'frostMage')], wolves, inscriptions).opportunity?.xpMultiplier).toBeCloseTo(1.25);
  });

  it('raises the Bounty to +50% for a Diplomat', () => {
    const bounty = briefing({ opportunity: 'bounty' });
    expect(run([member('d', 'diplomat')], wolves, bounty).opportunity?.goldMultiplier).toBeCloseTo(1.5);
    expect(run([member('t', 'troubadour')], wolves, bounty).opportunity?.goldMultiplier).toBeCloseTo(1.3);
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

  it('at Undead 1, the first undead fight’s fallen fight for the party in the next fight only', () => {
    const result = run([member('n', 'necromancer')], bones, threat('undead', 1));
    expect(result.encounters[0].effects).toContainEqual({ heroId: 'n', key: 'raise', tag: 'undead' });
    expect(result.encounters[1].effects.some((e) => e.key === 'allies')).toBe(true);
    expect(result.encounters[2].effects.some((e) => e.key === 'allies' || e.key === 'raise')).toBe(false);
  });

  it('raises nobody at Undead 2, or without the threat', () => {
    for (const b of [threat('undead', 2), briefing()]) {
      expect(run([member('n', 'necromancer')], bones, b).encounters.some((e) => e.effects.some((x) => x.key === 'raise'))).toBe(false);
    }
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
    expect(dealt('monk', 'antiMagic', true)).toBeCloseTo(dealt('monk', null, true));
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
    expect(untriggeredSalvage([healthy], calm, { barren: false, gold: 0 }).map((s) => s.itemId)).toEqual(['healingPotion', 'healingPotion']);
  });

  it('only takes healing consumables, and only for an Alchemist', () => {
    expect(healingPotion('healingPotion')).not.toBeNull();
    expect(healingPotion('roguesRoll')).toBeNull();
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

describe('the Porter’s carried kit', () => {
  it('heals the hero it is carried for, and counts as the Porter’s for salvage', () => {
    const satchel = consumable('healersSatchel');
    const porter = member('p', 'porter', { power: 0, consumable: satchel, carriesFor: 'r' });
    const recipient = member('r', 'warrior', { maxHp: 100, hp: 3, power: 0, carriedKit: satchel, carriedBy: 'p' });
    const result = simulateRun([porter, recipient], pool([], { hp: 1e6, damage: 1 }, [1, 1]), 's', { rules: { ...steady, maxRounds: 1 } });
    expect(result.carriedHealed).toEqual(['p']);
    expect(result.consumed).not.toContain('p');
    expect(untriggeredSalvage([porter, recipient], result, { barren: false, gold: 0 })).toEqual([]);
  });
});
