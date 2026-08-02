import { create } from 'zustand';

import type { AuthStatus, DisabledReason, MobilePrincipal } from '../auth/auth-types';

export interface AuthState {
  disabledReason?: DisabledReason;
  message?: string;
  principal: MobilePrincipal | null;
  status: AuthStatus;
}

export const initialAuthState: AuthState = {
  principal: null,
  status: 'bootstrapping',
};

export const useAuthStore = create<AuthState>(() => initialAuthState);

export function setAuthState(state: AuthState): void {
  useAuthStore.setState(state, true);
}

export function resetAuthState(): void {
  setAuthState(initialAuthState);
}
