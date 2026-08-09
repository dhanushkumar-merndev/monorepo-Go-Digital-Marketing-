import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@gdm/config';
import { performance } from 'node:perf_hooks';
import { processingHealthForMode } from '../background/background-processing-mode.js';
import {
  DATABASE_HEALTH_PROBE,
  type DatabaseHealthProbe,
} from '../infrastructure/database/database.tokens.js';
import { REDIS_HEALTH_PROBE, type RedisHealthProbe } from '../infrastructure/redis/redis.tokens.js';
import type { DependencyHealth, LivenessReport, ReadinessReport } from './health.types.js';
import { API_ENVIRONMENT } from '../config/api-config.module.js';

const SERVICE_NAME = 'go-digital-automobile-crm-api';
const SERVICE_VERSION = '0.1.0';

interface HealthProbe {
  ping(): Promise<{ latencyMs: number }>;
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(DATABASE_HEALTH_PROBE)
    private readonly database: DatabaseHealthProbe,
    @Inject(REDIS_HEALTH_PROBE)
    private readonly redis: RedisHealthProbe,
    @Inject(API_ENVIRONMENT)
    private readonly environment: ApiEnvironment,
  ) {}

  liveness(correlationId: string): LivenessReport {
    return {
      status: 'ok',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      release_id: this.environment.releaseId,
      environment: this.environment.nodeEnv,
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(process.uptime()),
      correlation_id: correlationId,
      processing: processingHealthForMode(this.environment.workerMode),
    };
  }

  async readiness(correlationId: string): Promise<ReadinessReport> {
    const [database, redis] = await Promise.all([
      this.check(this.database),
      this.check(this.redis),
    ]);

    return {
      status: database.status === 'up' && redis.status === 'up' ? 'ok' : 'down',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      release_id: this.environment.releaseId,
      environment: this.environment.nodeEnv,
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.floor(process.uptime()),
      correlation_id: correlationId,
      processing: processingHealthForMode(this.environment.workerMode),
      checks: { database, redis },
    };
  }

  private async check(probe: HealthProbe): Promise<DependencyHealth> {
    const startedAt = performance.now();

    try {
      const result = await probe.ping();
      return {
        status: 'up',
        latency_ms: Math.max(0, Math.round(result.latencyMs)),
      };
    } catch {
      return {
        status: 'down',
        latency_ms: Math.max(0, Math.round(performance.now() - startedAt)),
      };
    }
  }
}
