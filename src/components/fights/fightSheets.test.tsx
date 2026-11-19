import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { sanctums } from '@/content/sanctums';
import { offsetPosition } from '@/game/generation/geo';
import type { PatrolSpawn } from '@/game/patrols/generate';
import type { PlaceSpawn } from '@/game/places/generate';
import { createInitialSave, type SaveData } from '@/game/save';
import type { SanctumSpawn } from '@/game/sanctums/sanctums';
import { t, tr } from '@/i18n';
import { useGameStore } from '@/store/gameStore';

import { SecretSheet } from '../places/SecretSheet';
import { PatrolSheet } from './PatrolSheet';
import { SanctumSheet } from './SanctumSheet';
import { TravellerSheet } from './TravellerSheet';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), useIsFocused: () => true }));

const NBSP = ' ';
const origin = { latitude: -41.2865, longitude: 174.7762 };
const now = Date.now();
const near = offsetPosition(origin, 5, 0);
const far = offsetPosition(origin, 320, 0);

const walker = (kind: PatrolSpawn['kind'], difficulty: PatrolSpawn['difficulty'] = 'easy'): PatrolSpawn => ({
  id: `patrol:${kind}:1`,
  tile: 'tile',
  window: 0,
  kind,
  difficulty,
  tier: 1,
  path: { waypoints: [origin], loopMs: 3_600_000, phaseMs: 0 },
  startsAt: now - 600_000,
  endsAt: now + 3_600_000,
});
const sanctum: SanctumSpawn = { id: 'sanctum:1', sanctumId: sanctums[0].id, position: origin, expiresAt: now + 3_600_000 };
const secret = (kind: PlaceSpawn['kind']): PlaceSpawn => ({
  id: `${kind}-1`,
  kind,
  group: 'g',
  tile: 't',
  position: origin,
  startsAt: now - 3_600_000,
  expiresAt: now + 2 * 3_600_000,
  roll: 0.3,
});

let renderer: ReactTestRenderer | null = null;
const text = () => JSON.stringify(renderer!.toJSON());
const titles = () =>
  renderer!.root.findAll((node) => typeof node.props.title === 'string' && typeof node.props.onPress === 'function').map((node) => node.props.title as string);
const press = (title: string) =>
  act(() => {
    renderer!.root.findAll((node) => node.props.title === title && typeof node.props.onPress === 'function')[0].props.onPress();
  });
const tabLabels = () =>
  renderer!.root
    .findAll((node) => node.props.accessibilityRole === 'tab' && typeof node.props.onPress === 'function' && typeof node.props.accessibilityLabel === 'string')
    .map((node) => node.props.accessibilityLabel as string)
    .filter((label, i, all) => all.indexOf(label) === i);
const setSave = (save: SaveData) =>
  act(() => {
    useGameStore.setState({ save });
  });
const show = (element: React.ReactElement) =>
  act(() => {
    renderer = create(element);
  });

describe('fight sheets on the template', () => {
  beforeEach(() => setSave(createInitialSave()));
  afterEach(() => {
    act(() => {
      renderer?.unmount();
    });
    renderer = null;
  });

  it('a patrol: foes, threats and drops in the peek; the walk from afar, Fight here; Foes and Details tabs', () => {
    show(<PatrolSheet spawn={walker('goblins')} player={far} now={now} onClose={() => {}} />);
    expect(text()).toMatch(/foes?: /);
    expect(text()).toContain('Drops: ');
    expect(titles().join('|')).toContain(`${NBSP}m to fight`);
    act(() => renderer!.unmount());
    show(<PatrolSheet spawn={walker('goblins')} player={near} now={now} onClose={() => {}} />);
    expect(titles()).toContain(t('patrols.fight'));
    press('More');
    expect(tabLabels()).toEqual([t('expeditions.foes'), t('placeSheet.tabs.details')]);
  });

  it('a Sanctum: its guardian and drops in the peek; without a sigil the main button says why', () => {
    show(<SanctumSheet spawn={sanctum} player={near} now={now} onClose={() => {}} />);
    expect(text()).toContain(tr(sanctums[0].guardian.name));
    expect(text()).toContain('Drops: ');
    expect(titles()).toContain('Needs a Sanctum Sigil');
    press('More');
    expect(tabLabels()).toEqual(['Sigil', 'Guardian']);
  });

  it('a Sanctum with a sigil: Challenge here, the walk from afar', () => {
    setSave({ ...createInitialSave(), sigils: [1] });
    show(<SanctumSheet spawn={sanctum} player={near} now={now} onClose={() => {}} />);
    expect(titles()).toContain(t('sanctum.challenge'));
    act(() => renderer!.unmount());
    show(<SanctumSheet spawn={sanctum} player={far} now={now} onClose={() => {}} />);
    expect(titles().join('|')).toContain(`Walk 320${NBSP}m to challenge`);
  });

  it('a wounded traveller: Help is the one action here, the walk from afar', () => {
    show(<TravellerSheet spawn={walker('wounded', null)} player={near} now={now} onClose={() => {}} />);
    const here = titles();
    expect(here.includes(t('patrols.help')) || here.includes(t('travellerSheet.nothingToGive'))).toBe(true);
    act(() => renderer!.unmount());
    show(<TravellerSheet spawn={walker('wounded', null)} player={far} now={now} onClose={() => {}} />);
    expect(titles().join('|')).toContain(`${NBSP}m to help`);
  });

  it('a trader: the main action opens the Trades tab', () => {
    show(<TravellerSheet spawn={walker('trader', null)} player={near} now={now} onClose={() => {}} />);
    press(t('patrols.trade'));
    expect(tabLabels()).toContain('Trades');
  });

  it('a secret place without a key: the key line, and the footer says a key is needed', () => {
    const base = createInitialSave();
    setSave({
      ...base,
      secretTips: [{ id: 'blackMarket|x', secret: 'blackMarket', source: 'traveller', sourceId: 'x', anchor: origin, foundAt: 0, expiresAt: now + 3_600_000 }],
    });
    show(<SecretSheet place={{ ...secret('blackMarket'), id: 'secret:blackMarket|x' }} player={near} now={now} onClose={() => {}} />);
    expect(text()).toContain('No key yet');
    expect(titles()).toContain('Needs a key to enter');
  });
});
