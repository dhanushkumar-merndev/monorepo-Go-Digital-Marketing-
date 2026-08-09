import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useInboxUiStore } from '../messaging/inbox-ui.store';
import { useTestRidesUiStore } from '../test-rides/test-rides-ui.store';
import { useInventoryUiStore } from '../inventory/inventory-ui.store';
import { ApiClientError, type AuthApiClient } from './auth-api-client';
import { testAuthSession, testMembership } from './auth-component-test-utils';
import { AuthProvider, type AuthContextValue, useAuth } from './auth-provider';
import type { AuthSession } from './auth-types';
import { resetFeatureUiState } from './feature-ui-reset';

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/leads',
  useRouter: () => navigation,
}));

const agencyId = '77777777-7777-4777-8777-777777777777';
const supportedClientId = '99999999-9999-4999-8999-999999999999';
const supportElevationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function AuthProbe({ captureRef }: { captureRef: { current: AuthContextValue | null } }) {
  const auth = useAuth();
  useEffect(() => {
    captureRef.current = auth;
  }, [auth, captureRef]);
  return (
    <div>
      <span data-testid="auth-status">{auth.status}</span>
      <span data-testid="membership-id">{auth.session?.currentMembership?.id ?? 'none'}</span>
      <span data-testid="support-id">{auth.session?.supportElevation?.id ?? 'none'}</span>
    </div>
  );
}

function agencySession(): AuthSession {
  const permissions = ['platform.support_elevation.manage'];
  const membership = testMembership('AGENCY_ADMIN', {
    clientOrganization: { id: agencyId, name: 'Go Digital Agency' },
    permissions,
  });
  return {
    ...testAuthSession('AGENCY_ADMIN', permissions),
    currentMembership: membership,
    memberships: [membership],
  };
}

function elevatedSession(expiresAt: string): AuthSession {
  return {
    ...agencySession(),
    supportElevation: {
      clientOrganization: { id: supportedClientId, name: 'Supported Motors' },
      expiresAt,
      id: supportElevationId,
      reason: 'Investigating an authorized customer support request',
    },
  };
}

interface ClientFixture {
  client: AuthApiClient;
  emitSupportExpired(reason?: ApiClientError): void;
  endSupportElevation: ReturnType<typeof vi.fn>;
  me: ReturnType<typeof vi.fn>;
}

function clientFixture(initialSession: AuthSession): ClientFixture {
  let supportExpiredHandler: ((reason: ApiClientError) => void) | null = null;
  const me = vi.fn(async () => initialSession);
  const endSupportElevation = vi.fn(async () => agencySession());
  const client = {
    clearAccessToken: vi.fn(),
    endSupportElevation,
    me,
    restoreSession: vi.fn(async () => true),
    setSessionExpiredHandler: vi.fn(),
    setSupportElevationExpiredHandler: vi.fn(
      (handler: ((reason: ApiClientError) => void) | null) => {
        supportExpiredHandler = handler;
      },
    ),
  } as unknown as AuthApiClient;

  return {
    client,
    emitSupportExpired(
      reason = new ApiClientError('Support expired.', 403, 'SUPPORT_ELEVATION_REQUIRED'),
    ) {
      if (supportExpiredHandler === null) throw new Error('Support expiry handler is unavailable.');
      supportExpiredHandler(reason);
    },
    endSupportElevation,
    me,
  };
}

function renderProvider(fixture: ClientFixture) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const auth = { current: null as AuthContextValue | null };
  const clear = vi.spyOn(queryClient, 'clear');
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider client={fixture.client}>
        <AuthProbe captureRef={auth} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { auth, clear, queryClient };
}

async function initializeProvider(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
}

function seedClientState(queryClient: QueryClient): void {
  queryClient.setQueryData(['tenant-secret'], { customer: 'Tenant A' });
  useInboxUiStore.getState().prepareComposer('tenant-a-conversation');
  useInboxUiStore.getState().setDraftText('Tenant A draft');
  useTestRidesUiStore.getState().setScheduleOpen(true);
  useInventoryUiStore.getState().setCreateUnitOpen(true);
}

function expectClientStateCleared(queryClient: QueryClient): void {
  expect(queryClient.getQueryData(['tenant-secret'])).toBeUndefined();
  expect(useInboxUiStore.getState().draftText).toBe('');
  expect(useTestRidesUiStore.getState().scheduleOpen).toBe(false);
  expect(useInventoryUiStore.getState().createUnitOpen).toBe(false);
}

describe('AuthProvider authorization-context boundaries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T10:00:00.000Z'));
    navigation.replace.mockReset();
    resetFeatureUiState();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('clears Query and every feature store before refreshProfile applies a changed context', async () => {
    const initial = agencySession();
    const nextMembership = testMembership('CLIENT_ADMIN', {
      clientOrganization: { id: supportedClientId, name: 'Supported Motors' },
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      permissions: ['leads.read'],
    });
    const changed = {
      ...testAuthSession('CLIENT_ADMIN', ['leads.read']),
      currentMembership: nextMembership,
      memberships: [nextMembership],
    };
    const fixture = clientFixture(initial);
    fixture.me.mockResolvedValueOnce(initial).mockResolvedValueOnce(changed);
    const { auth, clear, queryClient } = renderProvider(fixture);
    await initializeProvider();
    clear.mockClear();
    seedClientState(queryClient);

    await act(async () => {
      await auth.current?.refreshProfile();
    });

    expect(clear).toHaveBeenCalledOnce();
    expectClientStateCleared(queryClient);
    expect(screen.getByTestId('membership-id')).toHaveTextContent(nextMembership.id);
  });

  it('removes support state at the exact expiry boundary before restoring agency context', async () => {
    const elevated = elevatedSession('2026-08-09T10:01:00.000Z');
    const fixture = clientFixture(elevated);
    fixture.me.mockResolvedValueOnce(elevated).mockResolvedValueOnce(agencySession());
    const { clear, queryClient } = renderProvider(fixture);
    await initializeProvider();
    expect(Date.now()).toBe(Date.parse('2026-08-09T10:00:00.000Z'));
    expect(screen.getByTestId('support-id')).toHaveTextContent(supportElevationId);
    clear.mockClear();
    seedClientState(queryClient);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59_999);
    });
    expect(Date.now()).toBe(Date.parse('2026-08-09T10:00:59.999Z'));
    expect(fixture.me).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('support-id')).toHaveTextContent(supportElevationId);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(clear).toHaveBeenCalledOnce();
    expectClientStateCleared(queryClient);
    expect(screen.getByTestId('support-id')).toHaveTextContent('none');
    expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
    expect(fixture.me).toHaveBeenCalledTimes(2);
    expect(navigation.replace).toHaveBeenCalledWith('/');
  });

  it('treats an already-expired 404 from explicit revocation as successful local cleanup', async () => {
    const elevated = elevatedSession('2026-08-09T11:00:00.000Z');
    const fixture = clientFixture(elevated);
    fixture.me.mockResolvedValueOnce(elevated).mockResolvedValueOnce(agencySession());
    fixture.endSupportElevation.mockRejectedValueOnce(
      new ApiClientError('No active support elevation was found.', 404, 'NOT_FOUND'),
    );
    const { auth, queryClient } = renderProvider(fixture);
    await initializeProvider();
    seedClientState(queryClient);

    await act(async () => {
      await expect(auth.current?.endSupportElevation()).resolves.toBeUndefined();
    });

    expectClientStateCleared(queryClient);
    expect(screen.getByTestId('support-id')).toHaveTextContent('none');
    expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
  });

  it('fails closed when a delayed 403 reports expiry and agency refresh is also forbidden', async () => {
    const elevated = elevatedSession('2026-08-09T11:00:00.000Z');
    const fixture = clientFixture(elevated);
    fixture.me
      .mockResolvedValueOnce(elevated)
      .mockRejectedValueOnce(
        new ApiClientError('Support elevation is required.', 403, 'SUPPORT_ELEVATION_REQUIRED'),
      );
    const { queryClient } = renderProvider(fixture);
    await initializeProvider();
    seedClientState(queryClient);

    await act(async () => {
      fixture.emitSupportExpired();
      await Promise.resolve();
      await Promise.resolve();
    });

    expectClientStateCleared(queryClient);
    expect(screen.getByTestId('support-id')).toHaveTextContent('none');
    expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
    expect(navigation.replace).toHaveBeenCalledWith('/');
  });
});
