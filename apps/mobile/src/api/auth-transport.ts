import { logoutResponseSchema } from '@gdm/contracts';
import Constants from 'expo-constants';

import {
  ApiResponseError,
  InvalidApiResponseError,
  NetworkRequestError,
  apiResponseError,
} from './api-error';
import { parseAuthenticationResponse } from '../auth/auth-response';
import type { DeviceSessionMetadata, LoginInput, MobileSession } from '../auth/auth-types';

export type MobileFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface AuthTransport {
  authorizedRequest(session: MobileSession, path: string, init?: RequestInit): Promise<Response>;
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
  return {
    deviceName: `Go Digital CRM Android app${version ? ` ${version}` : ''}`,
    platform: 'android',
  };
}
