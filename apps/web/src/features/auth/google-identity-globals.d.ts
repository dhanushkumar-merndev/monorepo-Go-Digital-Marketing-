export {};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          cancel(): void;
          initialize(configuration: {
            auto_select?: boolean;
            button_auto_select?: boolean;
            callback(response: { credential?: string; select_by?: string }): void;
            client_id: string;
            nonce: string;
            use_fedcm_for_button?: boolean;
            ux_mode?: 'popup' | 'redirect';
          }): void;
          renderButton(
            parent: HTMLElement,
            options: {
              logo_alignment?: 'center' | 'left';
              shape?: 'circle' | 'pill' | 'rectangular' | 'square';
              size?: 'large' | 'medium' | 'small';
              text?: 'continue_with' | 'signin_with' | 'signup_with' | 'signin';
              theme?: 'filled_black' | 'filled_blue' | 'outline';
              type?: 'icon' | 'standard';
              width?: number;
            },
          ): void;
        };
      };
    };
  }
}
