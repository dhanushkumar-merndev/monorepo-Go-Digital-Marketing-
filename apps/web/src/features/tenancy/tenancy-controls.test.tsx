import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthContext } from '@/features/auth/auth-provider';
import {
  testAuthContext,
  testAuthSession,
  testMembership,
} from '@/features/auth/auth-component-test-utils';

import { SupportElevationBanner, SupportElevationControl } from './support-elevation';
import { TenantSelector } from './tenant-selector';

describe('tenant and support controls', () => {
  afterEach(cleanup);

  it('switches only to a membership supplied by the authenticated session', async () => {
    const current = testMembership('CLIENT_ADMIN');
    const second = testMembership('MANAGER', {
      clientOrganization: {
        id: '77777777-7777-4777-8777-777777777777',
        name: 'Lakeside Automobiles',
      },
      id: '88888888-8888-4888-8888-888888888888',
    });
    const session = {
      ...testAuthSession('CLIENT_ADMIN', [
        'account.profile.read',
        'account.sessions.read',
        'account.tenant.select',
      ]),
      currentMembership: current,
      memberships: [current, second],
    };
    const switchMembership = vi.fn(async () => undefined);
    render(
      <AuthContext.Provider value={testAuthContext({ session, switchMembership })}>
        <TenantSelector presentation="full" />
      </AuthContext.Provider>,
    );

    fireEvent.click(screen.getByLabelText('Client workspace'));
    const option = await screen.findByRole('option', { name: 'Lakeside Automobiles' });
    fireEvent.pointerDown(option, { button: 0, pointerType: 'mouse' });
    fireEvent.mouseDown(option, { button: 0 });
    fireEvent.pointerUp(option, { button: 0, pointerType: 'mouse' });
    fireEvent.mouseUp(option, { button: 0 });
    fireEvent.click(option, { button: 0 });

    await waitFor(() => expect(switchMembership).toHaveBeenCalledWith(second.id));
  });

  it('requires a reason before requesting agency support access', async () => {
    const session = testAuthSession('AGENCY_ADMIN', ['platform.support_elevation.manage']);
    const startSupportElevation = vi.fn(async () => undefined);
    render(
      <AuthContext.Provider value={testAuthContext({ session, startSupportElevation })}>
        <SupportElevationControl />
      </AuthContext.Provider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start support access' }));
    expect(
      await screen.findByRole('heading', { name: 'Start audited support access' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Client organization'), {
      target: { value: '33333333-3333-4333-8333-333333333333' },
    });
    fireEvent.change(screen.getByLabelText('Reason for access'), {
      target: { value: 'Investigating customer-reported login failure' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start temporary access' }));

    await waitFor(() =>
      expect(startSupportElevation).toHaveBeenCalledWith({
        clientOrganizationId: '33333333-3333-4333-8333-333333333333',
        reason: 'Investigating customer-reported login failure',
      }),
    );
  });

  it('keeps active support state visibly identified and revocable', async () => {
    const session = {
      ...testAuthSession('AGENCY_ADMIN', ['platform.support_elevation.manage']),
      supportElevation: {
        clientOrganization: {
          id: '33333333-3333-4333-8333-333333333333',
          name: 'Northstar Motors',
        },
        expiresAt: '2099-08-02T13:00:00.000Z',
        id: '99999999-9999-4999-8999-999999999999',
        reason: 'Investigating a reported access failure',
      },
    };
    const endSupportElevation = vi.fn(async () => undefined);
    render(
      <AuthContext.Provider value={testAuthContext({ endSupportElevation, session })}>
        <SupportElevationBanner />
      </AuthContext.Provider>,
    );

    expect(screen.getByText(/Temporary support access is active/)).toBeInTheDocument();
    expect(screen.getByText(/Investigating a reported access failure/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'End support access' }));
    await waitFor(() => expect(endSupportElevation).toHaveBeenCalledOnce());
  });
});
