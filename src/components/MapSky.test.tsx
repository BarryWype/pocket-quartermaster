import { Animated } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { MapSky, skyConfig, useSkyPan } from './MapSky';

let mockAnimations = true;
jest.mock('@/hooks/useAnimationFrame', () => ({ useAnimationsEnabled: () => mockAnimations }));

function Sky() {
  const pan = useSkyPan();
  return <MapSky pan={pan} hour={12} raining={false} decor />;
}

/** The sky clock's stretches started so far: the timings that run it up for `clockStretchSeconds`. */
function countClockArms() {
  const timing = jest.spyOn(Animated, 'timing');
  return () => timing.mock.calls.filter(([, config]) => config.duration === skyConfig.clockStretchSeconds * 1000).length;
}

describe('the sky clock', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockAnimations = true;
  });

  it('re-arms once per stretch, and never after it is stopped', () => {
    jest.useFakeTimers();
    const arms = countClockArms();
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(<Sky />);
    });
    expect(arms()).toBe(1);

    // Animations off (screen left, app in the background), on again, off again, then the sky goes.
    for (const enabled of [false, true, false]) {
      mockAnimations = enabled;
      act(() => {
        renderer!.update(<Sky />);
      });
    }
    act(() => renderer!.unmount());
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // One arm per time animations came on; a stop never winds the clock again.
    expect(arms()).toBe(2);
    jest.useRealTimers();
  });
});
