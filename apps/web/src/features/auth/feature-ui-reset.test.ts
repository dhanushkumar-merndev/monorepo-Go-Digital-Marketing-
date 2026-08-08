import { beforeEach, describe, expect, it } from 'vitest';

import { useInboxUiStore } from '../messaging/inbox-ui.store';
import { useTestRidesUiStore } from '../test-rides/test-rides-ui.store';
import { useInventoryUiStore } from '../inventory/inventory-ui.store';
import { resetFeatureUiState } from './feature-ui-reset';

describe('web feature UI reset', () => {
  beforeEach(resetFeatureUiState);

  it('clears every Zustand workflow store before an auth-context change is rendered', () => {
    useInboxUiStore.getState().prepareComposer('tenant-a-conversation');
    useInboxUiStore.getState().setDraftText('Tenant A draft');
    useTestRidesUiStore.getState().setScheduleOpen(true);
    useTestRidesUiStore.getState().setShowLocationDetails(false);
    useInventoryUiStore.getState().setCreateUnitOpen(true);
    useInventoryUiStore.getState().setDensity('compact');

    resetFeatureUiState();

    expect(useInboxUiStore.getState()).toMatchObject({
      composerConversationId: null,
      draftText: '',
    });
    expect(useTestRidesUiStore.getState()).toMatchObject({
      scheduleOpen: false,
      showLocationDetails: true,
    });
    expect(useInventoryUiStore.getState()).toMatchObject({
      createUnitOpen: false,
      density: 'comfortable',
    });
  });
});
