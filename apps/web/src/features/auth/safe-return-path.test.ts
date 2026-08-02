import { describe, expect, it } from 'vitest';

import { loginPath, safeReturnPath } from './safe-return-path';

describe('safeReturnPath', () => {
  it.each([
    ['https://attacker.example/path', '/'],
    ['//attacker.example/path', '/'],
    ['/\\attacker.example', '/'],
    ['/login?returnTo=/sessions', '/'],
    ['/session-expired', '/'],
    ['', '/'],
    [null, '/'],
  ])('rejects unsafe or recursive return path %s', (value, expected) => {
    expect(safeReturnPath(value)).toBe(expected);
  });

  it('preserves an internal path, query and fragment', () => {
    expect(safeReturnPath('/sessions?filter=active#current')).toBe(
      '/sessions?filter=active#current',
    );
  });

  it('builds a safely encoded login path', () => {
    expect(loginPath('/profile?tab=access')).toBe('/login?returnTo=%2Fprofile%3Ftab%3Daccess');
    expect(loginPath('https://attacker.example')).toBe('/login');
  });
});
