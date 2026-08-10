import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClientError } from './auth-api-client';
import { AuthContext, type AuthContextValue } from './auth-provider';
import { testAuthContext, testAuthSession } from './auth-component-test-utils';
import type { GoogleCredentialInput } from './auth-types';
import { AuthenticationMethodsScreen } from './authentication-methods';

vi.mock('./google-identity-services', () => ({
  GoogleIdentityButton: ({
    ariaLabel,
    onCredential,
    onFailure,
  }: {
    ariaLabel?: string;
    onCredential(input: GoogleCredentialInput): Promise<void>;
    onFailure?(error: unknown): void;
  }) => (
    <button
      aria-label={ariaLabel}
      onClick={() => {
        void onCredential({
          challengeId: 'google-link-challenge',
          idToken: 'google-id-token',
        }).catch((error: unknown) => onFailure?.(error));
      }}
      type="button"
    >
      Continue with Google
    </button>
  ),
}));

const connectedPassword = {
  canUnlink: false,
  connected: true,
  email: 'asha@example.com',
  lastUsedAt: '2026-08-03T12:00:00.000Z',
  linkedAt: '2026-08-01T12:00:00.000Z',
  provider: 'PASSWORD' as const,
  unlinkBlockReason: 'LAST_LOGIN_METHOD',
};

const connectedGoogle = {
  canUnlink: true,
  connected: true,
  email: 'asha@gmail.com',
  lastUsedAt: '2026-08-03T12:00:00.000Z',
  linkedAt: '2026-08-02T12:00:00.000Z',
  provider: 'GOOGLE' as const,
};

describe('AuthenticationMethodsScreen', () => {
  afterEach(cleanup);

  it('shows connected methods and server-controlled unlink availability', async () => {
    renderScreen({
      listAuthenticationMethods: async () => [
        connectedPassword,
        { ...connectedGoogle, canUnlink: false, unlinkBlockReason: 'LAST_LOGIN_METHOD' },
      ],
    });

    expect(await screen.findByText('Email and password')).toBeInTheDocument();
    expect(screen.getByText('asha@gmail.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Update password' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(screen.getByRole('button', { name: 'Disconnect Google' })).toBeDisabled();
    expect(screen.getByText(/Connect another valid sign-in method/)).toBeInTheDocument();
  });

  it('connects Google only from the authenticated profile flow and refreshes the method list', async () => {
    const linkGoogleIdentity = vi.fn(async () => undefined);
    const listAuthenticationMethods = vi
      .fn()
      .mockResolvedValueOnce([
        connectedPassword,
        { canUnlink: false, connected: false, provider: 'GOOGLE' },
      ])
      .mockResolvedValue([connectedPassword, connectedGoogle]);
    renderScreen({ linkGoogleIdentity, listAuthenticationMethods });

    fireEvent.click(await screen.findByRole('button', { name: 'Connect Google account' }));

    await waitFor(() =>
      expect(linkGoogleIdentity).toHaveBeenCalledWith({
        challengeId: 'google-link-challenge',
        idToken: 'google-id-token',
      }),
    );
    expect(
      await screen.findByText('Google is now connected as a sign-in method.'),
    ).toBeInTheDocument();
    expect(screen.getByText('asha@gmail.com')).toBeInTheDocument();
  });

  it('reports an account-linking conflict without exposing server detail', async () => {
    const linkGoogleIdentity = vi.fn(async () => {
      throw new ApiClientError('internal provider subject detail', 409, 'GOOGLE_IDENTITY_CONFLICT');
    });
    renderScreen({
      linkGoogleIdentity,
      listAuthenticationMethods: async () => [
        connectedPassword,
        { canUnlink: false, connected: false, provider: 'GOOGLE' },
      ],
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Connect Google account' }));

    expect(await screen.findByText('Google account already connected')).toBeInTheDocument();
    expect(screen.queryByText(/provider subject detail/)).not.toBeInTheDocument();
  });

  it('confirms unlinking and preserves the current CRM session when the API does', async () => {
    const unlinkGoogleIdentity = vi.fn(async () => ({
      currentSessionRevoked: false,
      unlinked: true as const,
    }));
    const listAuthenticationMethods = vi
      .fn()
      .mockResolvedValueOnce([connectedPassword, connectedGoogle])
      .mockResolvedValue([
        connectedPassword,
        { canUnlink: false, connected: false, provider: 'GOOGLE' },
      ]);
    renderScreen({ listAuthenticationMethods, unlinkGoogleIdentity });

    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect Google' }));
    const confirmation = screen.getAllByRole('button', { name: 'Disconnect Google' }).at(-1);
    expect(confirmation).toBeDefined();
    if (confirmation !== undefined) fireEvent.click(confirmation);

    await waitFor(() => expect(unlinkGoogleIdentity).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText('Google was disconnected. Your other sign-in method remains active.'),
    ).toBeInTheDocument();
  });
});

function renderScreen(overrides: Partial<AuthContextValue>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const session = testAuthSession('SALESPERSON', [
    'account.profile.read',
    'account.profile.update',
  ]);
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={testAuthContext({ session, ...overrides })}>
        <AuthenticationMethodsScreen />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}
