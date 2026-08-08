import { resetInboxUiState } from '../messaging/inbox-ui.store';
import { resetTestRidesUiState } from '../test-rides/test-rides-ui.store';
import { resetInventoryUiState } from '../inventory/inventory-ui.store';

/** Clears every web Zustand workflow store before a new authorization context is rendered. */
export function resetFeatureUiState(): void {
  resetInboxUiState();
  resetTestRidesUiState();
  resetInventoryUiState();
}
