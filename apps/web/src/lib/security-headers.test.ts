import { describe, expect, it } from 'vitest';

import { buildWebSecurityHeaders } from './security-headers';

describe('web security headers', () => {
  it('uses a hosted CSP without development eval and includes the API origin', () => {
    const headers = buildWebSecurityHeaders('production', 'https://api.example.com/v1');
    const values = Object.fromEntries(headers.map((header) => [header.key, header.value]));

    expect(values['Content-Security-Policy']).toContain(
      "connect-src 'self' https://accounts.google.com https://api.example.com",
    );
    expect(values['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(values['Content-Security-Policy']).not.toContain("'unsafe-eval'");
    expect(values['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains');
    expect(values['Permissions-Policy']).toBe('camera=(), geolocation=(), microphone=()');
  });

  it('keeps development tooling usable without advertising HSTS', () => {
    const headers = buildWebSecurityHeaders('development', 'http://localhost:4000/v1');
    const values = Object.fromEntries(headers.map((header) => [header.key, header.value]));

    expect(values['Content-Security-Policy']).toContain("'unsafe-eval'");
    expect(values['Strict-Transport-Security']).toBeUndefined();
  });
});
