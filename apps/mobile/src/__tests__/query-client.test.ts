import { ApiResponseError } from '../api/api-error';
import { createMobileQueryClient, retryQuery } from '../providers/query-client';

describe('mobile query client', () => {
  it('uses offline-first queries without retrying mutations', () => {
    const client = createMobileQueryClient();
    const defaults = client.getDefaultOptions();

    expect(defaults.queries).toMatchObject({
      networkMode: 'offlineFirst',
      refetchOnReconnect: true,
      retry: expect.any(Function),
    });
    expect(defaults.mutations).toMatchObject({ networkMode: 'online', retry: 0 });
  });

  it('does not retry authorization failures and bounds transient retries', () => {
    expect(retryQuery(0, new ApiResponseError(401, 'UNAUTHENTICATED', 'SESSION_EXPIRED'))).toBe(
      false,
    );
    expect(retryQuery(0, new Error('temporary'))).toBe(true);
    expect(retryQuery(2, new Error('temporary'))).toBe(false);
  });
});
