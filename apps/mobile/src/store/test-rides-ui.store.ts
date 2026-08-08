import { create } from 'zustand';

interface TestRidesUiState {
  disclosureRideId: string | null;
  filter: 'TODAY' | 'UPCOMING';
  reset: () => void;
  setDisclosureRideId: (rideId: string | null) => void;
  setFilter: (filter: 'TODAY' | 'UPCOMING') => void;
}

const initialState = { disclosureRideId: null, filter: 'TODAY' as const };

export const useTestRidesUiStore = create<TestRidesUiState>((set) => ({
  ...initialState,
  reset: () => set(initialState),
  setDisclosureRideId: (disclosureRideId) => set({ disclosureRideId }),
  setFilter: (filter) => set({ filter }),
}));

export function resetMobileTestRidesUiState(): void {
  useTestRidesUiStore.getState().reset();
}
