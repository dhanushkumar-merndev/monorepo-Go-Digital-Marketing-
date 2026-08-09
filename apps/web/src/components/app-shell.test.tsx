import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthContext } from '@/features/auth/auth-provider';
import { testAuthContext, testAuthSession } from '@/features/auth/auth-component-test-utils';
import { roleCodes, type RoleCode } from '@/features/auth/auth-types';

import { AppShell } from './app-shell';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));

describe('AppShell permission-aware navigation', () => {
  afterEach(cleanup);

  it.each(
    roleCodes.filter((role): role is Exclude<RoleCode, 'AGENCY_ADMIN'> => role !== 'AGENCY_ADMIN'),
  )('shows account navigation without exposing agency support actions to %s', (role) => {
    const session = testAuthSession(role, ['account.profile.read', 'account.sessions.read']);
    render(
      <AuthContext.Provider value={testAuthContext({ session })}>
        <AppShell>
          <p>Protected content</p>
        </AppShell>
      </AuthContext.Provider>,
    );

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Active sessions' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start support access' })).not.toBeInTheDocument();
    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });

  it('shows audited support elevation only for an agency role with the effective permission', () => {
    const session = testAuthSession('AGENCY_ADMIN', [
      'account.profile.read',
      'account.sessions.read',
      'platform.support_elevation.manage',
    ]);
    render(
      <AuthContext.Provider value={testAuthContext({ session })}>
        <AppShell>
          <p>Protected content</p>
        </AppShell>
      </AuthContext.Provider>,
    );

    expect(screen.getByRole('button', { name: 'Start support access' })).toBeInTheDocument();
    expect(screen.getAllByText('Agency Admin').length).toBeGreaterThan(0);
  });

  it('shows inventory only with the inventory read permission', () => {
    render(
      <AuthContext.Provider
        value={testAuthContext({
          session: testAuthSession('INVENTORY_EXECUTIVE', ['inventory.units.read']),
        })}
      >
        <AppShell>Inventory content</AppShell>
      </AuthContext.Provider>,
    );
    expect(screen.getByRole('link', { name: 'Inventory' })).toBeInTheDocument();
  });

  it('shows bookings only with the commercial booking read permission', () => {
    render(
      <AuthContext.Provider
        value={testAuthContext({
          session: testAuthSession('BILLING_DOCUMENTATION_EXECUTIVE', ['commercial.bookings.read']),
        })}
      >
        <AppShell>Commercial content</AppShell>
      </AuthContext.Provider>,
    );
    expect(screen.getByRole('link', { name: 'Bookings' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Inventory' })).not.toBeInTheDocument();
  });

  it('shows deliveries only with delivery read permission', () => {
    render(
      <AuthContext.Provider
        value={testAuthContext({
          session: testAuthSession('MANAGER', ['delivery.jobs.read']),
        })}
      >
        <AppShell>Delivery content</AppShell>
      </AuthContext.Provider>,
    );
    expect(screen.getByRole('link', { name: 'Deliveries' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Bookings' })).not.toBeInTheDocument();
  });

  it('shows registration only with registration case read permission', () => {
    render(
      <AuthContext.Provider
        value={testAuthContext({
          session: testAuthSession('RC_REGISTRATION_EXECUTIVE', ['registration.cases.read']),
        })}
      >
        <AppShell>Registration content</AppShell>
      </AuthContext.Provider>,
    );
    expect(screen.getByRole('link', { name: 'Registration & RC' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Deliveries' })).not.toBeInTheDocument();
  });
});
