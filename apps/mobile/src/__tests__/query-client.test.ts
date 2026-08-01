import { createMobileQueryClient } from '../providers/query-client';

describe('mobile query client', () => {
  it('uses offline-first queries without retrying mutations', () => {
    const client = createMobileQueryClient();
    const defaults = client.getDefaultOptions();

    expect(defaults.queries).toMatchObject({
      networkMode: 'offlineFirst',
      refetchOnReconnect: true,
      retry: 2,
    });
    expect(defaults.mutations).toMatchObject({ networkMode: 'online', retry: 0 });
  });
});
