import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type {
  NormalizedCallEvent,
  ProviderCallStatus,
  StartProviderCallRequest,
  TelephonyProvider,
  TelephonyProviderConnection,
} from './telephony-provider.port.js';
import {
  TELEPHONY_RUNTIME_CONFIG,
  type TelephonyRuntimeConfig,
} from './telephony-runtime-config.js';
import { Inject } from '@nestjs/common';

const eventSchema = z.object({
  call_id: z.string().trim().min(1).max(256),
  direction: z.enum(['INBOUND', 'OUTBOUND']).optional(),
  duration_seconds: z.number().int().min(0).optional(),
  event_id: z.string().trim().min(1).max(256),
  event_type: z.string().trim().min(1).max(128).default('CALL_STATUS_UPDATED'),
  lead_id: z.uuid().optional(),
  occurred_at: z.iso.datetime({ offset: true }),
  recording: z
    .object({
      id: z.string().trim().min(1).max(256),
      recorded_at: z.iso.datetime({ offset: true }).optional(),
      reference: z.string().trim().max(500).optional(),
    })
    .optional(),
  status: z.string().trim().min(1).max(64),
});

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function headerValue(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  name: string,
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Local-only deterministic provider. It exists for contract and end-to-end testing;
 * it is never a substitute for a reviewed production provider.
 */
@Injectable()
export class DevelopmentTelephonyProvider implements TelephonyProvider {
  readonly provider = 'DEVELOPMENT';
  private readonly queuedEvents = new Map<string, NormalizedCallEvent[]>();

  constructor(@Inject(TELEPHONY_RUNTIME_CONFIG) private readonly config: TelephonyRuntimeConfig) {}

  async startCall(
    _connection: TelephonyProviderConnection,
    _request: StartProviderCallRequest,
  ): Promise<{ providerCallId: string; status: ProviderCallStatus }> {
    return { providerCallId: `dev-call-${randomUUID()}`, status: 'REQUESTED' };
  }

  async verifyWebhook(input: {
    connection: TelephonyProviderConnection;
    headers: Readonly<Record<string, string | string[] | undefined>>;
    rawBody: string;
  }): Promise<boolean> {
    if (!this.config.developmentAdapterEnabled) return false;
    const provided = headerValue(input.headers, 'x-telephony-signature');
    if (!provided) return false;
    const expected = createHmac('sha256', this.config.developmentWebhookSecret)
      .update(`${input.connection.connectionKey}.${input.rawBody}`, 'utf8')
      .digest('hex');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(provided, 'utf8');
    return (
      expectedBuffer.length === providedBuffer.length &&
      timingSafeEqual(expectedBuffer, providedBuffer)
    );
  }

  async parseCallEvent(input: {
    connection: TelephonyProviderConnection;
    payload: unknown;
  }): Promise<NormalizedCallEvent> {
    const event = eventSchema.parse(input.payload);
    return {
      ...(event.direction ? { direction: event.direction } : {}),
      ...(event.duration_seconds === undefined ? {} : { durationSeconds: event.duration_seconds }),
      eventType: event.event_type,
      externalEventId: event.event_id,
      ...(event.lead_id ? { leadId: event.lead_id } : {}),
      occurredAt: new Date(event.occurred_at),
      providerCallId: event.call_id,
      ...(event.recording
        ? {
            recording: {
              providerRecordingId: event.recording.id,
              ...(event.recording.recorded_at
                ? { recordedAt: new Date(event.recording.recorded_at) }
                : {}),
              ...(event.recording.reference
                ? { providerRecordingReference: event.recording.reference }
                : {}),
            },
          }
        : {}),
      status: this.normalizeStatus(event.status),
    };
  }

  async getRecording(): Promise<{ objectKey?: string } | undefined> {
    // The development adapter deliberately has no recording material or direct provider URL.
    return undefined;
  }

  async syncCalls(input: {
    connection: TelephonyProviderConnection;
    cursor?: string;
  }): Promise<{ cursor?: string; events: NormalizedCallEvent[] }> {
    const events = this.queuedEvents.get(input.connection.connectionId) ?? [];
    this.queuedEvents.set(input.connection.connectionId, []);
    return { ...(input.cursor ? { cursor: input.cursor } : {}), events };
  }

  normalizeStatus(value: string): ProviderCallStatus {
    const normalized = value.trim().toUpperCase();
    if (
      normalized === 'REQUESTED' ||
      normalized === 'RINGING' ||
      normalized === 'ANSWERED' ||
      normalized === 'COMPLETED' ||
      normalized === 'FAILED' ||
      normalized === 'CANCELLED'
    )
      return normalized;
    return 'UNKNOWN';
  }

  async healthCheck(): Promise<{ detail: string; healthy: boolean }> {
    return {
      detail: this.config.developmentAdapterEnabled
        ? 'Development adapter is available; no live provider is configured.'
        : 'Development adapter is disabled outside development/test.',
      healthy: this.config.developmentAdapterEnabled,
    };
  }

  /** Contract-test hook for provider events missed by webhook delivery. */
  queueReconciliationEvent(connectionId: string, event: NormalizedCallEvent): void {
    const queued = this.queuedEvents.get(connectionId) ?? [];
    queued.push(event);
    this.queuedEvents.set(connectionId, queued);
  }
}

export { canonicalJson };
