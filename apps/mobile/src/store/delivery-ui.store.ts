import { create } from 'zustand';

interface DeliveryUiState {
  disclosureJobId: string | null;
  filter: 'TODAY' | 'UPCOMING';
  reset: () => void;
  setDisclosureJobId: (jobId: string | null) => void;
  setFilter: (filter: 'TODAY' | 'UPCOMING') => void;
}

const initialState = { disclosureJobId: null, filter: 'TODAY' as const };

export const useDeliveryUiStore = create<DeliveryUiState>((set) => ({
  ...initialState,
  reset: () => set(initialState),
  setDisclosureJobId: (disclosureJobId) => set({ disclosureJobId }),
  setFilter: (filter) => set({ filter }),
}));

export function resetMobileDeliveryUiState(): void {
  useDeliveryUiStore.getState().reset();
}
