export type ProviderCallStatus =
  'REQUESTED' | 'RINGING' | 'ANSWERED' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'UNKNOWN';

export interface TelephonyProviderConnection {
  connectionId: string;
  connectionKey: string;
  clientOrganizationId: string;
  provider: string;
  settings: Record<string, unknown>;
}

export interface StartProviderCallRequest {
  callId: string;
  contactPhoneE164: string;
  leadId: string;
  initiatedByUserId: string;
}

export interface NormalizedRecording {
  providerRecordingId: string;
  providerRecordingReference?: string;
  recordedAt?: Date;
}

export interface NormalizedCallEvent {
  direction?: 'INBOUND' | 'OUTBOUND';
  durationSeconds?: number;
  eventType: string;
  externalEventId: string;
  leadId?: string;
  occurredAt: Date;
  providerCallId: string;
  recording?: NormalizedRecording;
  status: ProviderCallStatus;
}

export interface TelephonyProvider {
  readonly provider: string;
  startCall(
    connection: TelephonyProviderConnection,
    request: StartProviderCallRequest,
  ): Promise<{ providerCallId: string; status: ProviderCallStatus; virtualNumber?: string }>;
  verifyWebhook(input: {
    connection: TelephonyProviderConnection;
    headers: Readonly<Record<string, string | string[] | undefined>>;
    rawBody: string;
  }): Promise<boolean>;
  parseCallEvent(input: {
    connection: TelephonyProviderConnection;
    payload: unknown;
  }): Promise<NormalizedCallEvent>;
  getRecording(input: {
    connection: TelephonyProviderConnection;
    providerRecordingId: string;
  }): Promise<{ objectKey?: string } | undefined>;
  syncCalls(input: {
    connection: TelephonyProviderConnection;
    cursor?: string;
  }): Promise<{ cursor?: string; events: NormalizedCallEvent[] }>;
  normalizeStatus(value: string): ProviderCallStatus;
  healthCheck(
    connection: TelephonyProviderConnection,
  ): Promise<{ detail?: string; healthy: boolean }>;
}

export const TELEPHONY_PROVIDER_REGISTRY = Symbol('TELEPHONY_PROVIDER_REGISTRY');

export interface TelephonyProviderRegistry {
  provider(code: string): TelephonyProvider | undefined;
}
