export const DATABASE_CONNECTION = Symbol('DATABASE_CONNECTION');
export const DATABASE_HEALTH_PROBE = Symbol('DATABASE_HEALTH_PROBE');

export interface DatabaseHealthProbe {
  ping(): Promise<{ latencyMs: number }>;
}
