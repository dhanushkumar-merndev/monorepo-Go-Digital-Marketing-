import { googleAuthChallengeResponseSchema, logoutResponseSchema } from '@gdm/contracts';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import {
  ApiResponseError,
  InvalidApiResponseError,
  NetworkRequestError,
  apiResponseError,
} from './api-error';
import { parseAuthenticationResponse } from '../auth/auth-response';
import type {
  DeviceSessionMetadata,
  GoogleAuthenticationChallenge,
  GoogleLoginInput,
  LoginInput,
  MobileSession,
} from '../auth/auth-types';

export type MobileFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface AuthTransport {
  authorizedRequest(session: MobileSession, path: string, init?: RequestInit): Promise<Response>;
  createGoogleChallenge(): Promise<GoogleAuthenticationChallenge>;
  googleLogin(input: GoogleLoginInput, device: DeviceSessionMetadata): Promise<MobileSession>;
  login(input: LoginInput, device: DeviceSessionMetadata): Promise<MobileSession>;
  logout(session: MobileSession): Promise<void>;
  refresh(session: MobileSession): Promise<MobileSession>;
}

function endpoint(baseUrl: string, path: string): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('API paths must be absolute and origin-relative');
  }

  return `${baseUrl}${path}`;
}

function requestHeaders(
  initial: HeadersInit | undefined,
  accessToken?: string,
): Record<string, string> {
  const headers = new Headers(initial);
  headers.set('Accept', 'application/json');

  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  return Object.fromEntries(headers.entries());
}

async function send(fetchImplementation: MobileFetch, url: string, init: RequestInit) {
  try {
    return await fetchImplementation(url, init);
  } catch (error: unknown) {
    if (error instanceof ApiResponseError) {
      throw error;
    }

    throw new NetworkRequestError({ cause: error });
  }
}

async function jsonBody(response: Response): Promise<unknown> {
  if (!response.ok) {
    throw await apiResponseError(response);
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new InvalidApiResponseError();
  }
}

function parseGoogleChallenge(value: unknown): GoogleAuthenticationChallenge {
  const parsed = googleAuthChallengeResponseSchema.safeParse(value);
  if (!parsed.success || !/^[a-f0-9]{64}$/iu.test(parsed.data.nonce)) {
    throw new InvalidApiResponseError();
  }

  return {
    challengeId: parsed.data.challenge_id,
    expiresAt: parsed.data.expires_at,
    nonce: parsed.data.nonce,
  };
}

export class HttpAuthTransport implements AuthTransport {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImplementation: MobileFetch = fetch,
  ) {}

  async authorizedRequest(
    session: MobileSession,
    path: string,
    init: RequestInit = {},
  ): Promise<Response> {
    return send(this.fetchImplementation, endpoint(this.baseUrl, path), {
      ...init,
      headers: requestHeaders(init.headers, session.credentials.accessToken),
    });
  }

  async createGoogleChallenge(): Promise<GoogleAuthenticationChallenge> {
    const response = await send(
      this.fetchImplementation,
      endpoint(this.baseUrl, '/auth/google/challenge'),
      {
        body: JSON.stringify({ client_type: 'mobile' }),
        headers: requestHeaders({ 'Content-Type': 'application/json' }),
        method: 'POST',
      },
    );

    return parseGoogleChallenge(await jsonBody(response));
  }

  async googleLogin(
    input: GoogleLoginInput,
    device: DeviceSessionMetadata,
  ): Promise<MobileSession> {
    const response = await send(
      this.fetchImplementation,
      endpoint(this.baseUrl, '/auth/google/login'),
      {
        body: JSON.stringify({
          challenge_id: input.challengeId,
          client_type: 'mobile',
          device: {
            device_name: device.deviceName,
            platform: device.platform,
          },
          id_token: input.idToken,
        }),
        headers: requestHeaders({ 'Content-Type': 'application/json' }),
        method: 'POST',
      },
    );

    return parseAuthenticationResponse(await jsonBody(response));
  }

  async login(input: LoginInput, device: DeviceSessionMetadata): Promise<MobileSession> {
    const response = await send(this.fetchImplementation, endpoint(this.baseUrl, '/auth/login'), {
      body: JSON.stringify({
        device: {
          device_name: device.deviceName,
          platform: device.platform,
        },
        client_type: 'mobile',
        email: input.email.trim().toLowerCase(),
        password: input.password,
      }),
      headers: requestHeaders({ 'Content-Type': 'application/json' }),
      method: 'POST',
    });

    return parseAuthenticationResponse(await jsonBody(response));
  }

  async logout(session: MobileSession): Promise<void> {
    const response = await this.authorizedRequest(session, '/auth/logout', {
      body: JSON.stringify({
        refresh_token: session.credentials.refreshToken,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    if (!response.ok) {
      throw await apiResponseError(response);
    }

    const parsed = logoutResponseSchema.safeParse(await jsonBody(response));
    if (!parsed.success) {
      throw new InvalidApiResponseError();
    }
  }

  async refresh(session: MobileSession): Promise<MobileSession> {
    const response = await send(this.fetchImplementation, endpoint(this.baseUrl, '/auth/refresh'), {
      body: JSON.stringify({
        refresh_token: session.credentials.refreshToken,
      }),
      headers: requestHeaders({ 'Content-Type': 'application/json' }),
      method: 'POST',
    });

    return parseAuthenticationResponse(await jsonBody(response));
  }
}

export function currentDeviceSessionMetadata(): DeviceSessionMetadata {
  const version = Constants.expoConfig?.version;
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  return {
    deviceName: `Go Digital CRM ${platform === 'ios' ? 'iOS' : 'Android'} app${
      version ? ` ${version}` : ''
    }`,
    platform,
  };
}
