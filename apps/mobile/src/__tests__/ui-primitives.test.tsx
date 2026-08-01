import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Button, StatePanel } from '../components/ui';

describe('mobile UI primitives', () => {
  it('gives buttons an accessible label and at least a 44dp target', async () => {
    const onPress = jest.fn();
    const view = await render(<Button label="Continue" onPress={onPress} />);
    const button = view.getByRole('button', { name: 'Continue' });

    await fireEvent.press(button);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(StyleSheet.flatten(button.props.style).minHeight).toBeGreaterThanOrEqual(44);
  });

  it.each(['loading', 'empty', 'error', 'offline', 'success'] as const)(
    'renders the %s surface state',
    async (state) => {
      const view = await render(<StatePanel state={state} />);
      expect(view.toJSON()).not.toBeNull();
    },
  );

  it('marks a loading button busy and prevents duplicate presses', async () => {
    const onPress = jest.fn();
    const view = await render(<Button label="Save" loading onPress={onPress} />);
    const button = view.getByRole('button', { name: 'Save' });

    await fireEvent.press(button);

    expect(onPress).not.toHaveBeenCalled();
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });
});
