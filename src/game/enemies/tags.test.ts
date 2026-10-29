import { dungeons } from '@/content/dungeons';

import { dungeonTags } from '../dungeons/tags';
import type { MobDef } from '../types';
import { familyTags, mobTags } from './tags';

const mob = (tags: MobDef['tags'], element?: MobDef['element']): MobDef => ({
  id: 'testMob',
  name: 'test mob',
  hp: 10,
  damage: 2,
  damageType: 'power',
  speed: 5,
  tags,
  element,
});

describe('mobTags', () => {
  it('appends the element after the tags', () => {
    expect(mobTags(mob(['spirit', 'beast'], 'fire'))).toEqual(['spirit', 'beast', 'fire']);
  });

  it('returns the tags as they are without an element', () => {
    expect(mobTags(mob(['undead', 'beast']))).toEqual(['undead', 'beast']);
  });
});

describe('familyTags', () => {
  it('keeps family, beast and undead tags in their order', () => {
    expect(familyTags(mob(['spirit', 'bird', 'beast', 'undead']))).toEqual(['spirit', 'bird', 'beast', 'undead']);
  });

  it('drops locals, trap, obstacle and the element', () => {
    expect(familyTags(mob(['humanoid', 'locals'], 'fire'))).toEqual(['humanoid']);
    expect(familyTags(mob(['trap', 'obstacle', 'brute']))).toEqual(['brute']);
  });
});

describe('dungeon tags', () => {
  it('are unchanged by extra family tags on the boss', () => {
    for (const dungeon of dungeons) {
      const tagged = { ...dungeon, boss: { ...dungeon.boss, tags: ['dragon', ...dungeon.boss.tags] as MobDef['tags'] } };
      expect(dungeonTags(tagged)).toEqual(dungeonTags(dungeon));
    }
  });
});
