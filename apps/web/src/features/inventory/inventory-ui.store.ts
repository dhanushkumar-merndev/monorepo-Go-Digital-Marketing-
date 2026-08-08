import { create } from 'zustand';

interface InventoryUiState {
  catalogueFormOpen: boolean;
  createUnitOpen: boolean;
  density: 'comfortable' | 'compact';
  reset: () => void;
  setCatalogueFormOpen: (open: boolean) => void;
  setCreateUnitOpen: (open: boolean) => void;
  setDensity: (density: 'comfortable' | 'compact') => void;
}

const initialState = {
  catalogueFormOpen: false,
  createUnitOpen: false,
  density: 'comfortable' as const,
};

export const useInventoryUiStore = create<InventoryUiState>((set) => ({
  ...initialState,
  reset: () => set(initialState),
  setCatalogueFormOpen: (catalogueFormOpen) => set({ catalogueFormOpen }),
  setCreateUnitOpen: (createUnitOpen) => set({ createUnitOpen }),
  setDensity: (density) => set({ density }),
}));

export function resetInventoryUiState(): void {
  useInventoryUiStore.getState().reset();
}
