import { create } from 'zustand';

export type MobileInboxComposerMode = 'TEMPLATE' | 'TEXT';

interface MobileInboxUiState {
  composerConversationId: string | null;
  composerMode: MobileInboxComposerMode;
  draftText: string;
  prepareComposer: (conversationId: string) => void;
  reset: () => void;
  resetComposer: () => void;
  selectedTemplateId: string;
  setComposerMode: (mode: MobileInboxComposerMode) => void;
  setDraftText: (text: string) => void;
  setSelectedTemplateId: (templateId: string) => void;
  setTemplateVariable: (key: string, value: string) => void;
  templateVariables: Record<string, string>;
}

const initialMobileInboxUiState = {
  composerConversationId: null,
  composerMode: 'TEXT' as const,
  draftText: '',
  selectedTemplateId: '',
  templateVariables: {} as Record<string, string>,
};

export const useMobileInboxUiStore = create<MobileInboxUiState>((set) => ({
  ...initialMobileInboxUiState,
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
  reset: () => set(initialMobileInboxUiState),
  resetComposer: () =>
    set({
      composerMode: 'TEXT',
      draftText: '',
      selectedTemplateId: '',
      templateVariables: {},
    }),
  setComposerMode: (composerMode) => set({ composerMode }),
  setDraftText: (draftText) => set({ draftText }),
  setSelectedTemplateId: (selectedTemplateId) => set({ selectedTemplateId, templateVariables: {} }),
  setTemplateVariable: (key, value) =>
    set((state) => ({ templateVariables: { ...state.templateVariables, [key]: value } })),
}));

export function resetMobileInboxUiState(): void {
  useMobileInboxUiStore.getState().reset();
}
