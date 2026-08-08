export const TELEPHONY_RUNTIME_CONFIG = Symbol('TELEPHONY_RUNTIME_CONFIG');

export interface TelephonyRuntimeConfig {
  developmentAdapterEnabled: boolean;
  developmentWebhookSecret: string;
  manualRecordingMaxBytes: number;
  recordingUrlTtlSeconds: number;
  webhookRawRetentionHours: number;
}
