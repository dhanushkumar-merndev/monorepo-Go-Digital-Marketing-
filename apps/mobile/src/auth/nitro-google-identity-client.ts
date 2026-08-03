import { GoogleOneTapSignIn } from 'react-native-nitro-google-signin';

import {
  GoogleIdentityError,
  type GoogleIdentityClient,
  type GoogleIdentityResult,
} from './google-identity-client';

interface NitroGoogleResponse {
  data: { idToken: string } | null;
  type: 'cancelled' | 'noSavedCredentialFound' | 'success';
}

export interface NitroGoogleSignInPort {
  checkPlayServices(showErrorResolutionDialog?: boolean): Promise<void>;
  configure(input: {
    autoSelectOnSignIn?: boolean;
    iosClientId?: string;
    nonce?: string;
    offlineAccess?: boolean;
    webClientId: string;
  }): void;
  createAccount(): Promise<NitroGoogleResponse>;
  presentExplicitSignIn(): Promise<NitroGoogleResponse>;
  signIn(): Promise<NitroGoogleResponse>;
  signOut(): Promise<void>;
}

export interface NitroGoogleIdentityClientConfiguration {
  iosClientId?: string;
  webClientId: string;
}

const googleErrorCodes = {
  developerError: 'DEVELOPER_ERROR',
  inProgress: 'IN_PROGRESS',
  playServicesNotAvailable: 'PLAY_SERVICES_NOT_AVAILABLE',
  signInCancelled: 'SIGN_IN_CANCELLED',
} as const;

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }

  return typeof error.code === 'string' ? error.code : undefined;
}

function result(response: NitroGoogleResponse): GoogleIdentityResult | undefined {
  if (response.type === 'cancelled') {
    return { status: 'cancelled' };
  }

  if (response.type !== 'success') {
    return undefined;
  }

  const idToken = response.data?.idToken.trim();
  if (!idToken) {
    throw new GoogleIdentityError('PROVIDER_UNAVAILABLE');
  }

  return { idToken, status: 'success' };
}

export class NitroGoogleIdentityClient implements GoogleIdentityClient {
  constructor(
    private readonly configuration: NitroGoogleIdentityClientConfiguration,
    private readonly provider: NitroGoogleSignInPort = GoogleOneTapSignIn,
  ) {}

  async authenticate(input: { nonce: string }): Promise<GoogleIdentityResult> {
    try {
      this.provider.configure({
        autoSelectOnSignIn: false,
        ...(this.configuration.iosClientId ? { iosClientId: this.configuration.iosClientId } : {}),
        nonce: input.nonce,
        offlineAccess: false,
        webClientId: this.configuration.webClientId,
      });
      await this.provider.checkPlayServices(true);

      let response = await this.provider.signIn();
      let authentication = result(response);
      if (authentication) {
        return authentication;
      }

      response = await this.provider.createAccount();
      authentication = result(response);
      if (authentication) {
        return authentication;
      }

      response = await this.provider.presentExplicitSignIn();
      return result(response) ?? { status: 'cancelled' };
    } catch (error: unknown) {
      switch (errorCode(error)) {
        case googleErrorCodes.signInCancelled:
          return { status: 'cancelled' };
        case googleErrorCodes.developerError:
          throw new GoogleIdentityError('CONFIGURATION', { cause: error });
        case googleErrorCodes.inProgress:
          throw new GoogleIdentityError('IN_PROGRESS', { cause: error });
        case googleErrorCodes.playServicesNotAvailable:
          throw new GoogleIdentityError('PLAY_SERVICES_UNAVAILABLE', { cause: error });
        default:
          throw new GoogleIdentityError('PROVIDER_UNAVAILABLE', { cause: error });
      }
    }
  }

  signOut(): Promise<void> {
    return this.provider.signOut();
  }
}
