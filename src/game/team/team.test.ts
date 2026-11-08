import { newHero, xpToNextLevel } from '@/content/heroes';
import { affinityRules } from '@/content/equipment';
import { itemById } from '@/content/lookup';

import { createInitialSave, type SaveData } from '../save';
import type { GearDef } from '../types';
import { addXp, canDismiss, dismissHero, equip, equipPreview, heroStats, markClassesSeen, rosterFull, statSources, unequip, upgradeMark } from './team';

function saveWithGear(): SaveData {
  return {
    ...createInitialSave(),
    gear: [
      { uid: 'g1', itemId: 'sword1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
      { uid: 'g2', itemId: 'wand1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
      { uid: 'g3', itemId: 'mail1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
    ],
    consumables: { healingPotion: 1 },
  };
}

const gear = (id: string) => itemById[id] as GearDef;

const hero = (save: SaveData, id: string) => save.heroes.find((h) => h.id === id)!;
const away = (save: SaveData, heroId: string): SaveData => ({
  ...save,
  expeditions: [{ id: 'e1', dungeonId: 'goblinWarren', heroIds: [heroId], startedAt: 0, endsAt: 1, seed: 's', notificationId: null }],
});

describe('heroStats', () => {
  it('a Thick skull helmet raises max HP by its share', () => {
    const base = createInitialSave();
    const helm = (affixes: { id: string; value: number }[]) =>
      equip({ ...base, gear: [{ uid: 'h', itemId: 'greatHelm1', rarity: 'uncommon' as const, roll: 8, affixes, rerolls: 0 }] }, 'bram', 'helmet', 'h');
    const plain = heroStats(helm([]), hero(helm([]), 'bram')).hp;
    const thick = helm([{ id: 'thickSkull', value: 10 }]);
    expect(heroStats(thick, hero(thick, 'bram')).hp).toBe(Math.round(plain * 1.1));
  });

  it('starts from class base stats, with the trait on top (Bram is resilient: +15% HP)', () => {
    const save = createInitialSave();
    expect(heroStats(save, hero(save, 'bram'))).toEqual({
      hp: Math.round(30 * 1.15),
      power: 4,
      magic: 0,
      armour: 3,
      resistance: 1,
      evasion: 0,
      speed: 5,
      crit: 5,
      luck: 0,
    });
    expect(heroStats(save, hero(save, 'lyra'))).toEqual({
      hp: 24,
      power: 5,
      magic: 0,
      armour: 1,
      resistance: 1,
      evasion: 5,
      speed: 7,
      crit: 5,
      luck: 0,
    });
  });

  it('adds gear stats, boosted by class affinity', () => {
    const save = equip(equip(saveWithGear(), 'bram', 'weapon', 'g1'), 'mira', 'weapon', 'g2');
    expect(heroStats(save, hero(save, 'bram')).power).toBe(Math.round(4 + gear('sword1').stats.power! * affinityRules.favoured));
    expect(heroStats(save, hero(save, 'mira')).magic).toBe(Math.round(6 + gear('wand1').stats.magic! * affinityRules.favoured));
  });

  it('cuts the scaling stats of unfit gear, and leaves the flat extras alone', () => {
    const druid = newHero('d', 'Dru', 'druid', 'greedy');
    const save = equip({ ...saveWithGear(), heroes: [...createInitialSave().heroes, druid] }, 'd', 'weapon', 'g1');
    const sword = gear('sword1');
    const stats = heroStats(save, hero(save, 'd'));
    expect(stats.power).toBe(Math.round(0 + sword.stats.power! * affinityRules.unfit));
    expect(stats.crit).toBe(5 + (sword.stats.crit ?? 0));
  });

  it('gives support classes a smaller affinity', () => {
    const paladin = newHero('p', 'Pal', 'paladin', 'greedy');
    const save = equip({ ...saveWithGear(), heroes: [...createInitialSave().heroes, paladin] }, 'p', 'weapon', 'g1');
    expect(heroStats(save, hero(save, 'p')).power).toBe(Math.round(3 + gear('sword1').stats.power! * affinityRules.favoured));
  });

  it('grows primaries with level and leaves secondaries at their milestones', () => {
    const save = createInitialSave();
    const levelThree = { ...hero(save, 'lyra'), level: 3 };
    // Ranger primaries: power every level; HP only at the 5/10/15 milestones.
    expect(heroStats(save, levelThree).power).toBe(5 + 2 * 2);
    expect(heroStats(save, levelThree).hp).toBe(24);
  });
});

describe('open gear', () => {
  it('lets every class wield every weapon type', () => {
    const equipped = equip(saveWithGear(), 'lyra', 'weapon', 'g1');
    expect(() => equip(saveWithGear(), 'lyra', 'weapon', 'g1')).not.toThrow();
    expect(hero(equipped, 'lyra').equipment.weapon).toBe('g1');
  });
});

describe('equip', () => {
  it('moves gear from one hero to another', () => {
    const save = equip(equip(saveWithGear(), 'bram', 'armor', 'g3'), 'lyra', 'armor', 'g3');
    expect(hero(save, 'bram').equipment.armor).toBeNull();
    expect(hero(save, 'lyra').equipment.armor).toBe('g3');
  });

  it('rejects gear in the wrong slot', () => {
    expect(() => equip(saveWithGear(), 'bram', 'armor', 'g1')).toThrow();
  });

  it('takes consumables out of the stock and gives them back on unequip', () => {
    const equipped = equip(saveWithGear(), 'bram', 'consumable', 'healingPotion');
    expect(equipped.consumables.healingPotion).toBe(0);
    expect(() => equip(equipped, 'lyra', 'consumable', 'healingPotion')).toThrow();
    expect(unequip(equipped, 'bram', 'consumable').consumables.healingPotion).toBe(1);
  });

  it('blocks changes while a hero is on an expedition', () => {
    const save = away(saveWithGear(), 'bram');
    expect(() => equip(save, 'bram', 'weapon', 'g1')).toThrow();
    expect(() => unequip(save, 'bram', 'weapon')).toThrow();
    expect(() => equip(save, 'lyra', 'armor', 'g3')).not.toThrow();
  });
});

describe('equipPreview', () => {
  it('shows the stat gain of an upgrade', () => {
    const save = equip(saveWithGear(), 'bram', 'weapon', 'g1');
    const withBetter = { ...save, gear: [...save.gear, { uid: 'g4', itemId: 'sword3', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 }] };
    const preview = equipPreview(withBetter, 'bram', 'weapon', 'g4');
    expect(preview).not.toBeNull();
    expect(preview!.after.power).toBeGreaterThan(preview!.before.power);
    expect(preview!.before).toEqual(heroStats(save, hero(save, 'bram')));
  });

  it('returns null when the piece cannot go in', () => {
    expect(equipPreview(saveWithGear(), 'bram', 'armor', 'g1')).toBeNull();
  });

  it('reports an off-hand unequipped by a two-handed weapon', () => {
    const base = {
      ...saveWithGear(),
      gear: [
        ...saveWithGear().gear,
        { uid: 'g5', itemId: 'shield1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
        { uid: 'g6', itemId: 'warhammer1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
      ],
    };
    const save = equip(equip(base, 'bram', 'weapon', 'g1'), 'bram', 'offhand', 'g5');
    const preview = equipPreview(save, 'bram', 'weapon', 'g6');
    expect(preview).not.toBeNull();
    // The warhammer adds no armour: the drop is the shield coming off.
    expect(preview!.after.armour).toBeLessThan(preview!.before.armour);
    expect(hero(equip(save, 'bram', 'weapon', 'g6'), 'bram').equipment.offhand).toBeNull();
  });
});

describe('roster', () => {
  it('dismisses a hero and returns their gear and consumable', () => {
    let save = equip(equip(saveWithGear(), 'bram', 'weapon', 'g1'), 'bram', 'consumable', 'healingPotion');
    save = dismissHero(save, 'bram');
    expect(save.heroes.map((h) => h.id)).toEqual(['lyra', 'mira']);
    expect(save.gear.map((g) => g.uid)).toContain('g1');
    expect(save.consumables.healingPotion).toBe(1);
  });

  it('refuses to dismiss a hero on an expedition, or the last one', () => {
    expect(canDismiss(away(createInitialSave(), 'bram'), 'bram')).toBe(false);
    expect(() => dismissHero(away(createInitialSave(), 'bram'), 'bram')).toThrow();
    const alone: SaveData = { ...createInitialSave(), heroes: [hero(createInitialSave(), 'mira')] };
    expect(canDismiss(alone, 'mira')).toBe(false);
  });

  it('stands the escort down when its hero is dismissed', () => {
    const save = { ...saveWithGear(), escort: { heroId: 'bram' } };
    expect(dismissHero(save, 'bram').escort).toBeNull();
    expect(dismissHero(save, 'lyra').escort).toEqual({ heroId: 'bram' });
  });

  it('is full at six heroes', () => {
    const six = Array.from({ length: 6 }, (_, i) => newHero(`h${i}`, 'X', 'warrior', 'tough'));
    expect(rosterFull(createInitialSave())).toBe(false);
    expect(rosterFull({ ...createInitialSave(), heroes: six })).toBe(true);
  });
});

describe('addXp', () => {
  it('levels up and carries over the remainder', () => {
    const save = createInitialSave();
    const leveled = addXp(hero(save, 'bram'), 320);
    expect(leveled.level).toBe(3);
    expect(leveled.xp).toBe(10);
    // 75 to level 2, then round(75 × 2^1.65) = 235, then 460 to level 4.
    expect(addXp(hero(save, 'bram'), 74).level).toBe(1);
    expect(addXp(hero(save, 'bram'), 75).level).toBe(2);
    expect(addXp(hero(save, 'bram'), 309).level).toBe(2);
    expect(addXp(hero(save, 'bram'), 310).level).toBe(3);
    expect([1, 2, 3, 4].map((level) => xpToNextLevel(level))).toEqual([75, 235, 460, 739]);
  });
});

describe('class slots and picks', () => {
  const save = (): SaveData => ({
    ...createInitialSave(),
    heroes: [newHero('a', 'A', 'alchemist', 'none'), newHero('p', 'P', 'porter', 'none'), newHero('w', 'W', 'warrior', 'none')],
    consumables: { healingPotion: 2, trailMix: 1 },
  });

  it('gives the Alchemist a second slot for healing consumables only, back to the stock on dismissal', () => {
    let next = equip(save(), 'a', 'potion', 'healingPotion');
    expect(next.heroes[0].equipment.potion).toBe('healingPotion');
    expect(next.consumables.healingPotion).toBe(1);
    expect(() => equip(save(), 'a', 'potion', 'trailMix')).toThrow();
    expect(() => equip(save(), 'w', 'potion', 'healingPotion')).toThrow();
    next = dismissHero(next, 'a');
    expect(next.consumables.healingPotion).toBe(2);
  });

  it('takes every strength of healing potion in the Alchemist’s slot', () => {
    const stocked = { ...save(), consumables: { ...save().consumables, standardHealingPotion: 1, greaterHealingPotion: 1 } };
    expect(equip(stocked, 'a', 'potion', 'standardHealingPotion').heroes[0].equipment.potion).toBe('standardHealingPotion');
    expect(equip(stocked, 'a', 'potion', 'greaterHealingPotion').heroes[0].equipment.potion).toBe('greaterHealingPotion');
  });

  it('marks classes as met once', () => {
    const next = markClassesSeen(save(), ['scholar', 'scholar', 'warrior']);
    expect(next.seenClasses).toEqual([...createInitialSave().seenClasses, 'scholar']);
    expect(markClassesSeen(next, ['scholar'])).toBe(next);
  });
});

describe('statSources', () => {
  it('splits a stat into class base, level growth and gear, adding back to the total', () => {
    const equipped = equip(saveWithGear(), 'bram', 'weapon', 'g1');
    const save = { ...equipped, heroes: equipped.heroes.map((h) => (h.id === 'bram' ? { ...h, level: 9 } : h)) };
    for (const stat of ['power', 'hp', 'crit'] as const) {
      const sources = statSources(save, hero(save, 'bram'), stat);
      expect(sources.base + sources.levels + sources.gear + sources.affixes).toBe(sources.total);
    }
    expect(statSources(save, hero(save, 'bram'), 'power').levels).toBeGreaterThan(0);
  });

  it('has no level growth at level 1', () => {
    const save = createInitialSave();
    expect(statSources(save, hero(save, 'bram'), 'power').levels).toBe(0);
  });

  // Affixes only add flat Speed or Evasion, and only the traits multiply HP,
  // so Crit is untouched with nothing equipped.
  it('has no gear contribution for a stat nothing else touches, with nothing equipped', () => {
    const save = createInitialSave();
    expect(statSources(save, hero(save, 'lyra'), 'crit').gear).toBe(0);
    expect(statSources(save, hero(save, 'lyra'), 'crit').affixes).toBe(0);
  });

  it('splits worn affix stats out of gear: Swift sums into Speed, not into gear', () => {
    const save: SaveData = {
      ...saveWithGear(),
      gear: saveWithGear().gear.map((piece) => (piece.uid === 'g1' ? { ...piece, affixes: [{ id: 'swift', value: 3 }] } : piece)),
    };
    const equipped = equip(save, 'bram', 'weapon', 'g1');
    const sources = statSources(equipped, hero(equipped, 'bram'), 'speed');
    expect(sources.affixes).toBe(3);
    expect(sources.base + sources.levels + sources.gear).toBe(sources.total - 3);

    const plain = equip(saveWithGear(), 'bram', 'weapon', 'g1');
    expect(statSources(plain, hero(plain, 'bram'), 'speed').gear).toBe(sources.gear);
  });
});

describe('two pieces of the same item', () => {
  it('equips the one picked, with its own stats', () => {
    let save: SaveData = {
      ...createInitialSave(),
      gear: [
        { uid: 'g1', itemId: 'sword1', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
        { uid: 'g2', itemId: 'sword1', rarity: 'common' as const, roll: 18, affixes: [], rerolls: 0 },
      ],
    };
    const warrior = save.heroes.find((h) => h.classId === 'warrior')!.id;
    save = equip(save, warrior, 'weapon', 'g1');
    const poorPower = heroStats(save, hero(save, warrior)).power;
    save = equip(save, warrior, 'weapon', 'g2');
    expect(hero(save, warrior).equipment.weapon).toBe('g2');
    expect(heroStats(save, hero(save, warrior)).power).toBeGreaterThan(poorPower);
  });
});

describe('upgradeMark', () => {
  const save: SaveData = {
    ...createInitialSave(),
    gear: [
      { uid: 'axe', itemId: 'axe3', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
      { uid: 'plate', itemId: 'plate3', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
      { uid: 'wand', itemId: 'wand3', rarity: 'common' as const, roll: 8, affixes: [], rerolls: 0 },
    ],
  };
  const mark = (heroId: string, slot: 'weapon' | 'armor', uid: string) =>
    upgradeMark(save.heroes.find((h) => h.id === heroId)!, equipPreview(save, heroId, slot, uid));

  it('never marks gear a class has no use for as an upgrade', () => {
    expect(mark('mira', 'weapon', 'axe')).not.toBe('up');
    expect(mark('mira', 'armor', 'plate')).not.toBe('up');
  });

  it('marks gear that raises what the class cares about', () => {
    expect(mark('mira', 'weapon', 'wand')).toBe('up');
    expect(mark('bram', 'weapon', 'axe')).toBe('up');
  });

  it('marks nothing without a preview', () => {
    expect(upgradeMark(save.heroes[0], null)).toBeUndefined();
  });
});
