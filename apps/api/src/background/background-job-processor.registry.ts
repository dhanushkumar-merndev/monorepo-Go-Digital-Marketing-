import { Injectable } from '@nestjs/common';
import type {
  BackgroundJob,
  BackgroundJobProcessor,
} from '../infrastructure/redis/redis.tokens.js';

const SAFE_JOB_NAME = /^[a-z][a-z0-9._-]{1,127}$/;

/**
 * Provider-neutral dispatch registry. Future phases may register named domain
 * processors; the Phase 0 registry starts empty by design.
 */
@Injectable()
export class BackgroundJobProcessorRegistry {
  private readonly processors = new Map<string, BackgroundJobProcessor>();

  register(name: string, processor: BackgroundJobProcessor): void {
    if (!SAFE_JOB_NAME.test(name)) {
      throw new Error(`Invalid background job name: ${name}`);
    }

    if (this.processors.has(name)) {
      throw new Error(`Background processor already registered: ${name}`);
    }

    this.processors.set(name, processor);
  }

  async process(job: BackgroundJob): Promise<unknown> {
    const processor = this.processors.get(job.name);

    if (!processor) {
      throw new Error(`No background processor registered for job: ${job.name}`);
    }

    return processor(job);
  }
}
