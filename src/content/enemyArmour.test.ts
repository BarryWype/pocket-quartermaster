import { dungeons } from './dungeons';
import { bosses, enemyArmourRules, mobById } from './enemies';
import { dungeonThreats } from './threats';

describe('natural armour', () => {
  const all = [...Object.values(mobById), ...bosses];
  const armouredKind = (mob: (typeof all)[number]) =>
    mob.tags.some((tag) => enemyArmourRules.tags.includes(tag)) || enemyArmourRules.names.includes(mob.name);

  test('only the armoured kinds have armour, at their tier’s value', () => {
    for (const mob of all) {
      if (armouredKind(mob)) expect(enemyArmourRules.byTier).toContain(mob.armour);
      else expect(mob.armour).toBeUndefined();
    }
    expect(enemyArmourRules.names.filter((name) => !all.some((mob) => mob.name === name && mob.armour))).toEqual([]);
  });

  test('armour grows with the tier', () => {
    expect([...enemyArmourRules.byTier].sort()).toEqual(enemyArmourRules.byTier);
  });

  test('Armoured briefings mostly fall where armoured enemies are', () => {
    let total = 0;
    let armoured = 0;
    for (const dungeon of dungeons) {
      const weight = dungeonThreats[dungeon.id]?.weights.armoured ?? 0;
      total += weight;
      const foes = [dungeon.boss, ...dungeon.encounters.flatMap((e) => (e.type === 'fight' ? e.mobs.map((g) => mobById[g.mobId]) : []))];
      if (foes.some((mob) => mob.armour)) armoured += weight;
    }
    expect(armoured / total).toBeGreaterThan(0.8);
  });
});
