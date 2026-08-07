export const LEADS_RUNTIME_CONFIG = Symbol('LEADS_RUNTIME_CONFIG');

export interface LeadsRuntimeConfig {
  phoneLookupPepper: string;
  publicRateLimitWindowSeconds: number;
}
