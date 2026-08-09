export const MESSAGING_WEBHOOK_MAX_RAW_BYTES = 1_048_576;
export const MESSAGING_WEBHOOK_MAX_EVENTS = 100;
export const MESSAGING_WEBHOOK_PROCESSING_LEASE_MS = 5 * 60_000;
export const MESSAGING_OUTBOUND_AMBIGUITY_MS = 15 * 60_000;

const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_MAX_DELAY_MS = 5 * 60_000;
const RETRY_JITTER_RATIO = 0.2;

/**
 * Exponential retry delay with bounded symmetric jitter. The injectable random
 * source keeps the production path unpredictable and the reliability tests
 * deterministic.
 */
export function messagingRetryDelayWithJitter(
  attempt: number,
  random: () => number = Math.random,
): number {
  const normalizedAttempt = Math.max(1, Math.floor(attempt));
  const exponential = Math.min(
    RETRY_MAX_DELAY_MS,
    RETRY_BASE_DELAY_MS * 2 ** Math.min(20, normalizedAttempt - 1),
  );
  const normalizedRandom = Math.min(1, Math.max(0, random()));
  const jitter = exponential * RETRY_JITTER_RATIO * (normalizedRandom * 2 - 1);
  return Math.max(
    RETRY_BASE_DELAY_MS,
    Math.min(RETRY_MAX_DELAY_MS, Math.round(exponential + jitter)),
  );
}
