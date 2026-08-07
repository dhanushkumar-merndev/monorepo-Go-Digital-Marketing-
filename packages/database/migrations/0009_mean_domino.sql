ALTER TYPE "public"."canonical_role_code" ADD VALUE 'TEAM_MANAGER';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'organization.departments.read';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'organization.departments.manage';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'organization.hierarchy.read';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'organization.hierarchy.manage';--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "departments_client_branch_id_unique" UNIQUE("client_organization_id","branch_id","id")
);
--> statement-breakpoint
CREATE TABLE "membership_department_scopes" (
	"client_organization_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_department_scopes_pk" PRIMARY KEY("membership_id","department_id")
);
--> statement-breakpoint
CREATE TABLE "reporting_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"subordinate_membership_id" uuid NOT NULL,
	"manager_membership_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"assigned_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "reporting_lines_not_self_check" CHECK ("reporting_lines"."subordinate_membership_id" <> "reporting_lines"."manager_membership_id"),
	CONSTRAINT "reporting_lines_window_check" CHECK ("reporting_lines"."ended_at" is null or "reporting_lines"."ended_at" > "reporting_lines"."started_at")
);
--> statement-breakpoint
CREATE TABLE "team_manager_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"manager_membership_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"assigned_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "team_manager_assignments_window_check" CHECK ("team_manager_assignments"."ended_at" is null or "team_manager_assignments"."ended_at" > "team_manager_assignments"."started_at")
);
--> statement-breakpoint
CREATE TABLE "team_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"assigned_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "team_memberships_window_check" CHECK ("team_memberships"."ended_at" is null or "team_memberships"."ended_at" > "team_memberships"."started_at")
);
--> statement-breakpoint
ALTER TABLE "memberships" DROP CONSTRAINT "memberships_context_check";--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "department_scope_mode" "membership_scope_mode" DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "job_title" varchar(160);--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "department_id" uuid;--> statement-breakpoint
INSERT INTO "departments" (
	"id", "client_organization_id", "branch_id", "code", "name", "active"
)
SELECT
	gen_random_uuid(), "branches"."client_organization_id", "branches"."id",
	'RECOVERY_DEFAULT', 'General', true
FROM "branches"
WHERE NOT EXISTS (
	SELECT 1
	FROM "departments"
	WHERE "departments"."client_organization_id" = "branches"."client_organization_id"
		AND "departments"."branch_id" = "branches"."id"
);--> statement-breakpoint
UPDATE "teams"
SET "department_id" = "departments"."id"
FROM "departments"
WHERE "teams"."client_organization_id" = "departments"."client_organization_id"
	AND "teams"."branch_id" = "departments"."branch_id"
	AND "departments"."code" = 'RECOVERY_DEFAULT'
	AND "teams"."department_id" IS NULL;--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "teams" WHERE "department_id" IS NULL) THEN
		RAISE EXCEPTION 'Phase 2 recovery could not assign every existing team to a department';
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "department_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_client_branch_department_id_unique" UNIQUE("client_organization_id","branch_id","department_id","id");--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_client_branch_fk" FOREIGN KEY ("client_organization_id","branch_id") REFERENCES "public"."branches"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_department_scopes" ADD CONSTRAINT "membership_department_scopes_membership_tenant_fk" FOREIGN KEY ("client_organization_id","membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_department_scopes" ADD CONSTRAINT "membership_department_scopes_department_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id","department_id") REFERENCES "public"."departments"("client_organization_id","branch_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_lines" ADD CONSTRAINT "reporting_lines_subordinate_tenant_fk" FOREIGN KEY ("client_organization_id","subordinate_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_lines" ADD CONSTRAINT "reporting_lines_manager_tenant_fk" FOREIGN KEY ("client_organization_id","manager_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_lines" ADD CONSTRAINT "reporting_lines_assigned_by_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_manager_assignments" ADD CONSTRAINT "team_manager_assignments_team_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id","department_id","team_id") REFERENCES "public"."teams"("client_organization_id","branch_id","department_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_manager_assignments" ADD CONSTRAINT "team_manager_assignments_manager_tenant_fk" FOREIGN KEY ("client_organization_id","manager_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_manager_assignments" ADD CONSTRAINT "team_manager_assignments_assigned_by_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id","department_id","team_id") REFERENCES "public"."teams"("client_organization_id","branch_id","department_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_membership_tenant_fk" FOREIGN KEY ("client_organization_id","membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_assigned_by_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "departments_client_branch_code_uidx" ON "departments" USING btree ("client_organization_id","branch_id","code");--> statement-breakpoint
CREATE INDEX "departments_client_branch_active_idx" ON "departments" USING btree ("client_organization_id","branch_id","active");--> statement-breakpoint
CREATE INDEX "membership_department_scopes_client_department_idx" ON "membership_department_scopes" USING btree ("client_organization_id","department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reporting_lines_current_subordinate_uidx" ON "reporting_lines" USING btree ("client_organization_id","subordinate_membership_id") WHERE "reporting_lines"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "reporting_lines_manager_active_idx" ON "reporting_lines" USING btree ("client_organization_id","manager_membership_id","ended_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_manager_assignments_current_team_uidx" ON "team_manager_assignments" USING btree ("client_organization_id","team_id") WHERE "team_manager_assignments"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "team_manager_assignments_manager_active_idx" ON "team_manager_assignments" USING btree ("client_organization_id","manager_membership_id","ended_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_memberships_active_uidx" ON "team_memberships" USING btree ("client_organization_id","team_id","membership_id") WHERE "team_memberships"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "team_memberships_member_active_idx" ON "team_memberships" USING btree ("client_organization_id","membership_id","ended_at");--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_client_branch_department_fk" FOREIGN KEY ("client_organization_id","branch_id","department_id") REFERENCES "public"."departments"("client_organization_id","branch_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_context_check" CHECK ((
        "memberships"."context_type" = 'AGENCY'
        AND "memberships"."agency_id" IS NOT NULL
        AND "memberships"."client_organization_id" IS NULL
        AND "memberships"."branch_scope_mode" = 'NONE'
        AND "memberships"."department_scope_mode" = 'NONE'
        AND "memberships"."team_scope_mode" = 'NONE'
        AND "memberships"."assignment_scope" = 'NONE'
      ) OR (
        "memberships"."context_type" = 'CLIENT'
        AND "memberships"."agency_id" IS NULL
        AND "memberships"."client_organization_id" IS NOT NULL
      ));
