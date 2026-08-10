import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AccountMfaSettings } from './account-mfa-settings';

const supabaseMocks = vi.hoisted(() => {
  const mfa = {
    challengeAndVerify: vi.fn(),
    enroll: vi.fn(),
    listFactors: vi.fn(),
  };
  return { client: { auth: { mfa } }, ...mfa };
});

vi.mock('@/lib/supabase-browser', () => ({
  getSupabaseBrowserClient: () => supabaseMocks.client,
}));

describe('AccountMfaSettings', () => {
  beforeEach(() => {
    supabaseMocks.challengeAndVerify.mockResolvedValue({ data: {}, error: null });
    supabaseMocks.enroll.mockResolvedValue({
      data: {
        id: 'factor-new',
        totp: {
          qr_code:
            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="20" height="20"/%3E',
          secret: 'JBSWY3DPEHPK3PXP',
        },
        type: 'totp',
      },
      error: null,
    });
    supabaseMocks.listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the existing verified authenticator status', async () => {
    supabaseMocks.listFactors.mockResolvedValue({
      data: { totp: [{ id: 'factor-verified', status: 'verified' }] },
      error: null,
    });

    render(<AccountMfaSettings canManage />);

    expect(await screen.findByText('Configured')).toBeInTheDocument();
    expect(screen.getByText(/An authenticator app is connected/)).toBeInTheDocument();
  });

  it('enrolls and verifies an authenticator without navigating away', async () => {
    render(<AccountMfaSettings canManage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Set up authenticator app' }));
    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    expect(supabaseMocks.enroll).toHaveBeenCalledWith({
      factorType: 'totp',
      friendlyName: 'Authenticator app',
    });

    fireEvent.change(screen.getByLabelText('Six-digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enable two-step verification' }));

    await waitFor(() => {
      expect(supabaseMocks.challengeAndVerify).toHaveBeenCalledWith({
        code: '123456',
        factorId: 'factor-new',
      });
    });
    expect(await screen.findByText(/now configured for this account/)).toBeInTheDocument();
  });

  it('keeps setup read-only without profile update permission', async () => {
    render(<AccountMfaSettings canManage={false} />);

    expect(await screen.findByText('Read-only security settings')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Set up authenticator app' }),
    ).not.toBeInTheDocument();
  });
});
