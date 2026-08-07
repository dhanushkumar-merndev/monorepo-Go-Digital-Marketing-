DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "lead_assignment_queues"
		JOIN "teams"
			ON "teams"."client_organization_id" = "lead_assignment_queues"."client_organization_id"
			AND "teams"."id" = "lead_assignment_queues"."team_id"
		WHERE "lead_assignment_queues"."team_id" IS NOT NULL
			AND "teams"."branch_id" <> "lead_assignment_queues"."branch_id"
	) THEN
		RAISE EXCEPTION 'Phase 3 reconciliation found an assignment queue linked to a team in another branch; repair the queue/team mapping before retrying';
	END IF;
	IF EXISTS (
		SELECT 1
		FROM "lead_assignments"
		JOIN "memberships" ON "memberships"."id" = "lead_assignments"."from_membership_id"
		WHERE "lead_assignments"."from_membership_id" IS NOT NULL
			AND "memberships"."client_organization_id" IS DISTINCT FROM "lead_assignments"."client_organization_id"
	) THEN
		RAISE EXCEPTION 'Phase 3 reconciliation found cross-tenant prior-assignee history; investigate and repair it before retrying';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "lead_assignment_queues" DROP CONSTRAINT "lead_assignment_queues_team_tenant_fk";
--> statement-breakpoint
ALTER TABLE "lead_assignment_queues" ADD CONSTRAINT "lead_assignment_queues_team_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id","team_id") REFERENCES "public"."teams"("client_organization_id","branch_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_from_membership_tenant_fk" FOREIGN KEY ("client_organization_id","from_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;
