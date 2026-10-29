import { mobById, patrolMobId } from './enemies';

describe('enemies', () => {
  it('scales Speed by class and tier', () => {
    expect(mobById['ratSwarm'].speed).toBe(3);
    expect(mobById['cryptGuard'].speed).toBe(9);
    expect(mobById[patrolMobId('herd', 1, 'weak')].speed).toBe(7);
  });

  it('makes casters hit with Magic, everyone else with Power', () => {
    expect(mobById['orcShaman'].damageType).toBe('magic');
    expect(mobById['ratSwarm'].damageType).toBe('power');
    expect(mobById[patrolMobId('goblins', 1, 'weak')].damageType).toBe('power');
  });
});
