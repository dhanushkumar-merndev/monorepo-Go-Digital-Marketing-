import { beforeEach, describe, expect, it } from 'vitest';

import { resetTestRidesUiState, useTestRidesUiStore } from './test-rides-ui.store';

describe('web test-rides UI store', () => {
  beforeEach(resetTestRidesUiState);

  it('keeps sensitive/customer/location/server state out and resets on auth context change', () => {
    useTestRidesUiStore.getState().setScheduleOpen(true);
    useTestRidesUiStore.getState().setShowLocationDetails(false);
    resetTestRidesUiState();

    expect(useTestRidesUiStore.getState()).toMatchObject({
      scheduleOpen: false,
      showLocationDetails: true,
    });
    expect(JSON.stringify(useTestRidesUiStore.getState())).not.toMatch(
      /latitude|longitude|customer|lead|token|secret/iu,
    );
  });
});
