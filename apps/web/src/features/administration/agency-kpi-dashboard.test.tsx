import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthContext } from '@/features/auth/auth-provider';
import { testAuthContext } from '@/features/auth/auth-component-test-utils';
import { AgencyKpiDashboard } from './agency-kpi-dashboard';

const response = {
  clients: [
    {
      client_organization: {
        agency_id: '10000000-0000-4000-8000-000000000001',
        display_name: 'Northstar Motors',
        id: '20000000-0000-4000-8000-000000000001',
        legal_name: 'Northstar Motors Private Limited',
        status: 'ACTIVE' as const,
        timezone: 'Asia/Kolkata',
      },
      converted: 5,
      conversion_rate: 25,
      in_progress: 7,
      leads_received: 20,
      lost: 2,
      new: 3,
      pending_review: 2,
      rejected: 1,
    },
    {
      client_organization: {
        agency_id: '10000000-0000-4000-8000-000000000001',
        display_name: 'Southside Motors',
        id: '20000000-0000-4000-8000-000000000002',
        legal_name: 'Southside Motors Private Limited',
        status: 'PENDING' as const,
        timezone: 'Asia/Kolkata',
      },
      converted: 1,
      conversion_rate: 10,
      in_progress: 4,
      leads_received: 10,
      lost: 1,
      new: 2,
      pending_review: 1,
      rejected: 1,
    },
  ],
  range: {
    end_at: '2026-08-11T00:00:00.000Z',
    from: '2026-08-01',
    start_at: '2026-08-01T00:00:00.000Z',
    timezone: 'Asia/Kolkata',
    to: '2026-08-10',
  },
  totals: {
    client_organizations: 2,
    converted: 6,
    conversion_rate: 20,
    in_progress: 11,
    leads_received: 30,
    lost: 3,
    new: 5,
    pending_review: 3,
    rejected: 2,
  },
};

describe('AgencyKpiDashboard', () => {
  afterEach(cleanup);

  it('shows agency totals, charts, and exact per-client lead metrics from the API', async () => {
    const request = vi.fn(async (_path: string) => response);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={testAuthContext({ api: { request } as never })}>
          <AgencyKpiDashboard />
        </AuthContext.Provider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('Lead volume by client')).toBeInTheDocument();
    expect(screen.getByText('Agency lead pipeline')).toBeInTheDocument();
    expect(screen.getByText('Client KPI breakdown')).toBeInTheDocument();
    expect(screen.getAllByText('Northstar Motors').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Southside Motors').length).toBeGreaterThan(0);
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('20.0% conversion')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith(
      expect.stringMatching(/^\/administration\/agency-dashboard\?/u),
    );
    expect(String(request.mock.calls[0]?.[0])).toMatch(/[?&]from=\d{4}-\d{2}-01(?:&|$)/u);
  });
});
