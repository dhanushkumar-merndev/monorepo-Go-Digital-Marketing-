import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MessagingRateLimiter,
  type MessagingRateLimitStore,
} from '../src/messaging/messaging-rate-limiter.js';
import {
  MESSAGING_OUTBOUND_AMBIGUITY_MS,
  MESSAGING_WEBHOOK_MAX_EVENTS,
  MESSAGING_WEBHOOK_MAX_RAW_BYTES,
  MESSAGING_WEBHOOK_PROCESSING_LEASE_MS,
  messagingRetryDelayWithJitter,
} from '../src/messaging/messaging-reliability.js';

describe('messaging reliability controls', () => {
  it('keeps retry jitter bounded and exposes finite webhook/lease budgets', () => {
    assert.equal(
      messagingRetryDelayWithJitter(1, () => 0),
      1_000,
    );
    assert.equal(
      messagingRetryDelayWithJitter(2, () => 0.5),
      2_000,
    );
    assert.equal(
      messagingRetryDelayWithJitter(30, () => 1),
      300_000,
    );
    assert.equal(MESSAGING_WEBHOOK_MAX_RAW_BYTES, 1_048_576);
    assert.equal(MESSAGING_WEBHOOK_MAX_EVENTS, 100);
    assert.ok(MESSAGING_WEBHOOK_PROCESSING_LEASE_MS < MESSAGING_OUTBOUND_AMBIGUITY_MS);
  });

  it('fails over to a bounded local tenant/provider concurrency limit when Redis is unavailable', async () => {
    const unavailable: MessagingRateLimitStore = {
      acquireConcurrency: () => Promise.reject(new Error('redis unavailable')),
      consume: () => Promise.reject(new Error('redis unavailable')),
      releaseConcurrency: () => Promise.reject(new Error('redis unavailable')),
    };
    const limiter = new MessagingRateLimiter(unavailable);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const active = Array.from({ length: 8 }, () =>
      limiter.withOutboundPermit('tenant-a', 'WHATSAPP_CLOUD', async () => gate),
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    await assert.rejects(
      limiter.withOutboundPermit('tenant-a', 'WHATSAPP_CLOUD', async () => undefined),
      (error: unknown) =>
        error instanceof Error && error.constructor.name === 'MessagingRateLimitExceededError',
    );
    release();
    await Promise.all(active);
  });
});
