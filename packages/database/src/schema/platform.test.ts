import { getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { auditEvents, outboxEvents, webhookEvents } from './platform.js';

describe('platform schema', () => {
  it('contains only the Phase 0 platform tables', () => {
    expect([
      getTableName(outboxEvents),
      getTableName(webhookEvents),
      getTableName(auditEvents),
    ]).toEqual(['outbox_events', 'webhook_events', 'audit_events']);
  });

  it('requires tenant ownership for webhook events', () => {
    const tenantColumn = getTableConfig(webhookEvents).columns.find(
      (column) => column.name === 'client_organization_id',
    );

    expect(tenantColumn?.notNull).toBe(true);
  });

  it('indexes the outbox for pending delivery', () => {
    const indexNames = getTableConfig(outboxEvents).indexes.map((entry) => entry.config.name);
    expect(indexNames).toContain('outbox_events_pending_idx');
  });
});
