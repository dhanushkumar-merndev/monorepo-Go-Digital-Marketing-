import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SupabaseAuthCallbackPage from './page';

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@/lib/supabase-browser', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { exchangeCodeForSession: mocks.exchangeCodeForSession },
  }),
}));

describe('SupabaseAuthCallbackPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it('exchanges a PKCE code once and continues to MFA', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ data: { session: {} }, error: null });
    window.history.replaceState(
      {},
      '',
      '/auth/callback?code=single-use-code&next=account-settings',
    );

    render(<SupabaseAuthCallbackPage />);

    expect(screen.getByText(/Completing secure sign-in/u)).toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.exchangeCodeForSession).toHaveBeenCalledTimes(1);
      expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('single-use-code');
      expect(mocks.replace).toHaveBeenCalledWith('/auth/mfa?returnTo=%2F%3Fsettings%3Dmethods');
    });
  });

  it('returns to login when the code exchange fails', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: new Error('Invalid code'),
    });
    window.history.replaceState({}, '', '/auth/callback?code=invalid-code');

    render(<SupabaseAuthCallbackPage />);

    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/login?reason=oauth'));
  });
});
