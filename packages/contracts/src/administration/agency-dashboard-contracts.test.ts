import { describe, expect, it } from 'vitest';

import { agencyDashboardQuerySchema, agencyDashboardResponseSchema } from './contracts.js';

describe('agency dashboard contracts', () => {
  it('validates the date-range query and applies the reporting timezone default', () => {
    expect(agencyDashboardQuerySchema.parse({ from: '2026-08-01', to: '2026-08-10' })).toEqual({
      from: '2026-08-01',
      timezone: 'Asia/Kolkata',
      to: '2026-08-10',
    });
  });

  it('validates nonnegative client lead KPIs', () => {
    expect(
      agencyDashboardResponseSchema.safeParse({
        clients: [
          {
            client_organization: {
              agency_id: '10000000-0000-4000-8000-000000000001',
              display_name: 'Northstar Motors',
              id: '20000000-0000-4000-8000-000000000001',
              legal_name: 'Northstar Motors Private Limited',
              status: 'ACTIVE',
              timezone: 'Asia/Kolkata',
            },
            converted: 2,
            conversion_rate: 20,
            in_progress: 3,
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
          client_organizations: 1,
          converted: 2,
          conversion_rate: 20,
          in_progress: 3,
          leads_received: 10,
          lost: 1,
          new: 2,
          pending_review: 1,
          rejected: 1,
        },
      }).success,
    ).toBe(true);
  });
});
