import { fireEvent, render } from '@testing-library/react-native';

import { LoginForm } from '../screens/login-screen';

describe('LoginForm', () => {
  it('starts native Google sign-in only when this build is configured', async () => {
    const onGoogleLogin = jest.fn(async () => undefined);
    const view = await render(
      <LoginForm
        googleAvailable
        loading={false}
        onGoogleLogin={onGoogleLogin}
        onLogin={jest.fn(async () => undefined)}
      />,
    );

    await fireEvent.press(view.getByRole('button', { name: 'Sign in with Google' }));

    expect(onGoogleLogin).toHaveBeenCalledTimes(1);
    expect(view.queryByText(/needs a configured native/iu)).toBeNull();

    await view.rerender(
      <LoginForm
        googleAvailable={false}
        loading={false}
        onGoogleLogin={onGoogleLogin}
        onLogin={jest.fn(async () => undefined)}
      />,
    );
    expect(
      view.getByRole('button', { name: 'Sign in with Google' }).props.accessibilityState,
    ).toMatchObject({ disabled: true });
    expect(view.getByText(/needs a configured native/iu)).toBeTruthy();
  });

  it('shows field errors and does not submit incomplete credentials', async () => {
    const onLogin = jest.fn(async () => undefined);
    const view = await render(<LoginForm loading={false} onLogin={onLogin} />);

    await fireEvent.press(view.getByRole('button', { name: 'Sign in' }));

    expect(view.getByText('Enter a valid email address.')).toBeTruthy();
    expect(view.getByText('Enter your password.')).toBeTruthy();
    expect(onLogin).not.toHaveBeenCalled();
  });

  it('submits normalized input through the auth manager and disables duplicate presses', async () => {
    const onLogin = jest.fn(async () => undefined);
    const view = await render(<LoginForm loading={false} onLogin={onLogin} />);

    await fireEvent.changeText(view.getByLabelText('Email address'), 'asha@example.com');
    await fireEvent.changeText(view.getByLabelText('Password'), 'secret-password');
    await fireEvent.press(view.getByRole('button', { name: 'Sign in' }));

    expect(onLogin).toHaveBeenCalledWith({
      email: 'asha@example.com',
      password: 'secret-password',
    });

    await view.rerender(<LoginForm loading onLogin={onLogin} />);
    expect(view.getByRole('button', { name: 'Sign in' }).props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
  });

  it('renders a safe server failure without echoing credentials', async () => {
    const view = await render(
      <LoginForm
        loading={false}
        message="The email address or password is incorrect."
        onLogin={jest.fn(async () => undefined)}
      />,
    );

    expect(view.getByText('The email address or password is incorrect.')).toBeTruthy();
    expect(view.queryByText(/refresh-token/u)).toBeNull();
  });
});
