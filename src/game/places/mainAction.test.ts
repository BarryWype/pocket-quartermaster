import { offsetPosition } from '@/game/generation/geo';

import { mainAction } from './mainAction';

const place = { latitude: -41.2865, longitude: 174.7762 };
const at = (meters: number) => offsetPosition(place, meters, 0);

describe('the main action of a map sheet', () => {
  it('acts when the player is in range and nothing stops it', () => {
    expect(mainAction({ player: at(10), target: place, range: 50, problem: null })).toEqual({ kind: 'act' });
  });

  it('walks when the player is out of range, with the distance rounded to the metre', () => {
    const action = mainAction({ player: at(320.4), target: place, range: 50, problem: null });
    expect(action.kind).toBe('walk');
    expect(action.kind === 'walk' && action.meters).toBe(320);
  });

  it('walks before any other problem: the player has to get there first', () => {
    expect(mainAction({ player: at(320), target: place, range: 50, problem: 'gold' }).kind).toBe('walk');
  });

  it('ignores the rule’s own tooFar: distance is judged here', () => {
    expect(mainAction({ player: at(10), target: place, range: 50, problem: 'tooFar' })).toEqual({ kind: 'act' });
  });

  it('is blocked with the rule’s reason when in range', () => {
    expect(mainAction({ player: at(10), target: place, range: 50, problem: 'gold' })).toEqual({ kind: 'blocked', reason: 'gold' });
  });

  it('counts exactly at the range as in range', () => {
    // offsetPosition and distanceMeters round-trip to within a millimetre; a hair inside the range is "at" it.
    expect(mainAction({ player: at(49.999), target: place, range: 50, problem: null })).toEqual({ kind: 'act' });
  });

  it('acts from any distance for actions that work anywhere, and is still blocked by their own problem', () => {
    expect(mainAction({ player: at(900), target: place, range: 50, problem: null, anywhere: true })).toEqual({ kind: 'act' });
    expect(mainAction({ player: at(900), target: place, range: 50, problem: 'noHero', anywhere: true })).toEqual({
      kind: 'blocked',
      reason: 'noHero',
    });
  });
});
