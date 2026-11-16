import { notificationRules } from '@/content/notifications';

import { cellAt } from '../discovery/cells';
import { offsetPosition } from '../generation/geo';
import { createInitialSave, type SaveData } from '../save';
import { emptySupply } from '../supply/state';
import { defaultNotificationSettings, planNotifications } from './plan';

const HOUR = 3_600_000;
const origin = { latitude: -41.2865, longitude: 174.7762 };
/** Noon: outside the default quiet hours, so delivery times aren't moved. */
const noon = new Date(2026, 10, 16, 12, 0).getTime();

const raided = (): SaveData => {
  const base = createInitialSave();
  return {
    ...base,
    supply: {
      ...emptySupply(noon),
      hall: { cell: cellAt(origin), moves: [] },
      camps: [
        {
          id: 'c1',
          kind: 'timber',
          cell: cellAt(offsetPosition(origin, 800, 0)),
          quality: 2,
          foundedAt: 0,
          heroId: null,
          postedAt: null,
          stock: { wood: 5 },
          progress: 0,
          made: 0,
          settledAt: noon,
          inspectedUntil: 0,
          closedUntil: 0,
        },
      ],
      raid: { campId: 'c1', kind: 'goblins', tier: 1, landsAt: noon + 4 * HOUR, defenders: [], result: null },
    },
  };
};

describe('raid notifications', () => {
  const raidsOf = (save: SaveData, supplyLines: boolean, on = true) => {
    const settings = defaultNotificationSettings();
    const withCategory = { ...settings, categories: { ...settings.categories, raids: on } };
    return planNotifications(save, withCategory, noon, notificationRules, supplyLines).filter((n) => n.category === 'raids');
  };

  it('is planned at the announcement, two hours before the landing, pointing at the Network tab', () => {
    const [raid] = raidsOf(raided(), true);
    expect(raid.at).toBe(noon + 2 * HOUR);
    expect(raid.data).toEqual({ route: 'network' });
    expect(raid.title).toContain('timber camp');
  });

  it('is not planned with the switch off, with the category off, or once the raid has landed', () => {
    expect(raidsOf(raided(), false)).toEqual([]);
    expect(raidsOf(raided(), true, false)).toEqual([]);
    const landed = raided();
    const raid = landed.supply.raid!;
    expect(raidsOf({ ...landed, supply: { ...landed.supply, raid: { ...raid, result: { won: null, fighters: [] } } } }, true)).toEqual([]);
  });
});
