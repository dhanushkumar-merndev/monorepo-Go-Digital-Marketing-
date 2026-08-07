INSERT INTO "roles" ("id", "code", "display_name", "context_type", "application", "description")
VALUES (
	gen_random_uuid(), 'TEAM_MANAGER', 'Team Manager', 'CLIENT', 'WEB',
	'Canonical manager of one or more explicitly assigned teams; visibility is derived from active team-manager assignments.'
)
ON CONFLICT ("code") DO UPDATE SET
	"display_name" = EXCLUDED."display_name",
	"context_type" = EXCLUDED."context_type",
	"application" = EXCLUDED."application",
	"description" = EXCLUDED."description";
--> statement-breakpoint

INSERT INTO "permissions" ("id", "code", "description") VALUES
	(gen_random_uuid(), 'organization.departments.read', 'Read departments within effective branch and department scope.'),
	(gen_random_uuid(), 'organization.departments.manage', 'Create and update departments within the active client.'),
	(gen_random_uuid(), 'organization.hierarchy.read', 'Read team membership, Team Manager and reporting relationships.'),
	(gen_random_uuid(), 'organization.hierarchy.manage', 'Manage reasoned team and reporting relationships.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";
--> statement-breakpoint

INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions" ON "permissions"."code" IN (
	'organization.departments.read', 'organization.hierarchy.read'
)
WHERE "roles"."code" IN (
	'AGENCY_ADMIN', 'CLIENT_ADMIN', 'MANAGER', 'SALES_MANAGER', 'TELECALLER',
	'SALESPERSON', 'TEST_RIDE_EXECUTIVE', 'INVENTORY_EXECUTIVE',
	'BILLING_DOCUMENTATION_EXECUTIVE', 'DELIVERY_EXECUTIVE',
	'RC_REGISTRATION_EXECUTIVE', 'TEAM_MANAGER'
)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions" ON "permissions"."code" IN (
	'organization.departments.manage'
)
WHERE "roles"."code" IN ('AGENCY_ADMIN', 'CLIENT_ADMIN')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions" ON "permissions"."code" = 'organization.hierarchy.manage'
WHERE "roles"."code" IN ('AGENCY_ADMIN', 'CLIENT_ADMIN', 'MANAGER', 'SALES_MANAGER')
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions" ON "permissions"."code" IN (
	'account.profile.read', 'account.profile.update', 'account.sessions.read',
	'account.sessions.revoke', 'account.tenant.select',
	'organization.branches.read', 'organization.departments.read',
	'organization.teams.read', 'organization.users.read', 'organization.hierarchy.read',
	'leads.read', 'leads.create', 'leads.transition', 'leads.assign',
	'leads.followups.manage', 'leads.notes.create', 'leads.tasks.manage',
	'leads.duplicates.manage', 'leads.sla.manage'
)
WHERE "roles"."code" = 'TEAM_MANAGER'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

UPDATE "memberships"
SET
	"department_scope_mode" = CASE
		WHEN "branch_scope_mode" = 'ALL' THEN 'ALL'::"membership_scope_mode"
		WHEN "branch_scope_mode" = 'SELECTED' THEN 'SELECTED'::"membership_scope_mode"
		ELSE 'NONE'::"membership_scope_mode"
	END,
	"job_title" = COALESCE(
		"job_title",
		CASE "roles"."code"::text
			WHEN 'CLIENT_ADMIN' THEN 'CRM Admin'
			WHEN 'MANAGER' THEN 'Business Owner'
			WHEN 'SALES_MANAGER' THEN 'Showroom Manager'
			WHEN 'TEAM_MANAGER' THEN 'Team Manager'
			WHEN 'TELECALLER' THEN 'Telecaller'
			WHEN 'SALESPERSON' THEN 'Sales Consultant'
			WHEN 'TEST_RIDE_EXECUTIVE' THEN 'Test Ride Executive'
			WHEN 'INVENTORY_EXECUTIVE' THEN 'Inventory Executive'
			WHEN 'BILLING_DOCUMENTATION_EXECUTIVE' THEN 'Billing and Documentation Executive'
			WHEN 'DELIVERY_EXECUTIVE' THEN 'Delivery Executive'
			WHEN 'RC_REGISTRATION_EXECUTIVE' THEN 'RC and Registration Executive'
			ELSE NULL
		END
	)
FROM "roles"
WHERE "memberships"."role_id" = "roles"."id"
	AND "memberships"."context_type" = 'CLIENT';
--> statement-breakpoint

INSERT INTO "membership_department_scopes" (
	"client_organization_id", "membership_id", "branch_id", "department_id"
)
SELECT
	"membership_branch_scopes"."client_organization_id",
	"membership_branch_scopes"."membership_id",
	"membership_branch_scopes"."branch_id",
	"departments"."id"
FROM "membership_branch_scopes"
JOIN "departments"
	ON "departments"."client_organization_id" = "membership_branch_scopes"."client_organization_id"
	AND "departments"."branch_id" = "membership_branch_scopes"."branch_id"
JOIN "memberships"
	ON "memberships"."client_organization_id" = "membership_branch_scopes"."client_organization_id"
	AND "memberships"."id" = "membership_branch_scopes"."membership_id"
WHERE "memberships"."department_scope_mode" = 'SELECTED'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO "team_memberships" (
	"client_organization_id", "branch_id", "department_id", "team_id", "membership_id", "reason"
)
SELECT
	"membership_team_scopes"."client_organization_id",
	"membership_team_scopes"."branch_id",
	"teams"."department_id",
	"membership_team_scopes"."team_id",
	"membership_team_scopes"."membership_id",
	'Phase 2 recovery backfill from an existing explicit team scope.'
FROM "membership_team_scopes"
JOIN "teams"
	ON "teams"."client_organization_id" = "membership_team_scopes"."client_organization_id"
	AND "teams"."branch_id" = "membership_team_scopes"."branch_id"
	AND "teams"."id" = "membership_team_scopes"."team_id"
ON CONFLICT DO NOTHING;
