import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthContext } from '@/features/auth/auth-provider';
import { testAuthContext, testAuthSession } from '@/features/auth/auth-component-test-utils';
import { AnalyticsWorkspace } from './analytics-workspace';

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => '/analytics',
  useRouter: () => ({ replace }),
  useSearchParams: () =>
    new URLSearchParams('from=2026-08-01&to=2026-08-12&compare=PREVIOUS_PERIOD'),
}));

vi.mock('./analytics-chart', () => ({
  AnalyticsChart: ({ series }: { series: { label: string } }) => <div>{series.label} chart</div>,
}));

const response = {
  attention: [
    {
      code: 'overdue_followups',
      count: 3,
      drilldown: 'RECORD_DRILLDOWN' as const,
      href: '/leads',
      label: 'Overdue follow-ups',
      severity: 'WARNING' as const,
    },
  ],
  available_dimensions: ['SOURCE'] as const,
  freshness: { generated_at: '2026-08-12T08:00:00.000Z', mode: 'NEAR_REAL_TIME' as const },
  metrics: [
    {
      code: 'lead_count',
      comparison: {
        absolute_change: 2,
        change_kind: 'PERCENT_CHANGE' as const,
        previous_value: 8,
        value: 25,
      },
      definition: 'Distinct Lead opportunities captured in the selected tenant-local period.',
      direction: 'HIGHER_IS_BETTER' as const,
      drilldown: 'RECORD_DRILLDOWN' as const,
      label: 'My Leads',
      state: 'AVAILABLE' as const,
      unit: 'COUNT' as const,
      value: 10,
    },
  ],
  range: {
    compare_from: '2026-07-20',
    compare_to: '2026-07-31',
    from: '2026-08-01',
    timezone: 'Asia/Kolkata',
    to: '2026-08-12',
  },
  role: 'SALESPERSON',
  scope: 'OWN' as const,
  series: [
    {
      code: 'lead_trend',
      dataset: [{ category: '2026-08-12', value: 10 }],
      description: 'Lead volume by tenant-local capture date.',
      drilldown: 'RECORD_DRILLDOWN' as const,
      label: 'Lead trend',
      type: 'LINE' as const,
      unit: 'COUNT' as const,
    },
  ],
};

describe('AnalyticsWorkspace', () => {
  afterEach(() => {
    cleanup();
    replace.mockClear();
  });

  it('renders scoped server metrics, comparison semantics, attention, and chart summaries', async () => {
    const request = vi.fn(async () => response);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider
          value={testAuthContext({
            api: { request } as never,
            session: testAuthSession('SALESPERSON', ['leads.read']),
          })}
        >
          <AnalyticsWorkspace />
        </AuthContext.Provider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('My Leads')).toBeInTheDocument();
    expect(screen.getByText('+25.0% vs comparison')).toBeInTheDocument();
    expect(screen.getByText('Overdue follow-ups')).toBeInTheDocument();
    expect(screen.getByText('Lead trend chart')).toBeInTheDocument();
    expect(screen.getByText(/Asia\/Kolkata/u)).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith(
      expect.stringMatching(/^\/analytics\/overview\?.*from=2026-08-01/u),
    );
  });

  it('loads only authorized organization dimensions for scoped filter controls', async () => {
    const request = vi.fn(async (path: string) => {
      if (path === '/branches')
        return {
          branches: [
            {
              active: true,
              client_organization_id: '10000000-0000-4000-8000-000000000001',
              code: 'MUM',
              id: '20000000-0000-4000-8000-000000000001',
              name: 'Mumbai',
              timezone: 'Asia/Kolkata',
            },
          ],
        };
      if (path === '/teams')
        return {
          teams: [
            {
              active: true,
              branch_id: '20000000-0000-4000-8000-000000000001',
              client_organization_id: '10000000-0000-4000-8000-000000000001',
              code: 'SALES',
              id: '30000000-0000-4000-8000-000000000001',
              name: 'Sales',
            },
          ],
        };
      if (path === '/users?limit=100&page=1')
        return {
          pagination: { has_next: false, page: 1, page_size: 100 },
          users: [
            {
              display_name: 'Asha Rao',
              email: 'asha@example.com',
              membership_id: '40000000-0000-4000-8000-000000000001',
              membership_status: 'ACTIVE',
              role_code: 'SALESPERSON',
              user_id: '50000000-0000-4000-8000-000000000001',
              user_status: 'ACTIVE',
            },
          ],
        };
      return response;
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider
          value={testAuthContext({
            api: { request } as never,
            session: testAuthSession('SALES_MANAGER', [
              'organization.branches.read',
              'organization.teams.read',
              'organization.users.read',
            ]),
          })}
        >
          <AnalyticsWorkspace />
        </AuthContext.Provider>
      </QueryClientProvider>,
    );

    expect(await screen.findByLabelText('Branch')).toBeInTheDocument();
    expect(await screen.findByLabelText('Team')).toBeInTheDocument();
    expect(await screen.findByLabelText('User')).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith('/branches');
    expect(request).toHaveBeenCalledWith('/teams');
    expect(request).toHaveBeenCalledWith('/users?limit=100&page=1');
  });
});
