import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { sheetMaxHeight } from '@/content/overlay';
import { createInitialSave } from '@/game/save';
import type { GearInstance } from '@/game/types';

import { Overlay, overlayHandlers } from './Overlay';
import { SalvageDialog } from './SalvageDialog';

// SalvageDialog sizes its panel with the window's height; pin it so the
// dialog can be called as a plain function here.
jest.mock('./Sheet', () => ({ useSheetMaxHeight: () => 850 }));

/** A React element as the tests need it: its type and the props it was created with. */
type Element = { type: unknown; props: Record<string, unknown> };

/** Every element in the tree, depth-first. */
function allElements(node: unknown): Element[] {
  if (!node || typeof node !== 'object') return [];
  const element = 'type' in node && 'props' in node ? [node as Element] : [];
  const children = (node as { props?: { children?: unknown } }).props?.children;
  const kids = Array.isArray(children) ? children : [children];
  return [...element, ...kids.flatMap(allElements)];
}

/** The frame's first child: the backdrop Pressable, a sibling behind the panel. */
const frameChildren = (overlay: Element): Element[] =>
  (overlay.props.children as Element).props.children as unknown as Element[];
const backdropOf = (overlay: Element): Element => frameChildren(overlay)[0];
/** The frame's second child: the panel's slot, a plain View that takes no touch itself. */
const layoutOf = (overlay: Element): Element => frameChildren(overlay)[1];

describe('overlayHandlers', () => {
  it('closes on backdrop tap and Android back by default', () => {
    const close = () => {};
    expect(overlayHandlers(close, true)).toEqual({ backdrop: close, back: close });
  });

  it('ignores the backdrop tap and the back button when it must be answered', () => {
    let closed = false;
    const { backdrop, back } = overlayHandlers(() => {
      closed = true;
    }, false);
    expect(backdrop).toBeUndefined();
    back();
    expect(closed).toBe(false);
  });
});

describe('Overlay', () => {
  it('wires the backdrop tap and the back button to onClose', () => {
    let closed = false;
    const overlay = Overlay({ onClose: () => (closed = true), children: null });
    const back = overlay.props.onRequestClose as () => void;
    expect(back).toBeDefined();
    back();
    expect(closed).toBe(true);
    const tap = backdropOf(overlay).props.onPress as () => void;
    expect(tap).toBeDefined();
    tap();
    expect(closed).toBe(true);
  });

  it('puts the panel on a plain view in front of the backdrop, not inside it', () => {
    const overlay = Overlay({ onClose: () => {}, children: null });
    // The backdrop Pressable and the panel's slot are siblings; a tap inside the
    // panel never reaches the backdrop, and the panel takes no touch itself.
    expect(backdropOf(overlay).type).not.toBe(layoutOf(overlay).type);
    expect(layoutOf(overlay).props.onPress).toBeUndefined();
  });

  it('never closes from a tap inside the panel', () => {
    const onClose = () => {};
    const overlay = Overlay({ onClose, children: null });
    expect(allElements(overlay).filter((element) => element.props.onPress === onClose)).toEqual([backdropOf(overlay)]);
  });

  it('disables the backdrop tap and the back button with dismissOnBackdrop={false}', () => {
    const onClose = () => {};
    const overlay = Overlay({ onClose, dismissOnBackdrop: false, children: null });
    expect(backdropOf(overlay).props.onPress).toBeUndefined();
    expect(overlay.props.onRequestClose).not.toBe(onClose);
  });

  it('keeps the two looks: a dimmed centered dialog and a drawer rising from the bottom', () => {
    const dimOf = (position: 'center' | 'bottom') =>
      StyleSheet.flatten(backdropOf(Overlay({ onClose: () => {}, position, children: null })).props.style as StyleProp<ViewStyle>);
    expect(dimOf('center')).toMatchObject({ backgroundColor: 'rgba(0,0,0,0.5)' });
    expect(dimOf('bottom')).toMatchObject({ backgroundColor: 'rgba(0,0,0,0.4)' });
    const layoutOfPosition = (position: 'center' | 'bottom') =>
      StyleSheet.flatten(layoutOf(Overlay({ onClose: () => {}, position, children: null })).props.style as StyleProp<ViewStyle>);
    expect(layoutOfPosition('center')).toMatchObject({ justifyContent: 'center', pointerEvents: 'box-none' });
    expect(layoutOfPosition('bottom')).toMatchObject({ justifyContent: 'flex-end', pointerEvents: 'box-none' });
  });

  it('spans the whole screen on both platforms, so a bottom sheet touches the bottom', () => {
    for (const position of ['center', 'bottom'] as const) {
      const overlay = Overlay({ onClose: () => {}, position, children: null });
      expect(overlay.props.statusBarTranslucent).toBe(true);
      expect(overlay.props.navigationBarTranslucent).toBe(true);
    }
  });
});

describe('sheetMaxHeight', () => {
  it("takes at most the rules' share of the window", () => {
    expect(sheetMaxHeight(1000, 0)).toBe(850);
  });

  it('stops above the top inset and the margin when the window is short', () => {
    expect(sheetMaxHeight(600, 50)).toBe(510);
  });

  it('never goes below zero', () => {
    expect(sheetMaxHeight(10, 100)).toBe(0);
  });

  it('stops above the inset and margin when the share would take more', () => {
    expect(sheetMaxHeight(400, 60)).toBe(316);
  });
});

describe('SalvageDialog closed from the outside', () => {
  const gear: GearInstance = { uid: 'g1', itemId: 'sword1', quality: 'normal' };

  it('makes no change to the save: the backdrop is Cancel, only the button confirms', () => {
    let confirmed = false;
    let closed = false;
    const confirm = () => (confirmed = true);
    const dialog = SalvageDialog({ gear, save: createInitialSave(), onConfirm: confirm, onClose: () => (closed = true) });
    // The dialog sits on the shared overlay, whose dismissals all lead to onClose.
    expect(dialog.type).toBe(Overlay);
    const dismissed = dialog.props.onClose as () => void;
    dismissed();
    expect(confirmed).toBe(false);
    expect(closed).toBe(true);
    // Exactly one thing in the dialog confirms — the Salvage button.
    expect(allElements(dialog).filter((element) => element.props.onPress === confirm)).toHaveLength(1);
  });
});
