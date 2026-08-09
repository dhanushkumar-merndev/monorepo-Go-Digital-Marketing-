import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ApiEnvironment } from '@gdm/config';
import type { Queue } from 'bullmq';
import { ReminderScheduler } from '../src/reminders/reminder-scheduler.js';

const environment = (workerMode: ApiEnvironment['workerMode']): ApiEnvironment =>
  ({ workerMode }) as ApiEnvironment;

const logger = {
  error: (): void => undefined,
  info: (): void => undefined,
  setContext: (): void => undefined,
};

describe('ReminderScheduler', () => {
  it('registers one durable recurring scan in the standalone worker', async () => {
    const registrations: unknown[][] = [];
    const scheduler = new ReminderScheduler(
      environment('standalone'),
      'worker',
      {
        createQueue: () =>
          ({
            upsertJobScheduler: async (...arguments_: unknown[]) => {
              registrations.push(arguments_);
            },
          }) as unknown as Queue,
      },
      logger as never,
    );

    await scheduler.onApplicationBootstrap();
    scheduler.beforeApplicationShutdown();

    assert.equal(registrations.length, 1);
    assert.equal(registrations[0]?.[0], 'reminders-due-scan-v1');
    assert.deepEqual(registrations[0]?.[1], { every: 60_000 });
    assert.deepEqual(registrations[0]?.[2], {
      data: {},
      name: 'reminders.dispatch-due.all',
      opts: {
        attempts: 5,
        backoff: { delay: 5_000, jitter: 0.5, type: 'exponential' },
        removeOnComplete: 1_000,
        removeOnFail: 1_000,
      },
    });
  });

  it('does not schedule from a producer-only API process', async () => {
    let queuesCreated = 0;
    const scheduler = new ReminderScheduler(
      environment('standalone'),
      'api',
      {
        createQueue: () => {
          queuesCreated += 1;
          return {} as Queue;
        },
      },
      logger as never,
    );

    await scheduler.onApplicationBootstrap();
    scheduler.beforeApplicationShutdown();

    assert.equal(queuesCreated, 0);
  });
});
