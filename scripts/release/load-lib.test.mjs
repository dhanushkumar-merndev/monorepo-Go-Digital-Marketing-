import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertSafeTarget,
  DEFAULT_CONCURRENCY,
  parseArguments,
  percentile,
  summarizeRun,
  validateScenarios,
} from './load-lib.mjs';

test('load defaults use the mandated 75 concurrent workers', () => {
  const options = parseArguments([], {});
  assert.equal(options.concurrency, DEFAULT_CONCURRENCY);
  assert.equal(options.profile, 'load');
  assert.equal(options.durationSeconds, 60);
  assert.equal(assertSafeTarget(options).origin, 'http://127.0.0.1:4000');
});

test('unsafe accidental concurrency is bounded', () => {
  assert.throws(() => parseArguments(['--concurrency', '501'], {}), /no greater than 500/);
});

test('remote targets need an exact confirmation and HTTPS', () => {
  const base = parseArguments(
    ['--base-url', 'https://api.staging.crm.invalid', '--environment', 'staging'],
    {},
  );
  assert.throws(() => assertSafeTarget(base), /LOAD_TEST_TARGET_CONFIRMATION/);
  assert.equal(
    assertSafeTarget({ ...base, targetConfirmation: 'api.staging.crm.invalid' }).origin,
    'https://api.staging.crm.invalid',
  );
  assert.throws(
    () => assertSafeTarget({ ...base, baseUrl: 'http://api.staging.crm.invalid' }),
    /must use HTTPS/,
  );
  assert.throws(
    () =>
      assertSafeTarget({
        ...base,
        baseUrl: 'https://api.staging.crm.invalid/v1',
        targetConfirmation: 'api.staging.crm.invalid',
      }),
    /without a path/,
  );
});

test('production needs both independent safety latch values', () => {
  const options = parseArguments(
    ['--base-url', 'https://api.crm.invalid', '--environment', 'production', '--allow-production'],
    {},
  );
  assert.throws(() => assertSafeTarget(options), /Production is blocked/);
  assert.equal(
    assertSafeTarget({ ...options, productionConfirmation: 'api.crm.invalid' }).hostname,
    'api.crm.invalid',
  );
});

test('write scenarios remain blocked unless explicitly enabled', () => {
  const scenario = [
    {
      name: 'seeded-command',
      method: 'POST',
      path: '/v1/leads',
      weight: 1,
      expectedStatuses: [201],
    },
  ];
  assert.throws(() => validateScenarios(scenario), /--allow-writes/);
  assert.doesNotThrow(() => validateScenarios(scenario, true));
});

test('summary fails when p95 or error-rate thresholds fail', () => {
  const options = {
    profile: 'load',
    targetEnvironment: 'staging',
    concurrency: 75,
    durationSeconds: 60,
    requestTimeoutMilliseconds: 10_000,
    allowWrites: false,
    minimumRequests: 2,
    maxErrorRate: 0,
    p95Milliseconds: 500,
  };
  const summary = summarizeRun({
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    endedAt: new Date('2026-01-01T00:00:01.000Z'),
    options,
    target: new URL('https://api.staging.crm.invalid'),
    scenarios: [
      { name: 'read', method: 'GET', path: '/v1/health/live', weight: 1, expectedStatuses: [200] },
    ],
    observations: [
      { scenario: 'read', status: 200, ok: true, latencyMilliseconds: 100 },
      { scenario: 'read', status: 500, ok: false, latencyMilliseconds: 800 },
    ],
  });
  assert.equal(summary.result, 'FAIL');
  assert.equal(summary.checks.maximumErrorRate.passed, false);
  assert.equal(summary.checks.maximumP95Milliseconds.passed, false);
  assert.equal(percentile([100, 200, 300, 400], 0.95), 400);
});
