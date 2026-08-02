import type { Href } from 'expo-router';

import type { AuthStatus } from './auth-types';

export interface AuthRouteDestination {
  href: Href;
  publicPath: string;
}

const loginRoute = { href: '/(auth)/login' as Href, publicPath: '/login' };
const disabledRoute = { href: '/(auth)/disabled' as Href, publicPath: '/disabled' };
const expiredRoute = {
  href: '/(auth)/session-expired' as Href,
  publicPath: '/session-expired',
};
const unsupportedRoute = {
  href: '/(auth)/unsupported' as Href,
  publicPath: '/unsupported',
};

export function authRouteForStatus(status: AuthStatus): AuthRouteDestination | null {
  switch (status) {
    case 'authenticated':
      return { href: '/(app)/home' as Href, publicPath: '/home' };
    case 'authenticating':
    case 'unauthenticated':
      return loginRoute;
    case 'disabled':
      return disabledRoute;
    case 'session-expired':
      return expiredRoute;
    case 'unsupported-role':
      return unsupportedRoute;
    case 'bootstrapping':
      return null;
  }
}
