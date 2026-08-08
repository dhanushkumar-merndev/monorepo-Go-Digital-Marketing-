import { beforeEach, describe, expect, it } from 'vitest';
import { resetInventoryUiState, useInventoryUiStore } from './inventory-ui.store';

describe('inventory transient UI store', () => {
  beforeEach(resetInventoryUiState);

  it('stores presentation state only and resets without persistence', () => {
    useInventoryUiStore.getState().setCreateUnitOpen(true);
    useInventoryUiStore.getState().setDensity('compact');
    expect(useInventoryUiStore.getState()).toMatchObject({
      createUnitOpen: true,
      density: 'compact',
    });
    expect('persist' in useInventoryUiStore).toBe(false);
    resetInventoryUiState();
    expect(useInventoryUiStore.getState()).toMatchObject({
      createUnitOpen: false,
      density: 'comfortable',
    });
  });
});
