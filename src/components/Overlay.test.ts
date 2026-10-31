import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { createInitialSave } from '@/game/save';
import type { GearInstance } from '@/game/types';

import { Overlay, overlayHandlers } from './Overlay';
import { SalvageDialog } from './SalvageDialog';

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

const backdropOf = (overlay: Element): Element => overlay.props.children as Element;
const contentOf = (overlay: Element): Element => backdropOf(overlay).props.children as Element;

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

  it('never closes from a tap inside the panel', () => {
    const onClose = () => {};
    const overlay = Overlay({ onClose, children: null });
    expect(contentOf(overlay).props.onPress).not.toBe(onClose);
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
    expect(dimOf('center')).toMatchObject({ justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' });
    expect(dimOf('bottom')).toMatchObject({ justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' });
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
