import { z } from 'zod';
import { describe, expect, it } from 'vitest';

import { analyticsOverviewResponseSchema, analyticsQuerySchema } from './contracts.js';
import { pageQueryFields } from '../pagination.js';

const pageQuerySchema = z.object(pageQueryFields);

describe('analytics contracts', () => {
  it('applies safe defaults and accepts an explicit comparison', () => {
    expect(analyticsQuerySchema.parse({ from: '2026-08-01', to: '2026-08-12' })).toMatchObject({
      compare: 'PREVIOUS_PERIOD',
      timezone: 'Asia/Kolkata',
    });
    expect(
      analyticsQuerySchema.parse({
        compare: 'PREVIOUS_YEAR',
        from: '2026-08-01',
        to: '2026-08-12',
      }).compare,
    ).toBe('PREVIOUS_YEAR');
  });

  it('rejects reversed ranges', () => {
    expect(() => analyticsQuerySchema.parse({ from: '2026-08-12', to: '2026-08-01' })).toThrow(
      /from must not be later than to/u,
    );
  });

  it('keeps unavailable metric values explicit instead of fabricating zero', () => {
    const parsed = analyticsOverviewResponseSchema.parse({
      attention: [],
      available_dimensions: [],
      freshness: { generated_at: '2026-08-12T00:00:00.000Z', mode: 'NEAR_REAL_TIME' },
      metrics: [
        {
          code: 'ad_spend',
          comparison: null,
          definition: 'Unavailable until an ad-cost provider is configured.',
          direction: 'NEUTRAL',
          drilldown: 'NO_DRILLDOWN',
          label: 'Ad spend',
          state: 'UNAVAILABLE',
          unit: 'MONEY_MINOR',
          value: null,
        },
      ],
      range: {
        compare_from: null,
        compare_to: null,
        from: '2026-08-01',
        timezone: 'Asia/Kolkata',
        to: '2026-08-12',
      },
      role: 'CLIENT_ADMIN',
      scope: 'TENANT',
      series: [],
    });
    expect(parsed.metrics[0]).toMatchObject({ state: 'UNAVAILABLE', value: null });
  });
});

describe('page query contract', () => {
  it('defaults to page one and 25 rows and enforces the 100-row ceiling', () => {
    expect(pageQuerySchema.parse({})).toEqual({ limit: 25, page: 1 });
    expect(() => pageQuerySchema.parse({ limit: 101, page: 1 })).toThrow();
  });
});
