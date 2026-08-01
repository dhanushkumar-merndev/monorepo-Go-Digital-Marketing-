import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));
const tenantId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446761';

describe('Phase 0 PostgreSQL migration', () => {
  let client: PGlite;

  beforeAll(async () => {
    client = new PGlite();
    await migrate(drizzle(client), { migrationsFolder });
  });

  afterAll(async () => {
    await client.close();
  });

  it('applies through Drizzle and records migration metadata', async () => {
    const tables = await client.query<{ table_name: string }>(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('audit_events', 'outbox_events', 'webhook_events')
      order by table_name
    `);
    const metadata = await client.query<{ count: number }>(`
      select count(*)::int as count from drizzle.__drizzle_migrations
    `);

    expect(tables.rows.map((row) => row.table_name)).toEqual([
      'audit_events',
      'outbox_events',
      'webhook_events',
    ]);
    expect(metadata.rows[0]?.count).toBe(1);
  });

  it('enforces platform/client scope at the database boundary', async () => {
    await expect(
      client.exec(`
        insert into outbox_events (
          scope, aggregate_type, aggregate_id, event_type, payload, correlation_id
        ) values (
          'CLIENT', 'test', 'aggregate-1', 'TestEvent', '{}'::jsonb, 'correlation-scope'
        )
      `),
    ).rejects.toThrow();

    await expect(
      client.exec(`
        insert into outbox_events (
          scope, aggregate_type, aggregate_id, event_type, payload, correlation_id
        ) values (
          'PLATFORM', 'test', 'aggregate-2', 'TestEvent', '{}'::jsonb, 'correlation-platform'
        )
      `),
    ).resolves.toBeDefined();
  });

  it('deduplicates provider events inside a tenant', async () => {
    const insertWebhook = `
      insert into webhook_events (
        client_organization_id,
        provider,
        external_event_id,
        event_type,
        signature_verified_at,
        raw_payload,
        correlation_id,
        raw_payload_expires_at
      ) values (
        '${tenantId}',
        'provider-fixture',
        'external-event-1',
        'fixture.received',
        now(),
        '{}'::jsonb,
        'correlation-webhook',
        now() + interval '7 days'
      )
    `;

    await expect(client.exec(insertWebhook)).resolves.toBeDefined();
    await expect(client.exec(insertWebhook)).rejects.toThrow();
  });

  it('rejects updates and deletes from immutable audit evidence', async () => {
    const inserted = await client.query<{ id: string }>(`
      insert into audit_events (
        scope,
        client_organization_id,
        actor_type,
        action,
        entity_type,
        entity_id,
        outcome,
        correlation_id
      ) values (
        'CLIENT',
        '${tenantId}',
        'SYSTEM',
        'foundation.test',
        'foundation',
        'foundation-1',
        'SUCCESS',
        'correlation-audit'
      )
      returning id
    `);
    const auditId = inserted.rows[0]?.id;

    expect(auditId).toBeDefined();
    await expect(
      client.exec(`update audit_events set reason = 'changed' where id = '${auditId}'`),
    ).rejects.toThrow(/immutable/u);
    await expect(client.exec(`delete from audit_events where id = '${auditId}'`)).rejects.toThrow(
      /immutable/u,
    );
  });
});
