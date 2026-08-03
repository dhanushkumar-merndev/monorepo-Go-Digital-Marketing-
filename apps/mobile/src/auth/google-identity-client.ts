export interface GoogleIdentitySuccess {
  idToken: string;
  status: 'success';
}

export interface GoogleIdentityCancelled {
  status: 'cancelled';
}

export type GoogleIdentityResult = GoogleIdentityCancelled | GoogleIdentitySuccess;

export interface GoogleIdentityClient {
  authenticate(input: { nonce: string }): Promise<GoogleIdentityResult>;
  signOut(): Promise<void>;
}

export type GoogleIdentityErrorReason =
  'CONFIGURATION' | 'IN_PROGRESS' | 'PLAY_SERVICES_UNAVAILABLE' | 'PROVIDER_UNAVAILABLE';

export class GoogleIdentityError extends Error {
  constructor(
    readonly reason: GoogleIdentityErrorReason,
    options?: ErrorOptions,
  ) {
    super('Google identity authentication failed', options);
    this.name = 'GoogleIdentityError';
  }
}
