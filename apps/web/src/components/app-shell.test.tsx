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
    expect(screen.queryByRole('link', { name: 'Profile' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Active sessions' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open account menu' })).toBeInTheDocument();
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
    expect(screen.getAllByText('Platform workspace').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Go Digital Marketing').length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('img', { name: 'Go Digital Marketing logo' }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText('Automobile CRM')).not.toBeInTheDocument();
  });

  it('hides client operational modules for an agency admin until support access is active', () => {
    const session = testAuthSession('AGENCY_ADMIN', [
      'leads.read',
      'reports.read',
      'platform.support_elevation.manage',
    ]);
    render(
      <AuthContext.Provider value={testAuthContext({ session })}>
        <AppShell>Platform content</AppShell>
      </AuthContext.Provider>,
    );

    expect(screen.getAllByText('Platform workspace').length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: 'Leads' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Reports & audit' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start support access' })).toBeInTheDocument();
  });

  it('shows client operational modules only during active agency support access', () => {
    const base = testAuthSession('AGENCY_ADMIN', ['leads.read', 'reports.read']);
    const session = {
      ...base,
      supportElevation: {
        clientOrganization: {
          id: '44444444-4444-4444-8444-444444444444',
          name: 'Northstar Motors',
        },
        expiresAt: '2026-08-10T12:00:00.000Z',
        id: '55555555-5555-4555-8555-555555555555',
        reason: 'Investigating a reported operational issue.',
      },
    };
    render(
      <AuthContext.Provider value={testAuthContext({ session })}>
        <AppShell>Support content</AppShell>
      </AuthContext.Provider>,
    );

    expect(screen.getByText('Support client')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Leads' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reports & audit' })).toBeInTheDocument();
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
