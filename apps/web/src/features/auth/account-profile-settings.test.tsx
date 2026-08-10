import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AccountProfileSettings, explainPermission } from './account-profile-settings';
import { AuthContext } from './auth-provider';
import { testAuthContext, testAuthSession } from './auth-component-test-utils';

describe('AccountProfileSettings', () => {
  afterEach(cleanup);

  it('shows profile details and expands the current role permissions as a table', () => {
    const session = testAuthSession('AGENCY_ADMIN', [
      'account.profile.read',
      'platform.support_elevation.manage',
    ]);

    render(
      <AuthContext.Provider value={testAuthContext({ session })}>
        <AccountProfileSettings />
      </AuthContext.Provider>,
    );

    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('asha@example.com')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Agency Admin' }));

    expect(screen.getByRole('columnheader', { name: 'Permission ID' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Explanation' })).toBeInTheDocument();
    expect(screen.getByText('account.profile.read')).toBeInTheDocument();
    expect(screen.getByText('View account profile.')).toBeInTheDocument();
  });

  it('creates a readable explanation for full and scoped access', () => {
    expect(explainPermission('*')).toBe('Full access to all available features.');
    expect(explainPermission('commercial.bookings.approve')).toBe('Approve commercial bookings.');
  });

  it('lists every supported account role and marks the current role', () => {
    const session = testAuthSession('CLIENT_ADMIN');

    render(
      <AuthContext.Provider value={testAuthContext({ session })}>
        <AccountProfileSettings />
      </AuthContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'View all 12 roles' }));

    expect(screen.getByRole('heading', { name: 'All account roles' })).toBeInTheDocument();
    expect(screen.getByText('Agency Admin')).toBeInTheDocument();
    expect(screen.getByText('Billing and Documentation Executive')).toBeInTheDocument();
    expect(screen.getByText('RC and Registration Executive')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
  });
});
