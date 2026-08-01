import type { Queue } from 'bullmq';

export const REDIS_CONNECTION = Symbol('REDIS_CONNECTION');
export const REDIS_HEALTH_PROBE = Symbol('REDIS_HEALTH_PROBE');
export const BULLMQ_QUEUE_FACTORY = Symbol('BULLMQ_QUEUE_FACTORY');
export const BULLMQ_WORKER_FACTORY = Symbol('BULLMQ_WORKER_FACTORY');

export interface RedisHealthProbe {
  ping(): Promise<{ latencyMs: number }>;
}

/**
 * Application modules ask for queues through this port instead of constructing
 * provider clients. No dealership queue is registered during Phase 0.
 */
export interface BullMqQueueFactory {
  createQueue(name: string): Queue;
}

export interface BackgroundJob {
  id?: string;
  name: string;
  data: unknown;
  attemptsMade: number;
}

export type BackgroundJobProcessor = (job: BackgroundJob) => Promise<unknown>;

export interface BackgroundWorker {
  close(): Promise<void>;
  isRunning(): boolean;
}

/**
 * Provider-neutral worker creation port. Domain modules register processors
 * without importing BullMQ; Phase 0 deliberately registers no domain jobs.
 */
export interface BullMqWorkerFactory {
  createWorker(name: string, processor: BackgroundJobProcessor): BackgroundWorker;
}
