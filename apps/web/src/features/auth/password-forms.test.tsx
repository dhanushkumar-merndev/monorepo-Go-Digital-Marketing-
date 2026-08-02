import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthContext } from './auth-provider';
import { testAuthContext } from './auth-component-test-utils';
import { ForgotPasswordForm } from './forgot-password-form';
import { ResetPasswordForm } from './reset-password-form';

describe('password recovery forms', () => {
  afterEach(cleanup);

  it('shows the same non-enumerating forgot-password success state', async () => {
    const requestPasswordReset = vi.fn(async () => undefined);
    render(
      <AuthContext.Provider value={testAuthContext({ requestPasswordReset })}>
        <ForgotPasswordForm />
      </AuthContext.Provider>,
    );

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'asha@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send reset instructions' }));

    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText(/does not confirm whether an account exists/)).toBeInTheDocument();
    expect(requestPasswordReset).toHaveBeenCalledWith('asha@example.com');
  });

  it('blocks a mismatched password before consuming the reset token', async () => {
    const resetPassword = vi.fn(async () => undefined);
    render(
      <AuthContext.Provider value={testAuthContext({ resetPassword })}>
        <ResetPasswordForm token={'r'.repeat(48)} />
      </AuthContext.Provider>,
    );

    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'correct-horse-battery' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'different-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('submits a matching password and shows the completed state', async () => {
    const resetPassword = vi.fn(async () => undefined);
    render(
      <AuthContext.Provider value={testAuthContext({ resetPassword })}>
        <ResetPasswordForm token={'r'.repeat(48)} />
      </AuthContext.Provider>,
    );

    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'correct-horse-battery' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'correct-horse-battery' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() =>
      expect(resetPassword).toHaveBeenCalledWith({
        password: 'correct-horse-battery',
        token: 'r'.repeat(48),
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Password changed' })).toBeInTheDocument();
  });
});
