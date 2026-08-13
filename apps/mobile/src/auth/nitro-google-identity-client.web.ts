import { GoogleIdentityError, type GoogleIdentityClient } from './google-identity-client';

export interface NitroGoogleIdentityClientConfiguration {
  iosClientId?: string;
  webClientId: string;
}

export class NitroGoogleIdentityClient implements GoogleIdentityClient {
  authenticate(): Promise<never> {
    return Promise.reject(new GoogleIdentityError('PROVIDER_UNAVAILABLE'));
  }

  signOut(): Promise<void> {
    return Promise.resolve();
  }
}
