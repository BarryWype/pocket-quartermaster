import type { SaveData } from '../../save';
import { referenceSave } from '../reference';
import { sparesToKeep } from './families';

/** The tier 2 reference trio at the tier's end, with a spare piece of every type. */
const base = (): SaveData => referenceSave(2, 'end', 3);

describe('spare pieces', () => {
  it('keeps the best spare piece of each type of the top two tiers', () => {
    const save = base();
    const extra = { ...save.gear.find((g) => g.uid === 'spare:axe')!, uid: 'old-axe', itemId: 'axe1' };
    const older = { ...extra, uid: 'older-axe', itemId: 'axe1', roll: 3 };
    const kept = sparesToKeep({ ...save, gear: [...save.gear, extra, older] }, 3);
    expect(kept.has('spare:axe')).toBe(true);
    expect(kept.has('old-axe')).toBe(false);
    expect(sparesToKeep({ ...save, gear: [...save.gear, older] }, 4).has('spare:axe')).toBe(false);
  });
});
