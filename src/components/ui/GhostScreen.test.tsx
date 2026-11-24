import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { Text } from 'react-native';

import { Deferred } from './GhostScreen';

// The ghost shows first by design; the test only cares about the very first render.
jest.mock('@/hooks/useAfterFirstFrame', () => ({ useAfterFirstFrame: () => false }));

function mount(): { tree: ReactTestRenderer; text: () => string } {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <Deferred name="test" ghost={<Text>ghost</Text>}>
        <Text>content</Text>
      </Deferred>,
    );
  });
  return { tree, text: () => JSON.stringify(tree.toJSON()) };
}

describe('Deferred', () => {
  it('renders the ghost first by default', () => {
    const { tree, text } = mount();
    expect(text()).toContain('ghost');
    expect(text()).not.toContain('content');
    act(() => tree.unmount());
  });
});
