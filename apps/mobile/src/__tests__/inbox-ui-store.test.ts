import { resetMobileInboxUiState, useMobileInboxUiStore } from '../store/inbox-ui.store';

describe('mobile inbox UI store', () => {
  beforeEach(resetMobileInboxUiState);

  it('clears the composer on logout, account switch, or tenant reset', () => {
    useMobileInboxUiStore.getState().prepareComposer('conversation-a');
    useMobileInboxUiStore.getState().setDraftText('Unsent customer reply');
    useMobileInboxUiStore.getState().setSelectedTemplateId('template-a');
    useMobileInboxUiStore.getState().setTemplateVariable('1', 'Customer');

    resetMobileInboxUiState();

    expect(useMobileInboxUiStore.getState()).toMatchObject({
      composerConversationId: null,
      composerMode: 'TEXT',
      draftText: '',
      selectedTemplateId: '',
      templateVariables: {},
    });
    expect(JSON.stringify(useMobileInboxUiStore.getState())).not.toMatch(
      /accessToken|refreshToken|providerSecret|signedUrl|messageHistory/u,
    );
  });

  it('does not carry a draft into another customer conversation', () => {
    useMobileInboxUiStore.getState().prepareComposer('conversation-a');
    useMobileInboxUiStore.getState().setDraftText('Customer A');
    useMobileInboxUiStore.getState().prepareComposer('conversation-b');

    expect(useMobileInboxUiStore.getState()).toMatchObject({
      composerConversationId: 'conversation-b',
      draftText: '',
      selectedTemplateId: '',
      templateVariables: {},
    });
  });
});
