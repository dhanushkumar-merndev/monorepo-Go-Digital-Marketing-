import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthContext } from './auth-provider';
import { ApiClientError } from './auth-api-client';
import { testAuthContext } from './auth-component-test-utils';
import { LoginForm } from './login-form';

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams('returnTo=%2Fsessions'),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: navigation.replace }),
  useSearchParams: () => navigation.searchParams,
}));

describe('LoginForm', () => {
  afterEach(() => {
    cleanup();
    navigation.replace.mockReset();
  });

  it('associates validation errors and does not submit invalid credentials', async () => {
    const login = vi.fn();
    render(
      <AuthContext.Provider value={testAuthContext({ login, session: null, status: 'anonymous' })}>
        <LoginForm />
      </AuthContext.Provider>,
    );

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'not-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in securely' }));

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('submits credentials with a validated internal return path', async () => {
    const login = vi.fn(async () => undefined);
    render(
      <AuthContext.Provider value={testAuthContext({ login, session: null, status: 'anonymous' })}>
        <LoginForm />
      </AuthContext.Provider>,
    );

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'asha@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in securely' }));

    await waitFor(() =>
      expect(login).toHaveBeenCalledWith(
        { email: 'asha@example.com', password: 'correct horse' },
        '/sessions',
      ),
    );
  });

  it('shows a disabled-account response without exposing internal detail', async () => {
    const login = vi.fn(async () => {
      throw new ApiClientError('internal membership record detail', 403, 'ACCOUNT_SUSPENDED');
    });
    render(
      <AuthContext.Provider value={testAuthContext({ login, session: null, status: 'anonymous' })}>
        <LoginForm />
      </AuthContext.Provider>,
    );

    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'asha@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in securely' }));

    expect(await screen.findByText(/This account is disabled/)).toBeInTheDocument();
    expect(screen.queryByText(/membership record detail/)).not.toBeInTheDocument();
  });
});
