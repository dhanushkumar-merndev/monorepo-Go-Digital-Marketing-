ALTER TYPE "public"."permission_code" ADD VALUE 'organization.branches.manage' BEFORE 'platform.agencies.manage';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'organization.teams.manage' BEFORE 'platform.agencies.manage';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'organization.settings.manage' BEFORE 'platform.agencies.manage';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'organization.audit.read' BEFORE 'platform.agencies.manage';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'platform.defaults.manage' BEFORE 'platform.support_elevation.manage';--> statement-breakpoint
CREATE TABLE "agency_defaults" (
	"agency_id" uuid PRIMARY KEY NOT NULL,
	"default_timezone" varchar(64) DEFAULT 'Asia/Kolkata' NOT NULL,
	"default_feature_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "branch_working_hours" (
	"client_organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"is_closed" boolean DEFAULT false NOT NULL,
	"opens_at" time,
	"closes_at" time,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_working_hours_pk" PRIMARY KEY("branch_id","day_of_week"),
	CONSTRAINT "branch_working_hours_day_check" CHECK ("branch_working_hours"."day_of_week" between 0 and 6),
	CONSTRAINT "branch_working_hours_time_check" CHECK (("branch_working_hours"."is_closed" and "branch_working_hours"."opens_at" is null and "branch_working_hours"."closes_at" is null) or (not "branch_working_hours"."is_closed" and "branch_working_hours"."opens_at" is not null and "branch_working_hours"."closes_at" is not null and "branch_working_hours"."opens_at" < "branch_working_hours"."closes_at")),
	CONSTRAINT "branch_working_hours_version_check" CHECK ("branch_working_hours"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "client_administration_settings" (
	"client_organization_id" uuid PRIMARY KEY NOT NULL,
	"lead_assignment_ready" boolean DEFAULT false NOT NULL,
	"retention_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_administration_settings_version_check" CHECK ("client_administration_settings"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "client_integration_readiness" (
	"client_organization_id" uuid NOT NULL,
	"integration" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'NOT_CONNECTED' NOT NULL,
	"detail" varchar(500),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_integration_readiness_pk" PRIMARY KEY("client_organization_id","integration"),
	CONSTRAINT "client_integration_readiness_status_check" CHECK ("client_integration_readiness"."status" in ('NOT_CONNECTED', 'PENDING_APPROVAL', 'ACTIVE', 'DEGRADED', 'ACTION_REQUIRED', 'SUSPENDED'))
);
--> statement-breakpoint
CREATE TABLE "client_module_flags" (
	"client_organization_id" uuid NOT NULL,
	"module" varchar(64) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"reason" varchar(500),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_module_flags_pk" PRIMARY KEY("client_organization_id","module"),
	CONSTRAINT "client_module_flags_module_not_blank_check" CHECK (char_length(trim("client_module_flags"."module")) > 0)
);
--> statement-breakpoint
ALTER TABLE "agency_defaults" ADD CONSTRAINT "agency_defaults_agency_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_working_hours" ADD CONSTRAINT "branch_working_hours_branch_fk" FOREIGN KEY ("client_organization_id","branch_id") REFERENCES "public"."branches"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_administration_settings" ADD CONSTRAINT "client_administration_settings_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_integration_readiness" ADD CONSTRAINT "client_integration_readiness_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_module_flags" ADD CONSTRAINT "client_module_flags_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "branch_working_hours_client_branch_idx" ON "branch_working_hours" USING btree ("client_organization_id","branch_id");
--> statement-breakpoint
INSERT INTO "permissions" ("id", "code", "description") VALUES
	('40000000-0000-4000-8000-000000000017', 'organization.branches.manage', 'Create and update branches within the active client.'),
	('40000000-0000-4000-8000-000000000018', 'organization.teams.manage', 'Create and update teams within the active client.'),
	('40000000-0000-4000-8000-000000000019', 'organization.settings.manage', 'Configure client profile, working hours and retention settings.'),
	('40000000-0000-4000-8000-000000000020', 'organization.audit.read', 'Read account and permission administration audit events.'),
	('40000000-0000-4000-8000-000000000021', 'platform.defaults.manage', 'Configure safe agency-wide administrative defaults.');
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
CROSS JOIN "permissions"
WHERE
	("roles"."code" = 'AGENCY_ADMIN' AND "permissions"."code" IN ('organization.branches.manage', 'organization.teams.manage', 'organization.settings.manage', 'organization.audit.read', 'platform.defaults.manage'))
	OR ("roles"."code" = 'CLIENT_ADMIN' AND "permissions"."code" IN ('organization.branches.manage', 'organization.teams.manage', 'organization.settings.manage', 'organization.audit.read'))
ON CONFLICT DO NOTHING;
