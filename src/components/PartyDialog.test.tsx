import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { dungeons } from '@/content/dungeons';
import { recipeById } from '@/content/lookup';
import { makeGearPiece } from '@/game/gear/make';
import { createInitialSave } from '@/game/save';
import type { Briefing } from '@/game/types';
import { useGameStore } from '@/store/gameStore';

import { ExpeditionDialog } from './ExpeditionDialog';

jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-router', () => ({ ...jest.requireActual('expo-router'), router: { push: () => {}, navigate: () => {} } }));

const briefing: Briefing = { threats: [{ id: 'beasts', level: 2 }, { id: 'darkness', level: 1 }], restriction: null, opportunity: null };
const dungeon = dungeons.find((d) => d.tier === 1 && !d.overnight && !d.isBoss)!;

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());
const byLabel = (renderer: ReactTestRenderer, match: (label: string) => boolean): ReactTestInstance[] =>
  renderer.root.findAll((node) => typeof node.props.accessibilityLabel === 'string' && typeof node.props.onPress === 'function' && match(node.props.accessibilityLabel));
const press = (node: ReactTestInstance) => act(() => node.props.onPress());

describe('the party dialog', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    const base = createInitialSave();
    useGameStore.setState({
      save: {
        ...base,
        tutorial: { ...base.tutorial, step: 'done' },
        stats: { ...base.stats, expeditionsLaunched: 5 },
        gear: [makeGearPiece('leather', 'leather1', 'common'), makeGearPiece('spear', 'spear1', 'common'), makeGearPiece('sallet', 'sallet1', 'common')],
      },
    });
  });
  afterEach(() => jest.useRealTimers());

  it('opens empty, fills from Suggest with the gear pending, and equips from the pickers', () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<ExpeditionDialog dungeon={dungeon} briefing={briefing} now={0} durationScale={1} onSend={() => {}} onClose={() => {}} />);
    });
    expect(byLabel(renderer, (l) => l === 'Add a hero')).toHaveLength(3);
    expect(text(renderer)).toContain('"?"');

    press(byLabel(renderer, (l) => l === 'Suggest a party')[0]);
    expect(text(renderer)).not.toContain('Add a hero');
    // Suggest's gear shows on the plates but stays off the save until Send.
    expect(useGameStore.getState().save.heroes.every((h) => !h.equipment.armor || h.equipment.armor === 'lyraHide')).toBe(true);
    act(() => jest.runOnlyPendingTimers());
    expect(text(renderer)).toMatch(/\d+%/);

    // The gear picker equips for good.
    press(byLabel(renderer, (l) => l.startsWith('Helmet:'))[0]);
    expect(text(renderer)).toContain('Equip on');
    press(byLabel(renderer, (l) => l.startsWith('Equip on'))[0]);
    expect(useGameStore.getState().save.heroes.some((h) => h.equipment.helmet === 'sallet')).toBe(true);

    // Removing a hero frees a plate; the hero picker adds one back.
    press(byLabel(renderer, (l) => l.startsWith('Remove '))[0]);
    press(byLabel(renderer, (l) => l === 'Add a hero')[0]);
    const add = byLabel(renderer, (l) => /^Add (?!a hero)/.test(l));
    expect(add).toHaveLength(1);
    press(add[0]);
    expect(text(renderer)).not.toContain('Add a hero');
    act(() => renderer.unmount());
  });
  it('forges a missing piece from the gear picker and puts it on the hero', () => {
    const save = useGameStore.getState().save;
    const materials = Object.fromEntries(recipeById.hood1.inputs.map((input) => [input.materialId, input.amount]));
    act(() => {
      useGameStore.setState({ save: { ...save, materials } });
    });
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<ExpeditionDialog dungeon={dungeon} briefing={briefing} now={0} durationScale={1} onSend={() => {}} onClose={() => {}} />);
    });
    press(byLabel(renderer, (l) => l === 'Add a hero')[0]);
    press(byLabel(renderer, (l) => /^Add (?!a hero)/.test(l))[0]);
    const heroId = useGameStore.getState().save.heroes.find((h) => text(renderer).includes(h.name))!.id;
    press(byLabel(renderer, (l) => l.startsWith('Helmet:'))[0]);
    expect(text(renderer)).toContain('Forge');
    // A row the materials don't cover says what is short.
    expect(text(renderer)).toContain('Short:');
    // The test renderer's views measure nothing: answer the row's measurement so its pop-up opens.
    for (const node of renderer.root.findAll((n) => n.props.collapsable === false && jest.isMockFunction(n.instance?.measureInWindow))) {
      node.instance.measureInWindow.mockImplementation((done: (x: number, y: number, w: number, h: number) => void) => done(0, 0, 50, 50));
    }
    press(byLabel(renderer, (l) => l.startsWith('Hide hood, Tier I'))[0]);
    press(byLabel(renderer, (l) => l === 'Forge')[0]);
    const after = useGameStore.getState().save;
    const hood = after.gear.find((g) => g.itemId === 'hood1')!;
    expect(after.heroes.find((h) => h.id === heroId)!.equipment.helmet).toBe(hood.uid);
    expect(text(renderer)).not.toContain('Equip on');
    act(() => renderer.unmount());
  });
});
