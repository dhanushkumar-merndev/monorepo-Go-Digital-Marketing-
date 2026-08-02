import { mobileApiBaseUrl } from '../api/mobile-environment';

describe('mobileApiBaseUrl', () => {
  it('requires HTTPS for non-loopback production traffic', () => {
    expect(() => mobileApiBaseUrl({ NODE_ENV: 'production' })).toThrow(
      'EXPO_PUBLIC_API_URL is required for a production mobile build',
    );

    expect(() =>
      mobileApiBaseUrl({
        EXPO_PUBLIC_API_URL: 'http://api.example.com/v1',
        NODE_ENV: 'production',
      }),
    ).toThrow('Production mobile API traffic must use HTTPS');

    expect(
      mobileApiBaseUrl({
        EXPO_PUBLIC_API_URL: 'https://api.example.com/v1/',
        NODE_ENV: 'production',
      }),
    ).toBe('https://api.example.com/v1');
  });

  it('keeps loopback HTTP available for local Android development', () => {
    expect(
      mobileApiBaseUrl({
        EXPO_PUBLIC_API_URL: 'http://localhost:4000/v1',
        NODE_ENV: 'production',
      }),
    ).toBe('http://localhost:4000/v1');
  });
});
