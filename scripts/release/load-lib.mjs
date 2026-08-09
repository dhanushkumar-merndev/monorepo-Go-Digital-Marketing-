import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const DEFAULT_CONCURRENCY = 75;

export const DEFAULT_SCENARIOS = Object.freeze([
  { name: 'liveness', method: 'GET', path: '/v1/health/live', weight: 2, expectedStatuses: [200] },
  {
    name: 'readiness',
    method: 'GET',
    path: '/v1/health/ready',
    weight: 2,
    expectedStatuses: [200],
  },
  {
    name: 'lead-list',
    method: 'GET',
    path: '/v1/leads?limit=25',
    weight: 3,
    expectedStatuses: [200],
    requiresAuth: true,
  },
  {
    name: 'test-ride-list',
    method: 'GET',
    path: '/v1/test-rides?limit=25',
    weight: 2,
    expectedStatuses: [200],
    requiresAuth: true,
  },
  {
    name: 'inventory-list',
    method: 'GET',
    path: '/v1/inventory/units?limit=25',
    weight: 2,
    expectedStatuses: [200],
    requiresAuth: true,
  },
  {
    name: 'booking-list',
    method: 'GET',
    path: '/v1/commercial/bookings?limit=25',
    weight: 2,
    expectedStatuses: [200],
    requiresAuth: true,
  },
  {
    name: 'delivery-list',
    method: 'GET',
    path: '/v1/delivery?limit=25',
    weight: 1,
    expectedStatuses: [200],
    requiresAuth: true,
  },
  {
    name: 'registration-list',
    method: 'GET',
    path: '/v1/registration-cases?limit=25',
    weight: 1,
    expectedStatuses: [200],
    requiresAuth: true,
  },
  {
    name: 'conversation-list',
    method: 'GET',
    path: '/v1/messaging/conversations?limit=25',
    weight: 2,
    expectedStatuses: [200],
    requiresAuth: true,
  },
]);

const PROFILES = Object.freeze({
  load: { durationSeconds: 60, p95Milliseconds: 500, maxErrorRate: 0.01 },
  soak: { durationSeconds: 900, p95Milliseconds: 500, maxErrorRate: 0.01 },
});

const BOOLEAN_OPTIONS = new Set(['allow-production', 'allow-writes', 'help']);

export function parseArguments(argv, environment = process.env) {
  const values = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${argument}`);
    }

    const key = argument.slice(2);
    if (BOOLEAN_OPTIONS.has(key)) {
      values[key] = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    values[key] = value;
    index += 1;
  }

  const profile = values.profile ?? environment.LOAD_TEST_PROFILE ?? 'load';
  if (!(profile in PROFILES)) {
    throw new Error(`Unsupported profile "${profile}". Use load or soak.`);
  }
  const defaults = PROFILES[profile];

  return {
    profile,
    baseUrl: values['base-url'] ?? environment.LOAD_TEST_BASE_URL ?? 'http://127.0.0.1:4000',
    targetEnvironment: values.environment ?? environment.LOAD_TEST_ENVIRONMENT ?? 'local',
    concurrency: parsePositiveInteger(
      values.concurrency ?? environment.LOAD_TEST_CONCURRENCY ?? DEFAULT_CONCURRENCY,
      'concurrency',
      500,
    ),
    durationSeconds: parsePositiveNumber(
      values.duration ?? environment.LOAD_TEST_DURATION_SECONDS ?? defaults.durationSeconds,
      'duration',
      86_400,
    ),
    requestTimeoutMilliseconds: parsePositiveInteger(
      values['request-timeout-ms'] ?? environment.LOAD_TEST_REQUEST_TIMEOUT_MS ?? 10_000,
      'request-timeout-ms',
      300_000,
    ),
    p95Milliseconds: parsePositiveNumber(
      values['max-p95-ms'] ?? environment.LOAD_TEST_MAX_P95_MS ?? defaults.p95Milliseconds,
      'max-p95-ms',
    ),
    maxErrorRate: parseRate(
      values['max-error-rate'] ?? environment.LOAD_TEST_MAX_ERROR_RATE ?? defaults.maxErrorRate,
      'max-error-rate',
    ),
    minimumRequests: parsePositiveInteger(
      values['minimum-requests'] ??
        environment.LOAD_TEST_MINIMUM_REQUESTS ??
        DEFAULT_CONCURRENCY * 2,
      'minimum-requests',
    ),
    scenarioFile: values.scenarios ?? environment.LOAD_TEST_SCENARIO_FILE,
    outputFile: values.output ?? environment.LOAD_TEST_OUTPUT_FILE,
    bearerToken: environment.LOAD_TEST_BEARER_TOKEN,
    allowWrites: Boolean(values['allow-writes']),
    allowProduction: Boolean(values['allow-production']),
    targetConfirmation: environment.LOAD_TEST_TARGET_CONFIRMATION,
    productionConfirmation: environment.LOAD_TEST_PRODUCTION_CONFIRMATION,
    help: Boolean(values.help),
  };
}

export function assertSafeTarget(options) {
  let url;
  try {
    url = new URL(options.baseUrl);
  } catch {
    throw new Error('The load-test base URL is invalid.');
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error('The base URL must not contain credentials, a query string, or a fragment.');
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error('The base URL must contain only an origin, without a path.');
  }

  const environment = String(options.targetEnvironment).toLowerCase();
  if (!['local', 'development', 'test', 'staging', 'production'].includes(environment)) {
    throw new Error('Target environment must be local, development, test, staging, or production.');
  }

  const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname);
  if (environment === 'local' && !loopback) {
    throw new Error('A local load test may target only a loopback address.');
  }
  if (!loopback && url.protocol !== 'https:') {
    throw new Error('Remote load-test targets must use HTTPS.');
  }
  if (!loopback && environment !== 'production' && options.targetConfirmation !== url.host) {
    throw new Error(
      `Set LOAD_TEST_TARGET_CONFIRMATION=${url.host} to confirm the non-production target.`,
    );
  }
  if (environment === 'production') {
    if (!options.allowProduction || options.productionConfirmation !== url.host) {
      throw new Error(
        `Production is blocked. Both --allow-production and LOAD_TEST_PRODUCTION_CONFIRMATION=${url.host} are required.`,
      );
    }
  }

  return new URL(url.href.endsWith('/') ? url.href : `${url.href}/`);
}

export async function loadScenarios(options) {
  const scenarios = options.scenarioFile
    ? JSON.parse(await readFile(resolve(options.scenarioFile), 'utf8'))
    : DEFAULT_SCENARIOS;
  validateScenarios(scenarios, options.allowWrites);

  if (scenarios.some((scenario) => scenario.requiresAuth) && !options.bearerToken) {
    throw new Error(
      'The selected scenarios include protected routes. Set LOAD_TEST_BEARER_TOKEN to a non-production test-user token.',
    );
  }
  return scenarios;
}

export function validateScenarios(scenarios, allowWrites = false) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    throw new Error('The scenario file must contain a non-empty JSON array.');
  }

  const names = new Set();
  for (const [index, scenario] of scenarios.entries()) {
    if (!scenario || typeof scenario !== 'object') {
      throw new Error(`Scenario ${index} must be an object.`);
    }
    if (typeof scenario.name !== 'string' || !scenario.name.trim() || names.has(scenario.name)) {
      throw new Error(`Scenario ${index} must have a unique non-empty name.`);
    }
    names.add(scenario.name);

    const method = String(scenario.method ?? 'GET').toUpperCase();
    if (!allowWrites && !['GET', 'HEAD'].includes(method)) {
      throw new Error(
        `Scenario "${scenario.name}" uses ${method}; pass --allow-writes only for resettable seeded data.`,
      );
    }
    if (
      typeof scenario.path !== 'string' ||
      !scenario.path.startsWith('/') ||
      scenario.path.startsWith('//')
    ) {
      throw new Error(
        `Scenario "${scenario.name}" must use a relative path beginning with one slash.`,
      );
    }
    if (!Number.isInteger(scenario.weight) || scenario.weight < 1 || scenario.weight > 1_000) {
      throw new Error(`Scenario "${scenario.name}" weight must be an integer from 1 to 1000.`);
    }
    if (
      !Array.isArray(scenario.expectedStatuses) ||
      scenario.expectedStatuses.length === 0 ||
      scenario.expectedStatuses.some(
        (status) => !Number.isInteger(status) || status < 100 || status > 599,
      )
    ) {
      throw new Error(`Scenario "${scenario.name}" must declare valid expectedStatuses.`);
    }
  }
}

export function percentile(values, quantile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.ceil(quantile * sorted.length) - 1);
  return sorted[index];
}

export function summarizeRun({ startedAt, endedAt, options, target, scenarios, observations }) {
  const total = observations.length;
  const failures = observations.filter((observation) => !observation.ok);
  const latencies = observations.map((observation) => observation.latencyMilliseconds);
  const elapsedSeconds = Math.max(0.001, (endedAt.getTime() - startedAt.getTime()) / 1_000);
  const errorRate = total === 0 ? 1 : failures.length / total;

  const byScenario = Object.fromEntries(
    scenarios.map((scenario) => {
      const selected = observations.filter((observation) => observation.scenario === scenario.name);
      const selectedFailures = selected.filter((observation) => !observation.ok);
      const selectedLatencies = selected.map((observation) => observation.latencyMilliseconds);
      return [
        scenario.name,
        {
          requests: selected.length,
          failures: selectedFailures.length,
          errorRate: selected.length === 0 ? 1 : selectedFailures.length / selected.length,
          latencyMilliseconds: latencySummary(selectedLatencies),
          statuses: countBy(selected, (observation) =>
            String(observation.status ?? 'network-error'),
          ),
        },
      ];
    }),
  );

  const checks = {
    minimumRequests: {
      expected: options.minimumRequests,
      actual: total,
      passed: total >= options.minimumRequests,
    },
    maximumErrorRate: {
      expected: options.maxErrorRate,
      actual: errorRate,
      passed: errorRate <= options.maxErrorRate,
    },
    maximumP95Milliseconds: {
      expected: options.p95Milliseconds,
      actual: percentile(latencies, 0.95),
      passed: percentile(latencies, 0.95) <= options.p95Milliseconds,
    },
    everyScenarioExercised: {
      expected: scenarios.length,
      actual: Object.values(byScenario).filter((entry) => entry.requests > 0).length,
      passed: Object.values(byScenario).every((entry) => entry.requests > 0),
    },
  };

  return {
    schemaVersion: 1,
    kind: 'go-digital-crm-load-test',
    profile: options.profile,
    target: {
      environment: options.targetEnvironment,
      origin: target.origin,
    },
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    configured: {
      concurrency: options.concurrency,
      durationSeconds: options.durationSeconds,
      requestTimeoutMilliseconds: options.requestTimeoutMilliseconds,
      writesEnabled: options.allowWrites,
    },
    result: Object.values(checks).every((check) => check.passed) ? 'PASS' : 'FAIL',
    checks,
    aggregate: {
      requests: total,
      failures: failures.length,
      errorRate,
      requestsPerSecond: total / elapsedSeconds,
      latencyMilliseconds: latencySummary(latencies),
      failureSamples: failures.slice(0, 20).map(({ scenario, status, error }) => ({
        scenario,
        status: status ?? null,
        error: error ?? null,
      })),
    },
    scenarios: byScenario,
  };
}

export async function executeLoadTest(options, scenarios, fetchImplementation = fetch) {
  const target = assertSafeTarget(options);
  const startedAt = new Date();
  const deadline = performance.now() + options.durationSeconds * 1_000;
  const observations = [];
  const weightedScenarios = scenarios.flatMap((scenario) => Array(scenario.weight).fill(scenario));

  async function worker() {
    while (performance.now() < deadline) {
      const scenario = weightedScenarios[Math.floor(Math.random() * weightedScenarios.length)];
      const requestUrl = new URL(scenario.path.slice(1), target);
      const headers = { accept: 'application/json' };
      if (scenario.requiresAuth) headers.authorization = `Bearer ${options.bearerToken}`;
      const requestStarted = performance.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.requestTimeoutMilliseconds);

      try {
        const method = String(scenario.method ?? 'GET').toUpperCase();
        if (scenario.body !== undefined) headers['content-type'] = 'application/json';
        const response = await fetchImplementation(requestUrl, {
          method,
          headers,
          body:
            scenario.body === undefined || method === 'GET' || method === 'HEAD'
              ? undefined
              : JSON.stringify(scenario.body),
          signal: controller.signal,
        });
        await response.arrayBuffer();
        observations.push({
          scenario: scenario.name,
          status: response.status,
          ok: scenario.expectedStatuses.includes(response.status),
          latencyMilliseconds: performance.now() - requestStarted,
        });
      } catch (error) {
        observations.push({
          scenario: scenario.name,
          ok: false,
          latencyMilliseconds: performance.now() - requestStarted,
          error: error instanceof Error ? error.name : 'UnknownError',
        });
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  await Promise.all(Array.from({ length: options.concurrency }, () => worker()));
  const endedAt = new Date();
  return summarizeRun({ startedAt, endedAt, options, target, scenarios, observations });
}

export async function writeSummary(outputFile, summary) {
  if (!outputFile) return;
  const outputPath = resolve(outputFile);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
}

function latencySummary(values) {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    minimum = Math.min(minimum, value);
    maximum = Math.max(maximum, value);
  }
  return {
    minimum: values.length === 0 ? 0 : minimum,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    maximum: values.length === 0 ? 0 : maximum,
  };
}

function countBy(values, selector) {
  return values.reduce((counts, value) => {
    const key = selector(value);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function parsePositiveInteger(value, name, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum)
    throw new Error(`${name} must be a positive integer no greater than ${maximum}.`);
  return parsed;
}

function parsePositiveNumber(value, name, maximum = Number.MAX_VALUE) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > maximum)
    throw new Error(`${name} must be greater than zero and no greater than ${maximum}.`);
  return parsed;
}

function parseRate(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`${name} must be between zero and one.`);
  }
  return parsed;
}
