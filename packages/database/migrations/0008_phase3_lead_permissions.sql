INSERT INTO "permissions" ("id", "code", "description") VALUES
  (gen_random_uuid(), 'leads.read', 'Read leads permitted by tenant, branch, team and assignment scope.'),
  (gen_random_uuid(), 'leads.create', 'Create lead opportunities and contact evidence.'),
  (gen_random_uuid(), 'leads.transition', 'Record valid lead lifecycle transitions and outcomes.'),
  (gen_random_uuid(), 'leads.assign', 'Assign and reassign leads with reasoned history.'),
  (gen_random_uuid(), 'leads.followups.manage', 'Create and complete lead follow-ups.'),
  (gen_random_uuid(), 'leads.notes.create', 'Append notes to permitted leads.'),
  (gen_random_uuid(), 'leads.tasks.manage', 'Create and complete lead tasks.'),
  (gen_random_uuid(), 'leads.duplicates.manage', 'Review tenant-scoped duplicate candidates.'),
  (gen_random_uuid(), 'leads.sla.manage', 'Review and reconcile lead SLA timers and escalations.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";
--> statement-breakpoint

INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions" ON "permissions"."code" IN (
  'leads.read', 'leads.create', 'leads.transition', 'leads.assign',
  'leads.followups.manage', 'leads.notes.create', 'leads.tasks.manage',
  'leads.duplicates.manage', 'leads.sla.manage'
)
WHERE "roles"."code" IN ('AGENCY_ADMIN', 'CLIENT_ADMIN', 'MANAGER', 'SALES_MANAGER')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions" ON "permissions"."code" IN (
  'leads.read', 'leads.create', 'leads.transition', 'leads.followups.manage',
  'leads.notes.create', 'leads.tasks.manage'
)
WHERE "roles"."code" = 'TELECALLER'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions" ON "permissions"."code" IN (
  'leads.read', 'leads.transition', 'leads.followups.manage',
  'leads.notes.create', 'leads.tasks.manage'
)
WHERE "roles"."code" = 'SALESPERSON'
ON CONFLICT DO NOTHING;
