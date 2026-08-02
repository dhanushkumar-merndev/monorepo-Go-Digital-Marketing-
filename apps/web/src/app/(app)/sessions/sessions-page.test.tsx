import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthContext } from '@/features/auth/auth-provider';
import { testAuthContext } from '@/features/auth/auth-component-test-utils';
import type { SessionDevice } from '@/features/auth/auth-types';

import SessionsPage from './page';

function renderSessions(context = testAuthContext()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={context}>
        <SessionsPage />
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}

describe('SessionsPage', () => {
  afterEach(cleanup);

  it('renders the empty state returned by the API', async () => {
    renderSessions(testAuthContext({ listSessions: async () => [] }));
    expect(
      await screen.findByRole('heading', { name: 'No sessions reported' }),
    ).toBeInTheDocument();
  });

  it('confirms and revokes another device session', async () => {
    const session: SessionDevice = {
      createdAt: '2026-08-01T10:00:00.000Z',
      current: false,
      deviceName: 'Android field device',
      expiresAt: '2026-08-09T10:00:00.000Z',
      id: '66666666-6666-4666-8666-666666666666',
      lastSeenAt: '2026-08-02T10:00:00.000Z',
    };
    const listSessions = vi.fn(async () => [session]);
    const revokeSession = vi.fn(async () => undefined);
    renderSessions(testAuthContext({ listSessions, revokeSession }));

    expect(await screen.findByText('Android field device')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(
      await screen.findByRole('heading', { name: 'Revoke Android field device?' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke session' }));

    await waitFor(() => expect(revokeSession).toHaveBeenCalledWith(session.id));
    expect(await screen.findByText('Android field device was signed out.')).toBeInTheDocument();
  });
});
