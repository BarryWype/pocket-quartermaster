import { createInitialSave, type SaveData } from '../save';
import { fragmentsTowardKey, hasKey, keyDots, keysHeld, secretLock, spendKey } from './keys';

const saveWith = (keyFragments: number): SaveData => ({ ...createInitialSave(), keyFragments });

describe('mysterious keys', () => {
  it('needs 4 fragments for a key', () => {
    expect(keysHeld(saveWith(3))).toBe(0);
    expect(hasKey(saveWith(3))).toBe(false);
    expect(keysHeld(saveWith(4))).toBe(1);
    expect(hasKey(saveWith(4))).toBe(true);
    expect(keysHeld(saveWith(9))).toBe(2);
    expect(fragmentsTowardKey(saveWith(9))).toBe(1);
  });

  it('spends a key and throws without one', () => {
    expect(spendKey(saveWith(5)).keyFragments).toBe(1);
    expect(() => spendKey(saveWith(3))).toThrow('No mysterious key');
  });

  it('shows the progress as dots, filled first', () => {
    expect(keyDots(saveWith(2))).toBe('●●○○');
    expect(keyDots(saveWith(5))).toBe('●○○○');
    expect(keyDots(saveWith(0))).toBe('○○○○');
  });

  it('locks the secret places without a key', () => {
    expect(secretLock(saveWith(3))).toBe('closed');
    expect(secretLock(saveWith(4))).toBe('open');
  });
});
