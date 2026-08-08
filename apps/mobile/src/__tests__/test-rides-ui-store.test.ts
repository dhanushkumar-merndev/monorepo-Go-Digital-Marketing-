import { resetMobileTestRidesUiState, useTestRidesUiStore } from '../store/test-rides-ui.store';

describe('mobile test-rides UI store', () => {
  beforeEach(resetMobileTestRidesUiState);

  it('stores only transient scalar presentation and resets between auth contexts', () => {
    useTestRidesUiStore.getState().setDisclosureRideId('ride-a');
    useTestRidesUiStore.getState().setFilter('UPCOMING');
    resetMobileTestRidesUiState();

    expect(useTestRidesUiStore.getState()).toMatchObject({
      disclosureRideId: null,
      filter: 'TODAY',
    });
    expect(JSON.stringify(useTestRidesUiStore.getState())).not.toMatch(
      /latitude|longitude|customer|phone|token|secret/iu,
    );
  });
});
