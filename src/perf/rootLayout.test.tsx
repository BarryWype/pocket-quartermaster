/**
 * The root layout re-renders on a language change (the screens' titles are
 * translated), but its background services — upkeep, steps, notifications,
 * auto-gather, patrol alerts — must not: they mount once inside a memoized
 * component, so a layout re-render never restarts them and never re-runs
 * their effects.
 */
import type { ReactElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import RootLayout from '@/app/_layout';
import { useGameStore } from '@/store/gameStore';
import { useWorldStore } from '@/store/worldStore';

let mockLocale: 'en' | 'fr' = 'en';
jest.mock('@/hooks/useLanguage', () => ({ useLanguage: () => mockLocale }));
jest.mock('expo-font', () => ({ useFonts: () => [true, null] }));
/** The `screenOptions` the stack got on each of the layout's renders. */
const mockStackRenders: unknown[] = [];
jest.mock('expo-router', () => {
  const Stack = ({ children, screenOptions }: { children: ReactElement; screenOptions: unknown }) => {
    mockStackRenders.push(screenOptions);
    return children;
  };
  return { Stack: Object.assign(Stack, { Screen: () => null }) };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/components/IslandMenu', () => ({ IslandMenu: () => null, ISLAND_HEIGHT: 60 }));
jest.mock('@/components/RecipeToast', () => ({ RecipeToast: () => null }));
jest.mock('@/components/SecretToast', () => ({ SecretToast: () => null }));
jest.mock('@/components/TipBar', () => ({ TipBar: () => null }));
jest.mock('@/components/ui', () => ({ ScreenHeader: () => null }));
jest.mock('@/components/Price', () => ({ Price: () => null }));
jest.mock('@/hooks/useTodaySteps', () => ({ useStepTracking: jest.fn() }));
// Subscribes like the real hook: to the expeditions and today's steps.
jest.mock('@/hooks/useNotifications', () => {
  const { useGameStore } = jest.requireActual('@/store/gameStore');
  const { useWorldStore } = jest.requireActual('@/store/worldStore');
  return {
    useNotifications: jest.fn(() => {
      useGameStore((state: { save: { expeditions: unknown } }) => state.save.expeditions);
      useGameStore((state: { save: { steps: unknown } }) => state.save.steps);
      useWorldStore((state: { patrolMessage: unknown }) => state.patrolMessage);
    }),
    syncPlan: jest.fn(),
  };
});
jest.mock('@/hooks/useAutoGather', () => ({ useAutoGather: jest.fn() }));
jest.mock('@/hooks/usePatrols', () => ({ usePatrols: jest.fn() }));
jest.mock('@/services/walkTracking', () => ({}));
jest.mock('@/services/notifications', () => ({ configureNotifications: jest.fn(), configureChannels: jest.fn() }));

const serviceHooks = () => ({
  stepTracking: jest.requireMock('@/hooks/useTodaySteps').useStepTracking as jest.Mock,
  notifications: jest.requireMock('@/hooks/useNotifications').useNotifications as jest.Mock,
  autoGather: jest.requireMock('@/hooks/useAutoGather').useAutoGather as jest.Mock,
  patrols: jest.requireMock('@/hooks/usePatrols').usePatrols as jest.Mock,
});

describe('the root layout', () => {
  it('re-renders without re-running its background services', () => {
    const hooks = serviceHooks();
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(<RootLayout />);
    });
    mockLocale = 'fr';
    act(() => {
      renderer!.update(<RootLayout />);
    });
    mockLocale = 'en';
    act(() => {
      renderer!.update(<RootLayout />);
    });
    for (const hook of [hooks.stepTracking, hooks.notifications, hooks.autoGather, hooks.patrols]) {
      expect(hook).toHaveBeenCalledTimes(1);
    }
    act(() => renderer!.unmount());
  });

  it('stays put when a step, an expedition or a patrol message comes in; only its services re-render', () => {
    const notifications = serviceHooks().notifications;
    let renderer: ReactTestRenderer;
    act(() => {
      renderer = create(<RootLayout />);
    });
    const layoutRenders = mockStackRenders.length;
    const serviceRenders = notifications.mock.calls.length;
    const screenOptions = mockStackRenders.at(-1);

    act(() => {
      useGameStore.getState().recordSteps('2026-11-01', 120);
    });
    act(() => {
      const { save } = useGameStore.getState();
      useGameStore.setState({ save: { ...save, expeditions: [...save.expeditions] } });
    });
    act(() => {
      useWorldStore.getState().set({ patrolMessage: { text: 'won', at: 1 } });
    });

    expect(mockStackRenders.length).toBe(layoutRenders);
    expect(mockStackRenders.at(-1)).toBe(screenOptions);
    expect(notifications.mock.calls.length).toBe(serviceRenders + 3);
    act(() => renderer!.unmount());
  });
});
