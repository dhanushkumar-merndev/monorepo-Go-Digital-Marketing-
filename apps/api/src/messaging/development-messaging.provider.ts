import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type {
  MessagingProvider,
  MessagingProviderConnection,
  NormalizedMessagingEvent,
  ProviderOutboundMessage,
  SyncedMessageTemplate,
} from './messaging-provider.port.js';
import {
  MESSAGING_RUNTIME_CONFIG,
  type MessagingRuntimeConfig,
} from './messaging-runtime-config.js';

function signature(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

@Injectable()
export class DevelopmentMessagingProvider implements MessagingProvider {
  readonly provider = 'DEVELOPMENT';

  constructor(@Inject(MESSAGING_RUNTIME_CONFIG) private readonly config: MessagingRuntimeConfig) {}

  async healthCheck(): Promise<{ detail?: string; healthy: boolean }> {
    return this.config.developmentAdapterEnabled
      ? { detail: 'Development messaging adapter is available.', healthy: true }
      : {
          detail: 'Development messaging adapter is disabled outside development/test.',
          healthy: false,
        };
  }

  async parseWebhook(input: {
    connection: MessagingProviderConnection;
    payload: unknown;
  }): Promise<NormalizedMessagingEvent[]> {
    const payload = asRecord(input.payload);
    if (!payload) throw new Error('Webhook payload must be an object.');
    const type = String(payload.type ?? '');
    if (type === 'status') {
      const status = String(payload.status ?? '').toUpperCase();
      if (!['SENT', 'DELIVERED', 'READ', 'FAILED'].includes(status)) {
        throw new Error('Unsupported development status event.');
      }
      return [
        {
          kind: 'STATUS',
          status: {
            ...(payload.error_code ? { errorCode: String(payload.error_code) } : {}),
            ...(payload.error_message ? { errorMessage: String(payload.error_message) } : {}),
            externalEventId: String(payload.event_id ?? ''),
            occurredAt: new Date(String(payload.occurred_at ?? new Date().toISOString())),
            providerMessageId: String(payload.provider_message_id ?? ''),
            status: status as 'SENT' | 'DELIVERED' | 'READ' | 'FAILED',
          },
        },
      ];
    }
    if (type !== 'message') throw new Error('Unsupported development webhook type.');
    const media = asRecord(payload.media);
    const referral = asRecord(payload.referral);
    return [
      {
        kind: 'MESSAGE',
        message: {
          ...(payload.text ? { bodyText: String(payload.text) } : {}),
          contentType: media ? 'MEDIA' : 'TEXT',
          ...(payload.customer_name ? { customerDisplayName: String(payload.customer_name) } : {}),
          externalEventId: String(payload.event_id ?? ''),
          ...(media
            ? {
                media: {
                  mimeType: String(media.mime_type ?? 'application/octet-stream'),
                  providerMediaId: String(media.provider_media_id ?? ''),
                },
              }
            : {}),
          occurredAt: new Date(String(payload.occurred_at ?? new Date().toISOString())),
          providerMessageId: String(payload.provider_message_id ?? ''),
          ...(payload.provider_sequence
            ? { providerSequence: String(payload.provider_sequence) }
            : {}),
          ...(referral ? { referral } : {}),
          remoteAddress: String(payload.from ?? ''),
        },
      },
    ];
  }

  async sendMessage(
    _connection: MessagingProviderConnection,
    _message: ProviderOutboundMessage,
  ): Promise<{ providerMessageId: string; status: 'SENT' }> {
    if (!this.config.developmentAdapterEnabled) throw new Error('Development adapter is disabled.');
    return { providerMessageId: `dev-${randomUUID()}`, status: 'SENT' };
  }

  async syncTemplates(): Promise<SyncedMessageTemplate[]> {
    return [
      {
        bodyText: 'Hello {{1}}, this is an update about your vehicle enquiry.',
        category: 'UTILITY',
        components: [],
        externalTemplateId: 'dev-follow-up-update',
        language: 'en',
        name: 'lead_follow_up_update',
        providerMetadata: { development_fixture: true },
        status: 'APPROVED',
      },
      {
        bodyText: 'Hello {{1}}, explore the latest offers from our dealership.',
        category: 'MARKETING',
        components: [],
        externalTemplateId: 'dev-marketing-offer',
        language: 'en',
        name: 'dealership_offer',
        providerMetadata: { development_fixture: true },
        status: 'APPROVED',
      },
    ];
  }

  async verifyWebhook(input: {
    headers: Readonly<Record<string, string | string[] | undefined>>;
    rawBody: string;
  }): Promise<boolean> {
    if (!this.config.developmentAdapterEnabled) return false;
    const supplied = signature(input.headers['x-gdm-signature']);
    if (!supplied) return false;
    const expected = createHmac('sha256', this.config.developmentWebhookSecret)
      .update(input.rawBody, 'utf8')
      .digest('hex');
    const left = Buffer.from(supplied.replace(/^sha256=/u, ''), 'hex');
    const right = Buffer.from(expected, 'hex');
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
