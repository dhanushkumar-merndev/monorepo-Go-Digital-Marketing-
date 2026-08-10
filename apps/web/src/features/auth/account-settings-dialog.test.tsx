import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthContext } from './auth-provider';
import { testAuthContext, testAuthSession } from './auth-component-test-utils';
import { AccountSettingsDialog } from './account-settings-dialog';

vi.mock('./authentication-methods', () => ({
  AuthenticationMethodsScreen: () => <p>Embedded sign-in methods</p>,
}));

vi.mock('./account-profile-settings', () => ({
  AccountProfileSettings: () => <p>Embedded profile and permissions</p>,
}));

vi.mock('./account-mfa-settings', () => ({
  AccountMfaSettings: () => <p>Embedded two-step verification</p>,
}));

vi.mock('@/app/(app)/sessions/page', () => ({
  SessionsPanel: () => <p>Embedded active sessions</p>,
}));

describe('AccountSettingsDialog', () => {
  afterEach(cleanup);

  it('keeps profile, sign-in, verification and sessions inside one dialog', () => {
    const session = testAuthSession('CLIENT_ADMIN', [
      'account.profile.read',
      'account.profile.update',
      'account.sessions.read',
    ]);

    render(
      <AuthContext.Provider value={testAuthContext({ session })}>
        <AccountSettingsDialog onOpenChange={() => undefined} open />
      </AuthContext.Provider>,
    );

    expect(screen.getByRole('dialog', { name: 'Account settings' })).toBeInTheDocument();
    expect(screen.queryByText('Security')).not.toBeInTheDocument();
    expect(screen.queryByText('Supabase Auth')).not.toBeInTheDocument();
    expect(screen.getByText('Embedded profile and permissions')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Sign-in methods/i }));
    expect(screen.getByText('Embedded sign-in methods')).toBeInTheDocument();
    expect(screen.queryByText('Embedded profile and permissions')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Two-step verification/i }));
    expect(screen.getByText('Embedded two-step verification')).toBeInTheDocument();
    expect(screen.queryByText('Embedded sign-in methods')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Active sessions/i }));
    expect(screen.getByText('Embedded active sessions')).toBeInTheDocument();
    expect(screen.queryByText('Embedded two-step verification')).not.toBeInTheDocument();
  });

  it('does not expose active sessions without the sessions read permission', () => {
    const session = testAuthSession('SALESPERSON', ['account.profile.read']);

    render(
      <AuthContext.Provider value={testAuthContext({ session })}>
        <AccountSettingsDialog onOpenChange={() => undefined} open />
      </AuthContext.Provider>,
    );

    expect(screen.queryByRole('button', { name: /Active sessions/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign-in methods/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Two-step verification/i })).toBeInTheDocument();
  });
});
