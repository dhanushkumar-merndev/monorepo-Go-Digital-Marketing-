import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  MessagingProvider,
  MessagingProviderConnection,
  NormalizedMessagingEvent,
  ProviderOutboundMessage,
  SyncedMessageTemplate,
} from './messaging-provider.port.js';

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function firstRecord(value: unknown): Record<string, unknown> | undefined {
  return record(array(value)[0]);
}
function header(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
function epoch(value: unknown): Date {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? new Date(numeric * 1_000) : new Date();
}
function endpoint(connection: MessagingProviderConnection, path: string): string {
  const version = String(connection.settings.graph_api_version ?? '').trim();
  if (!version || !/^[vV]\d+\.\d+$/u.test(version))
    throw new Error('Graph API version is missing.');
  return `https://graph.facebook.com/${version}/${path}`;
}
function credentials(connection: MessagingProviderConnection): {
  accessToken: string;
  appSecret: string;
} {
  if (!connection.accessToken || !connection.appSecret)
    throw new Error('Provider credentials are unavailable.');
  return { accessToken: connection.accessToken, appSecret: connection.appSecret };
}

@Injectable()
export class WhatsAppCloudProvider implements MessagingProvider {
  readonly provider = 'WHATSAPP_CLOUD';

  async healthCheck(
    connection: MessagingProviderConnection,
  ): Promise<{ detail?: string; healthy: boolean }> {
    try {
      const { accessToken } = credentials(connection);
      if (!connection.phoneNumberId) throw new Error('Phone-number ID is missing.');
      const response = await fetch(
        endpoint(
          connection,
          `${connection.phoneNumberId}?fields=id,display_phone_number,quality_rating`,
        ),
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      return response.ok
        ? { detail: 'WhatsApp Cloud API connection responded successfully.', healthy: true }
        : {
            detail: `WhatsApp Cloud API returned HTTP ${String(response.status)}.`,
            healthy: false,
          };
    } catch (error) {
      return {
        detail: error instanceof Error ? error.message : 'Provider health check failed.',
        healthy: false,
      };
    }
  }

  async parseWebhook(input: {
    connection: MessagingProviderConnection;
    payload: unknown;
  }): Promise<NormalizedMessagingEvent[]> {
    const root = record(input.payload);
    if (root?.object !== 'whatsapp_business_account') {
      throw new Error('Unsupported WhatsApp webhook object.');
    }
    const events: NormalizedMessagingEvent[] = [];
    for (const entryValue of array(root?.entry)) {
      const entry = record(entryValue);
      if (input.connection.wabaId && entry?.id && String(entry.id) !== input.connection.wabaId) {
        throw new Error('WhatsApp webhook WABA does not match the tenant connection.');
      }
      for (const changeValue of array(entry?.changes)) {
        const change = record(changeValue);
        const value = record(change?.value);
        const metadata = record(value?.metadata);
        if (
          input.connection.phoneNumberId &&
          String(metadata?.phone_number_id ?? '') !== input.connection.phoneNumberId
        ) {
          throw new Error('WhatsApp webhook phone number does not match the tenant connection.');
        }
        const contact = firstRecord(value?.contacts);
        const profile = record(contact?.profile);
        for (const messageValue of array(value?.messages)) {
          const message = record(messageValue);
          if (!message?.id || !message.from) continue;
          const type = String(message.type ?? 'text');
          const text = record(message.text);
          const media = record(message[type]);
          const referral = record(message.referral);
          events.push({
            kind: 'MESSAGE',
            message: {
              ...(text?.body ? { bodyText: String(text.body) } : {}),
              contentType: ['image', 'audio', 'video', 'document'].includes(type)
                ? 'MEDIA'
                : 'TEXT',
              ...(profile?.name ? { customerDisplayName: String(profile.name) } : {}),
              externalEventId: String(message.id),
              ...(media?.id
                ? {
                    media: {
                      mimeType: String(media.mime_type ?? 'application/octet-stream'),
                      providerMediaId: String(media.id),
                    },
                  }
                : {}),
              occurredAt: epoch(message.timestamp),
              providerMessageId: String(message.id),
              ...(referral ? { referral } : {}),
              remoteAddress: String(message.from),
            },
          });
        }
        for (const statusValue of array(value?.statuses)) {
          const status = record(statusValue);
          if (!status?.id || !status.status) continue;
          const normalized = String(status.status).toUpperCase();
          if (!['SENT', 'DELIVERED', 'READ', 'FAILED'].includes(normalized)) continue;
          const error = firstRecord(status.errors);
          events.push({
            kind: 'STATUS',
            status: {
              ...(error?.code ? { errorCode: String(error.code) } : {}),
              ...(error?.title ? { errorMessage: String(error.title) } : {}),
              externalEventId: `${String(status.id)}:${normalized}:${String(status.timestamp ?? '')}`,
              occurredAt: epoch(status.timestamp),
              providerMessageId: String(status.id),
              status: normalized as 'SENT' | 'DELIVERED' | 'READ' | 'FAILED',
            },
          });
        }
      }
    }
    return events;
  }

  async sendMessage(
    connection: MessagingProviderConnection,
    message: ProviderOutboundMessage,
  ): Promise<{ providerMessageId: string; status: 'SENT' }> {
    const { accessToken } = credentials(connection);
    if (!connection.phoneNumberId) throw new Error('Phone-number ID is missing.');
    if (message.contentType === 'MEDIA') {
      throw new Error('WhatsApp Cloud media upload is not activated for this connection.');
    }
    const payload =
      message.contentType === 'TEMPLATE' && message.template
        ? {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: message.remoteAddress,
            type: 'template',
            template: {
              name: message.template.name,
              language: { code: message.template.language },
              components:
                Object.keys(message.template.variables).length === 0
                  ? undefined
                  : [
                      {
                        type: 'body',
                        parameters: Object.entries(message.template.variables)
                          .sort(([left], [right]) => Number(left) - Number(right))
                          .map(([, value]) => ({ type: 'text', text: value })),
                      },
                    ],
            },
          }
        : {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: message.remoteAddress,
            type: 'text',
            text: { body: message.text ?? '' },
          };
    const response = await fetch(endpoint(connection, `${connection.phoneNumberId}/messages`), {
      body: JSON.stringify(payload),
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      method: 'POST',
    });
    const body = (await response.json()) as { messages?: { id?: string }[] };
    const providerMessageId = body.messages?.[0]?.id;
    if (!response.ok || !providerMessageId)
      throw new Error(`WhatsApp send failed with HTTP ${String(response.status)}.`);
    return { providerMessageId, status: 'SENT' };
  }

  async syncTemplates(connection: MessagingProviderConnection): Promise<SyncedMessageTemplate[]> {
    const { accessToken } = credentials(connection);
    if (!connection.wabaId) throw new Error('WABA ID is missing.');
    const response = await fetch(
      endpoint(
        connection,
        `${connection.wabaId}/message_templates?fields=id,name,language,category,status,components&limit=250`,
      ),
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    if (!response.ok) throw new Error(`Template sync failed with HTTP ${String(response.status)}.`);
    const body = (await response.json()) as { data?: Record<string, unknown>[] };
    return (body.data ?? []).flatMap((template) => {
      const category = String(template.category ?? '').toUpperCase();
      const status = String(template.status ?? '').toUpperCase();
      if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(category)) return [];
      const normalizedStatus = ['APPROVED', 'REJECTED', 'PAUSED', 'DISABLED'].includes(status)
        ? status
        : 'PENDING';
      const components = array(template.components).flatMap<Record<string, unknown>>(
        (component) => {
          const parsed = record(component);
          return parsed ? [parsed] : [];
        },
      );
      const bodyComponent = components.find(
        (component) => String(component.type ?? '').toUpperCase() === 'BODY',
      );
      return [
        {
          bodyText: String(bodyComponent?.text ?? ''),
          category: category as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
          components,
          ...(template.id ? { externalTemplateId: String(template.id) } : {}),
          language: String(template.language ?? 'en'),
          name: String(template.name ?? ''),
          providerMetadata: {},
          status: normalizedStatus as SyncedMessageTemplate['status'],
        },
      ];
    });
  }

  async verifyWebhook(input: {
    connection: MessagingProviderConnection;
    headers: Readonly<Record<string, string | string[] | undefined>>;
    rawBody: string;
  }): Promise<boolean> {
    const { appSecret } = credentials(input.connection);
    const supplied = header(input.headers['x-hub-signature-256']);
    if (!supplied?.startsWith('sha256=')) return false;
    const expected = createHmac('sha256', appSecret).update(input.rawBody, 'utf8').digest('hex');
    const left = Buffer.from(supplied.slice(7), 'hex');
    const right = Buffer.from(expected, 'hex');
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
