export type NormalizedMessageStatus = 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'RECEIVED';

export interface MessagingProviderConnection {
  accessToken?: string;
  appSecret?: string;
  businessPhoneE164?: string;
  connectionId: string;
  connectionKey: string;
  phoneNumberId?: string;
  provider: string;
  settings: Record<string, unknown>;
  verifyToken?: string;
  wabaId?: string;
}

export interface NormalizedInboundMessage {
  bodyText?: string;
  contentType: 'TEXT' | 'MEDIA';
  customerDisplayName?: string;
  externalEventId: string;
  media?: {
    mimeType: string;
    providerMediaId: string;
  };
  occurredAt: Date;
  providerMessageId: string;
  providerSequence?: string;
  referral?: Record<string, unknown>;
  remoteAddress: string;
}

export interface NormalizedStatusEvent {
  errorCode?: string;
  errorMessage?: string;
  externalEventId: string;
  occurredAt: Date;
  providerMessageId: string;
  status: NormalizedMessageStatus;
}

export type NormalizedMessagingEvent =
  | { kind: 'MESSAGE'; message: NormalizedInboundMessage }
  | { kind: 'STATUS'; status: NormalizedStatusEvent };

export interface ProviderOutboundMessage {
  contentType: 'TEXT' | 'TEMPLATE' | 'MEDIA';
  media?: { objectKey: string; mimeType: string };
  remoteAddress: string;
  template?: { language: string; name: string; variables: Record<string, string> };
  text?: string;
}

export interface SyncedMessageTemplate {
  bodyText: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  components: Record<string, unknown>[];
  externalTemplateId?: string;
  language: string;
  name: string;
  providerMetadata: Record<string, unknown>;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAUSED' | 'DISABLED';
}

export interface MessagingProvider {
  readonly provider: string;
  healthCheck(
    connection: MessagingProviderConnection,
  ): Promise<{ detail?: string; healthy: boolean }>;
  parseWebhook(input: {
    connection: MessagingProviderConnection;
    payload: unknown;
  }): Promise<NormalizedMessagingEvent[]>;
  sendMessage(
    connection: MessagingProviderConnection,
    message: ProviderOutboundMessage,
  ): Promise<{ providerMessageId: string; status: 'SENT' }>;
  syncTemplates(connection: MessagingProviderConnection): Promise<SyncedMessageTemplate[]>;
  verifyWebhook(input: {
    connection: MessagingProviderConnection;
    headers: Readonly<Record<string, string | string[] | undefined>>;
    rawBody: string;
  }): Promise<boolean>;
}

export const MESSAGING_PROVIDER_REGISTRY = Symbol('MESSAGING_PROVIDER_REGISTRY');

export interface MessagingProviderRegistry {
  provider(code: string): MessagingProvider | undefined;
}
