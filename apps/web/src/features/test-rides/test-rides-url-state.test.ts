import { describe, expect, it } from 'vitest';

import { localCalendarDate, parseRideView } from './test-rides-url-state';

describe('test-ride URL state', () => {
  it('fails closed to Today for an unsupported deep-link view', () => {
    expect(parseRideView('ACTIVE')).toBe('ACTIVE');
    expect(parseRideView('unexpected')).toBe('TODAY');
    expect(parseRideView(null)).toBe('TODAY');
  });

  it('uses the local calendar date instead of the UTC date', () => {
    const value = new Date(2026, 7, 9, 0, 15, 0);

    expect(localCalendarDate(value)).toBe('2026-08-09');
  });
});
