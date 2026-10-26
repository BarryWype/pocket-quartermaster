import type { Ability, DungeonDef } from '../types';
import { dungeonTags } from './tags';

/** The abilities that help in this dungeon: matching its main tags, or the obstacles it has. */
export function countersFor(abilities: Ability[], dungeon: DungeonDef): Ability[] {
  const tags = dungeonTags(dungeon);
  const obstacleKinds = dungeon.encounters.flatMap((e) => (e.type === 'obstacle' ? [e.kind] : []));
  const hasLocals = dungeon.encounters.some((e) => e.type === 'locals');
  return abilities.filter((ability) => {
    switch (ability.kind) {
      case 'damageVsTag':
        return tags.includes(ability.tag);
      case 'trapDisarm':
      case 'trapReduce':
        return tags.includes('trap');
      case 'obstacleSolve':
        return ability.kinds.some((kind) => obstacleKinds.includes(kind));
      case 'calmBeasts':
        return tags.includes('beast');
      case 'localsReaction':
        return hasLocals;
    }
  });
}
