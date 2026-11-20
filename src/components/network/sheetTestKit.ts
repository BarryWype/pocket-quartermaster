import { act, type ReactTestRenderer } from 'react-test-renderer';

/** Shared probes for the network sheet tests: the buttons by title, the tabs by label, and the whole text. */
export function sheetKit(get: () => ReactTestRenderer) {
  const pressables = () => get().root.findAll((node) => typeof node.props?.title === 'string' && typeof node.props?.onPress === 'function');
  const titles = () => [...new Set(pressables().map((node) => node.props.title as string))];
  const press = (title: string) =>
    act(() => {
      const node = pressables().find((entry) => entry.props.title === title);
      if (!node) throw new Error(`No button "${title}" in ${titles().join(', ')}`);
      node.props.onPress();
    });
  const byLabel = (label: string) =>
    get().root.findAll((node) => node.props?.accessibilityLabel === label && typeof node.props?.onPress === 'function')[0];
  const tap = (label: string) =>
    act(() => {
      byLabel(label).props.onPress();
    });
  const text = () => JSON.stringify(get().toJSON());
  return { titles, press, tap, byLabel, text };
}
