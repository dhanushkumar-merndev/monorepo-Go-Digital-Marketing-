import 'reflect-metadata';
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { configureApplication } from '../src/application.js';
import { AuthenticationRateLimiter } from '../src/auth/authentication-rate-limiter.js';
import { ClientModuleAccessService } from '../src/authorization/client-module-access.service.js';
import { BOT_PROTECTION } from '../src/leads/bot-protection.port.js';
import { LEADS_RUNTIME_CONFIG } from '../src/leads/leads-runtime-config.js';
import { LeadsService } from '../src/leads/leads.service.js';

const form = {
  active: true,
  assignmentQueueId: null,
  botProtectionEnabled: false,
  branchId: '20000000-0000-4000-8000-000000000001',
  clientOrganizationId: '10000000-0000-4000-8000-000000000001',
  consentNoticeVersion: 'notice-v1',
  id: '30000000-0000-4000-8000-000000000001',
  rateLimitPerMinute: 12,
};
const payload = {
  campaign: { page_url: 'https://dealer.example/enquiry' },
  consent: {
    evidence: 'Checked consent box on the public enquiry form.',
    granted: true,
    notice_version: 'notice-v1',
    purpose: 'LEAD_RESPONSE',
  },
  name: 'Public Customer',
  phone: '9876543210',
  source: 'WEBSITE',
  vehicle_interest: 'Model X',
};

describe('public lead form HTTP integration', () => {
  let application: INestApplication;
  let captured: unknown[][];
  let limited: unknown[][];
  let botAllowed: boolean;
  let botRequired: boolean;

  beforeEach(async () => {
    captured = [];
    limited = [];
    botAllowed = true;
    botRequired = false;
    Object.assign(process.env, {
      NODE_ENV: 'test',
      API_HOST: '127.0.0.1',
      API_PORT: '4001',
      LOG_LEVEL: 'silent',
      CORS_ORIGINS: 'http://localhost:3000',
      AUTH_ACCESS_TOKEN_SECRET: 'test-access-token-secret-at-least-thirty-two-characters',
      AUTH_PASSWORD_PEPPER: 'test-password-pepper-at-least-thirty-two-characters',
      AUTH_REFRESH_COOKIE_NAME: 'test_refresh',
      AUTH_REFRESH_TOKEN_PEPPER: 'test-refresh-pepper-at-least-thirty-two-characters',
      API_TRUSTED_PROXIES: '',
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
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(LeadsService)
      .useValue({
        createPublic: (...args: unknown[]) => {
          captured.push(args);
          return { lead: { id: '40000000-0000-4000-8000-000000000001' }, replayed: false };
        },
        publicForm: () => ({ ...form, botProtectionEnabled: botRequired }),
      })
      .overrideProvider(AuthenticationRateLimiter)
      .useValue({ assertAllowed: (...args: unknown[]) => void limited.push(args) })
      .overrideProvider(ClientModuleAccessService)
      .useValue({ assertEnabled: () => undefined })
      .overrideProvider(BOT_PROTECTION)
      .useValue({ verify: () => botAllowed })
      .overrideProvider(LEADS_RUNTIME_CONFIG)
      .useValue({ phoneLookupPepper: 'test-pepper', publicRateLimitWindowSeconds: 60 })
      .compile();
    application = module.createNestApplication();
    configureApplication(application, { enableShutdownHooks: false, openApi: false });
    await application.init();
  });

  afterEach(async () => application.close());

  it('exposes the versioned public route and forwards rate-limited idempotent consent evidence', async () => {
    const response = await request(application.getHttpServer())
      .post('/v1/public/lead-forms/dealer-form')
      .set('Idempotency-Key', 'public-event-1')
      .send(payload);
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(response.body.replayed, false);
    assert.equal(limited.length, 1);
    assert.equal(captured.length, 1);
    assert.equal(captured[0]?.[2], 'public-event-1');
  });

  it('rejects stale consent evidence before lead creation', async () => {
    await request(application.getHttpServer())
      .post('/v1/public/lead-forms/dealer-form')
      .set('Idempotency-Key', 'public-event-2')
      .send({
        ...payload,
        consent: { ...payload.consent, notice_version: 'retired-notice' },
      })
      .expect(400);
    assert.equal(captured.length, 0);
  });

  it('fails closed when a configured bot provider rejects verification', async () => {
    botRequired = true;
    botAllowed = false;
    await request(application.getHttpServer())
      .post('/v1/public/lead-forms/dealer-form')
      .set('Idempotency-Key', 'public-event-3')
      .send({ ...payload, bot_token: 'provider-token' })
      .expect(503);
    assert.equal(captured.length, 0);
  });
});
