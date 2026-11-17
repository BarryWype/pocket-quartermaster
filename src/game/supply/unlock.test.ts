import { createInitialSave, type SaveData } from '../save';
import { tierBoss } from '../guild/guild';
import { emptySupply } from './state';
import { networkUnlocked } from './unlock';

const now = Date.UTC(2026, 10, 2, 12);

/** A save past the tutorial, with the network's tier 2 reveal not yet reached. */
const save = (): SaveData => {
  const base = createInitialSave();
  base.tutorial.step = 'done';
  return { ...base, supply: emptySupply(now) };
};

/** The same save with tier 2 reached, which reveals the network. */
const tierTwo = (base: SaveData): SaveData => ({ ...base, clearedDungeons: [tierBoss(1).id] });

describe('networkUnlocked', () => {
  it('stays locked before tier 2 without the debug unlock', () => {
    expect(networkUnlocked(save())).toBe(false);
  });

  it('unlocks at tier 2, like the rare places and the Sanctums', () => {
    expect(networkUnlocked(tierTwo(save()))).toBe(true);
  });

  it('unlocks with the debug unlock, even before tier 2', () => {
    const debug = { ...save(), supply: { ...save().supply, debugUnlocked: true } };
    expect(networkUnlocked(debug)).toBe(true);
  });
});

