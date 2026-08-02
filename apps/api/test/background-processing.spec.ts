import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ApiEnvironment, WorkerMode } from '@gdm/config';
import type { PinoLogger } from 'nestjs-pino';
import { BackgroundJobProcessorRegistry } from '../src/background/background-job-processor.registry.js';
import { BackgroundProcessingLifecycle } from '../src/background/background-processing.lifecycle.js';
import {
  assertStandaloneWorkerMode,
  processingHealthForMode,
} from '../src/background/background-processing-mode.js';
import type {
  BackgroundJobProcessor,
  BackgroundWorker,
  BullMqWorkerFactory,
} from '../src/infrastructure/redis/redis.tokens.js';

const logger = {
  info: (..._arguments: unknown[]) => undefined,
  setContext: (_context: string) => undefined,
} as unknown as PinoLogger;

function environmentFor(workerMode: WorkerMode): ApiEnvironment {
  return { workerMode } as ApiEnvironment;
}

function createWorkerHarness(): {
  factory: BullMqWorkerFactory;
  created: { name: string; processor: BackgroundJobProcessor }[];
  worker: BackgroundWorker;
  closed: { count: number };
} {
  const created: { name: string; processor: BackgroundJobProcessor }[] = [];
  const closed = { count: 0 };
  const worker: BackgroundWorker = {
    async close() {
      closed.count += 1;
    },
    isRunning: () => true,
  };
  const factory: BullMqWorkerFactory = {
    createWorker(name, processor) {
      created.push({ name, processor });
      return worker;
    },
  };

  return { factory, created, worker, closed };
}

describe('background processing modes', () => {
  it('maps every API mode to an explicit health representation', () => {
    assert.deepEqual(processingHealthForMode('disabled'), {
      mode: 'disabled',
      location: 'disabled',
      local_workers: 0,
    });
    assert.deepEqual(processingHealthForMode('embedded'), {
      mode: 'embedded',
      location: 'local',
      local_workers: 1,
    });
    assert.deepEqual(processingHealthForMode('standalone'), {
      mode: 'standalone',
      location: 'external',
      local_workers: 0,
    });
  });

  it('allows only standalone mode for the dedicated entrypoint', () => {
    assert.doesNotThrow(() => assertStandaloneWorkerMode('standalone'));
    assert.throws(() => assertStandaloneWorkerMode('disabled'), /WORKER_MODE=standalone/u);
    assert.throws(() => assertStandaloneWorkerMode('embedded'), /WORKER_MODE=standalone/u);
  });

  it('keeps the API process producer-only in disabled and standalone modes', () => {
    for (const workerMode of ['disabled', 'standalone'] as const) {
      const harness = createWorkerHarness();
      const lifecycle = new BackgroundProcessingLifecycle(
        environmentFor(workerMode),
        harness.factory,
        new BackgroundJobProcessorRegistry(),
        'api',
        logger,
      );

      lifecycle.onApplicationBootstrap();
      assert.equal(harness.created.length, 0);
    }
  });

  it('starts and gracefully closes one embedded API worker', async () => {
    const harness = createWorkerHarness();
    const lifecycle = new BackgroundProcessingLifecycle(
      environmentFor('embedded'),
      harness.factory,
      new BackgroundJobProcessorRegistry(),
      'api',
      logger,
    );

    lifecycle.onApplicationBootstrap();
    assert.equal(harness.created.length, 1);
    assert.equal(harness.created[0]?.name, 'platform-jobs');

    await lifecycle.beforeApplicationShutdown();
    assert.equal(harness.closed.count, 1);
  });

  it('starts a dedicated worker only in standalone mode', async () => {
    const harness = createWorkerHarness();
    const lifecycle = new BackgroundProcessingLifecycle(
      environmentFor('standalone'),
      harness.factory,
      new BackgroundJobProcessorRegistry(),
      'worker',
      logger,
    );

    lifecycle.onApplicationBootstrap();
    assert.equal(harness.created.length, 1);
    await lifecycle.beforeApplicationShutdown();
    assert.equal(harness.closed.count, 1);

    for (const workerMode of ['disabled', 'embedded'] as const) {
      const invalidLifecycle = new BackgroundProcessingLifecycle(
        environmentFor(workerMode),
        createWorkerHarness().factory,
        new BackgroundJobProcessorRegistry(),
        'worker',
        logger,
      );

      assert.throws(() => invalidLifecycle.onApplicationBootstrap(), /WORKER_MODE=standalone/u);
    }
  });
});

describe('background processor registry', () => {
  it('dispatches registered provider-neutral processors', async () => {
    const registry = new BackgroundJobProcessorRegistry();
    registry.register('platform.test', async (job) => ({ processed: job.id }));

    const result = await registry.process({
      id: 'job-123',
      name: 'platform.test',
      data: { safe: true },
      attemptsMade: 0,
    });

    assert.deepEqual(result, { processed: 'job-123' });
  });

  it('rejects duplicate and unregistered processors', async () => {
    const registry = new BackgroundJobProcessorRegistry();
    registry.register('platform.test', async () => undefined);

    assert.throws(
      () => registry.register('platform.test', async () => undefined),
      /already registered/u,
    );
    await assert.rejects(
      registry.process({
        name: 'platform.unknown',
        data: undefined,
        attemptsMade: 0,
      }),
      /No background processor registered/u,
    );
  });
});
