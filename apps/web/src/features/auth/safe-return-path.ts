const authenticationPaths = new Set([
  '/forgot-password',
  '/login',
  '/reset-password',
  '/session-expired',
]);

export function safeReturnPath(value: string | null | undefined, fallback = '/'): string {
  if (
    value === undefined ||
    value === null ||
    value.length === 0 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\')
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(value, 'https://crm.invalid');

    if (parsed.origin !== 'https://crm.invalid' || authenticationPaths.has(parsed.pathname)) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function loginPath(returnTo?: string): string {
  const safePath = safeReturnPath(returnTo);
  return safePath === '/' ? '/login' : `/login?returnTo=${encodeURIComponent(safePath)}`;
}
