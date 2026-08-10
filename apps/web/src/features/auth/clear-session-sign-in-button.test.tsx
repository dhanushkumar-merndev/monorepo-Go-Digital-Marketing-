import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ClearSessionSignInButton } from './clear-session-sign-in-button';

const actions = vi.hoisted(() => ({
  logout: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: actions.refresh, replace: actions.replace }),
}));

vi.mock('./auth-api-client', () => ({
  authApiClient: { logout: actions.logout },
}));

describe('ClearSessionSignInButton', () => {
  beforeEach(() => {
    actions.logout.mockReset();
    actions.refresh.mockReset();
    actions.replace.mockReset();
  });

  it('clears browser and API session state before returning to sign-in', async () => {
    actions.logout.mockResolvedValue(undefined);
    render(<ClearSessionSignInButton href="/login?returnTo=%2F" label="Sign in again" />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));

    await waitFor(() => expect(actions.logout).toHaveBeenCalledOnce());
    expect(actions.replace).toHaveBeenCalledWith('/login?returnTo=%2F');
    expect(actions.refresh).toHaveBeenCalledOnce();
  });

  it('continues to sign-in when server logout is unavailable', async () => {
    actions.logout.mockRejectedValue(new Error('offline'));
    render(<ClearSessionSignInButton href="/login" label="Sign in again" />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }));

    await waitFor(() => expect(actions.replace).toHaveBeenCalledWith('/login'));
    expect(actions.refresh).toHaveBeenCalledOnce();
  });
});
