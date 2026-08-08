import { beforeEach, describe, expect, it } from 'vitest';

import { resetInboxUiState, useInboxUiStore } from './inbox-ui.store';

describe('web inbox UI store', () => {
  beforeEach(resetInboxUiState);

  it('keeps only transient composer UI and clears it on logout or tenant reset', () => {
    const state = useInboxUiStore.getState();
    state.prepareComposer('conversation-a');
    state.setDraftText('Sensitive unsent draft');
    state.setSelectedTemplateId('template-a');
    state.setTemplateVariable('1', 'Customer');

    resetInboxUiState();

    expect(useInboxUiStore.getState()).toMatchObject({
      composerConversationId: null,
      composerMode: 'TEXT',
      customerPanelOpen: true,
      draftText: '',
      selectedTemplateId: '',
      templateVariables: {},
    });
    expect(JSON.stringify(useInboxUiStore.getState())).not.toMatch(
      /token|secret|signed_url|message_history/iu,
    );
  });

  it('clears customer draft context when the selected conversation changes', () => {
    useInboxUiStore.getState().prepareComposer('conversation-a');
    useInboxUiStore.getState().setDraftText('Tenant A customer draft');
    useInboxUiStore.getState().prepareComposer('conversation-b');

    expect(useInboxUiStore.getState()).toMatchObject({
      composerConversationId: 'conversation-b',
      draftText: '',
      selectedTemplateId: '',
      templateVariables: {},
    });
  });
});
