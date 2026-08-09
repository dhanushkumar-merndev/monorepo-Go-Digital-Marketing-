import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));
const journal = JSON.parse(
  readFileSync(new URL('../migrations/meta/_journal.json', import.meta.url), 'utf8'),
) as { entries: { idx: number; tag: string }[] };

async function applyMigration(client: PGlite, index: number): Promise<void> {
  const entry = journal.entries.find((candidate) => candidate.idx === index);
  if (!entry) throw new Error(`Migration journal entry ${index} is missing.`);
  const sql = readFileSync(`${migrationsFolder}/${entry.tag}.sql`, 'utf8');
  for (const statement of sql
    .split('--> statement-breakpoint')
    .map((value) => value.trim())
    .filter(Boolean)) {
    await client.exec(statement);
  }
}

async function applyThrough(client: PGlite, finalIndex: number): Promise<void> {
  for (let index = 0; index <= finalIndex; index += 1) await applyMigration(client, index);
}

describe('populated Phase 1 to Phase 3 migration compatibility', () => {
  it('preserves existing scoped organization data through migrations 0009-0011', async () => {
    const client = new PGlite();
    const agencyId = '20000000-0000-4000-8000-000000000001';
    const tenantId = '20000000-0000-4000-8000-000000000002';
    const branchId = '20000000-0000-4000-8000-000000000003';
    const otherBranchId = '20000000-0000-4000-8000-000000000004';
    const teamId = '20000000-0000-4000-8000-000000000005';
    const userId = '20000000-0000-4000-8000-000000000006';
    const membershipId = '20000000-0000-4000-8000-000000000007';
    const queueId = '20000000-0000-4000-8000-000000000008';

    try {
      await applyThrough(client, 8);
      await client.exec(`
          insert into agencies (id, code, legal_name, display_name)
          values ('${agencyId}', 'COMPAT_AGENCY', 'Compatibility Agency', 'Compatibility Agency');

          insert into client_organizations (
            id, agency_id, code, legal_name, display_name, status, timezone
          ) values (
            '${tenantId}', '${agencyId}', 'COMPAT_CLIENT',
            'Compatibility Motors', 'Compatibility Motors', 'ACTIVE', 'Asia/Kolkata'
          );

          insert into branches (id, client_organization_id, code, name) values
            ('${branchId}', '${tenantId}', 'MAIN', 'Main Branch'),
            ('${otherBranchId}', '${tenantId}', 'SECOND', 'Second Branch');

          insert into teams (id, client_organization_id, branch_id, code, name)
          values ('${teamId}', '${tenantId}', '${branchId}', 'SALES_A', 'Sales A');

          insert into users (id, display_name, primary_email_normalized, status)
          values ('${userId}', 'Compatibility Manager', 'compat.manager@example.com', 'ACTIVE');

          insert into memberships (
            id, user_id, context_type, client_organization_id, role_id, status,
            branch_scope_mode, team_scope_mode, assignment_scope
          ) values (
            '${membershipId}', '${userId}', 'CLIENT', '${tenantId}',
            (select id from roles where code = 'SALES_MANAGER'), 'ACTIVE',
            'SELECTED', 'SELECTED', 'ALL'
          );

          insert into membership_branch_scopes (client_organization_id, membership_id, branch_id)
          values ('${tenantId}', '${membershipId}', '${branchId}');

          insert into membership_team_scopes (
            client_organization_id, membership_id, branch_id, team_id
          ) values ('${tenantId}', '${membershipId}', '${branchId}', '${teamId}');

          insert into lead_assignment_queues (
            id, client_organization_id, branch_id, team_id, code, name
          ) values ('${queueId}', '${tenantId}', '${branchId}', '${teamId}', 'QUEUE_A', 'Queue A');
        `);

      await applyMigration(client, 9);
      await applyMigration(client, 10);
      await applyMigration(client, 11);

      const migrated = await client.query<{
        department_code: string;
        department_scope_mode: string;
        job_title: string;
        team_name: string;
      }>(`
          select
            d.code as department_code,
            m.department_scope_mode::text as department_scope_mode,
            m.job_title,
            t.name as team_name
          from teams t
          join departments d
            on d.client_organization_id = t.client_organization_id
           and d.id = t.department_id
          join team_memberships tm
            on tm.client_organization_id = t.client_organization_id
           and tm.team_id = t.id
           and tm.membership_id = '${membershipId}'
          join memberships m on m.id = tm.membership_id
          where t.id = '${teamId}'
        `);
      const departmentScope = await client.query<{ count: number }>(`
          select count(*)::int as count
          from membership_department_scopes
          where client_organization_id = '${tenantId}' and membership_id = '${membershipId}'
        `);
      const queue = await client.query<{ branch_id: string; team_id: string }>(`
          select branch_id::text, team_id::text from lead_assignment_queues where id = '${queueId}'
        `);

      expect(migrated.rows).toEqual([
        {
          department_code: 'RECOVERY_DEFAULT',
          department_scope_mode: 'SELECTED',
          job_title: 'Showroom Manager',
          team_name: 'Sales A',
        },
      ]);
      expect(departmentScope.rows[0]?.count).toBe(1);
      expect(queue.rows).toEqual([{ branch_id: branchId, team_id: teamId }]);
      await expect(
        client.exec(`
            insert into lead_assignment_queues (
              client_organization_id, branch_id, team_id, code, name
            ) values ('${tenantId}', '${otherBranchId}', '${teamId}', 'BROKEN', 'Broken Queue')
          `),
      ).rejects.toThrow();
    } finally {
      await client.close();
    }
  }, 60_000);
});
