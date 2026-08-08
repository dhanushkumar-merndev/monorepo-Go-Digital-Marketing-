import { create } from 'zustand';

export type InboxComposerMode = 'TEMPLATE' | 'TEXT';

interface InboxUiState {
  composerConversationId: string | null;
  composerMode: InboxComposerMode;
  customerPanelOpen: boolean;
  draftText: string;
  prepareComposer: (conversationId: string) => void;
  reset: () => void;
  resetComposer: () => void;
  selectedTemplateId: string;
  setComposerMode: (mode: InboxComposerMode) => void;
  setCustomerPanelOpen: (open: boolean) => void;
  setDraftText: (text: string) => void;
  setSelectedTemplateId: (templateId: string) => void;
  setTemplateVariable: (key: string, value: string) => void;
  templateVariables: Record<string, string>;
}

const initialInboxUiState = {
  composerConversationId: null,
  composerMode: 'TEXT' as const,
  customerPanelOpen: true,
  draftText: '',
  selectedTemplateId: '',
  templateVariables: {} as Record<string, string>,
};

export const useInboxUiStore = create<InboxUiState>((set) => ({
  ...initialInboxUiState,
  prepareComposer: (conversationId) =>
    set((state) =>
      state.composerConversationId === conversationId
        ? state
        : {
            composerConversationId: conversationId,
            composerMode: 'TEXT',
            draftText: '',
            selectedTemplateId: '',
            templateVariables: {},
          },
    ),
  reset: () => set(initialInboxUiState),
  resetComposer: () =>
    set({
      composerMode: 'TEXT',
      draftText: '',
      selectedTemplateId: '',
      templateVariables: {},
    }),
  setComposerMode: (composerMode) => set({ composerMode }),
  setCustomerPanelOpen: (customerPanelOpen) => set({ customerPanelOpen }),
  setDraftText: (draftText) => set({ draftText }),
  setSelectedTemplateId: (selectedTemplateId) => set({ selectedTemplateId, templateVariables: {} }),
  setTemplateVariable: (key, value) =>
    set((state) => ({ templateVariables: { ...state.templateVariables, [key]: value } })),
}));

export function resetInboxUiState(): void {
  useInboxUiStore.getState().reset();
}
