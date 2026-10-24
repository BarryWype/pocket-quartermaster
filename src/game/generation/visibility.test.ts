import { spawnConfig } from '@/content/spawnConfig';

import { distanceMeters } from './geo';
import { generateSpawnsAround } from './spawns';
import type { Spawn } from './types';
import { visibleSpawns } from './visibility';

const player = { latitude: -41.2865, longitude: 174.7762 };
const now = Date.UTC(2026, 9, 24, 3, 0);

function staticSpawn(kind: 'ore' | 'herb', metresNorth: number): Spawn {
  return {
    id: `${kind}-${metresNorth}`,
    kind,
    resourceId: kind === 'ore' ? 'iron' : 'herb',
    tile: 'test',
    quantity: 1,
    boosted: false,
    expiresAt: now + 1,
    position: { latitude: player.latitude + metresNorth / 111_320, longitude: player.longitude },
  };
}

describe('visibleSpawns', () => {
  it('uses the visibility range of each kind', () => {
    const spawns = [
      staticSpawn('ore', 400),
      staticSpawn('ore', 600),
      staticSpawn('herb', 40),
      staticSpawn('herb', 60),
    ];
    const ids = visibleSpawns(spawns, player, now).map((v) => v.spawn.id);
    expect(ids).toEqual(['ore-400', 'herb-40']);
  });

  it('reports the distance to each visible spawn', () => {
    const [visible] = visibleSpawns([staticSpawn('herb', 30)], player, now);
    expect(visible.distance).toBeCloseTo(30, 0);
  });

  it('only returns generated spawns inside their range', () => {
    const visible = visibleSpawns(generateSpawnsAround(player, now), player, now);
    expect(visible.length).toBeGreaterThan(0);
    for (const { spawn, position } of visible) {
      expect(distanceMeters(player, position)).toBeLessThanOrEqual(
        spawnConfig.kinds[spawn.kind].visibilityMeters,
      );
    }
  });
});
