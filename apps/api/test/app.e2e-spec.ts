import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import {
  apiErrorEnvelopeSchema,
  livenessResponseSchema,
  readinessResponseSchema,
} from '@gdm/contracts';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/application.js';
import {
  DATABASE_HEALTH_PROBE,
  type DatabaseHealthProbe,
} from '../src/infrastructure/database/database.tokens.js';
import {
  REDIS_HEALTH_PROBE,
  type RedisHealthProbe,
} from '../src/infrastructure/redis/redis.tokens.js';

describe('API foundation (HTTP integration)', () => {
  let application: INestApplication;
  let databaseAvailable = true;
  let redisAvailable = true;

  const databaseProbe: DatabaseHealthProbe = {
    async ping() {
      if (!databaseAvailable) {
        throw new Error('Database unavailable in test');
      }

      return { latencyMs: 4 };
    },
  };
  const redisProbe: RedisHealthProbe = {
    async ping() {
      if (!redisAvailable) {
        throw new Error('Redis unavailable in test');
      }

      return { latencyMs: 2 };
    },
  };

  beforeEach(async () => {
    databaseAvailable = true;
    redisAvailable = true;
    Object.assign(process.env, {
      NODE_ENV: 'test',
      API_HOST: '127.0.0.1',
      API_PORT: '4001',
      LOG_LEVEL: 'silent',
      CORS_ORIGINS: 'http://localhost:3000',
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5432/gdm_test',
      REDIS_URL: 'redis://127.0.0.1:6379',
      WORKER_MODE: 'disabled',
      S3_BUCKET: 'gdm-test-private',
      S3_REGION: 'auto',
      S3_ENDPOINT: '',
      S3_ACCESS_KEY_ID: '',
      S3_SECRET_ACCESS_KEY: '',
      SENTRY_DSN: '',
    });

    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DATABASE_HEALTH_PROBE)
      .useValue(databaseProbe)
      .overrideProvider(REDIS_HEALTH_PROBE)
      .useValue(redisProbe)
      .compile();

    application = testingModule.createNestApplication();
    configureApplication(application, { enableShutdownHooks: false });
    await application.init();
  });

  afterEach(async () => {
    await application.close();
  });

  it('serves liveness and propagates a caller correlation ID', async () => {
    const response = await request(application.getHttpServer())
      .get('/v1/health/live')
      .set('x-correlation-id', 'test-correlation-123')
      .expect(200);

    assert.equal(response.headers['x-correlation-id'], 'test-correlation-123');
    assert.equal(response.body.correlation_id, 'test-correlation-123');
    assert.equal(response.body.service, 'go-digital-automobile-crm-api');
    assert.deepEqual(response.body.processing, {
      mode: 'disabled',
      location: 'disabled',
      local_workers: 0,
    });
    livenessResponseSchema.parse(response.body);
  });

  it('reports database and Redis readiness without contacting real services', async () => {
    const response = await request(application.getHttpServer()).get('/v1/health/ready').expect(200);

    assert.equal(response.body.status, 'ok');
    assert.deepEqual(response.body.checks, {
      database: { status: 'up', latency_ms: 4 },
      redis: { status: 'up', latency_ms: 2 },
    });
    readinessResponseSchema.parse(response.body);
  });

  it('returns 503 when a required dependency is down', async () => {
    databaseAvailable = false;

    const response = await request(application.getHttpServer()).get('/v1/health').expect(503);

    assert.equal(response.body.status, 'down');
    assert.equal(response.body.checks.database.status, 'down');
    assert.equal(response.body.checks.redis.status, 'up');
    readinessResponseSchema.parse(response.body);
  });

  it('wraps HTTP failures in the standard API error envelope', async () => {
    const response = await request(application.getHttpServer())
      .get('/v1/not-a-route')
      .set('x-correlation-id', 'error-correlation-123')
      .expect(404);

    assert.equal(response.body.error.code, 'NOT_FOUND');
    assert.equal(response.body.error.correlation_id, 'error-correlation-123');
    assert.equal(response.body.error.retryable, false);
    apiErrorEnvelopeSchema.parse(response.body);
  });

  it('publishes the generated OpenAPI document and Swagger UI', async () => {
    const documentResponse = await request(application.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const uiResponse = await request(application.getHttpServer()).get('/docs/').expect(200);

    assert.equal(documentResponse.body.info.title, 'Go Digital Automobile CRM API');
    assert.ok(documentResponse.body.paths['/v1/health/ready']);
    assert.match(uiResponse.text, /id="swagger-ui"/u);
  });
});
