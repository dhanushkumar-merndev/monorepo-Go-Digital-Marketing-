import { create } from 'zustand';

interface TestRidesUiState {
  scheduleOpen: boolean;
  setScheduleOpen: (open: boolean) => void;
  setShowLocationDetails: (show: boolean) => void;
  showLocationDetails: boolean;
  reset: () => void;
}

const initialState = { scheduleOpen: false, showLocationDetails: true };

export const useTestRidesUiStore = create<TestRidesUiState>((set) => ({
  ...initialState,
  reset: () => set(initialState),
  setScheduleOpen: (scheduleOpen) => set({ scheduleOpen }),
  setShowLocationDetails: (showLocationDetails) => set({ showLocationDetails }),
}));

export function resetTestRidesUiState(): void {
  useTestRidesUiStore.getState().reset();
}
