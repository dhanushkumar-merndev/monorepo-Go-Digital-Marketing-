CREATE TYPE "public"."export_format" AS ENUM('CSV', 'XLSX');--> statement-breakpoint
CREATE TYPE "public"."export_kind" AS ENUM('AUDIT_EVENTS', 'LEAD_FUNNEL', 'BOOKINGS', 'DELIVERIES', 'REGISTRATION_AGING', 'REMINDERS');--> statement-breakpoint
CREATE TYPE "public"."export_status" AS ENUM('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "export_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"requested_by_membership_id" uuid NOT NULL,
	"kind" "export_kind" NOT NULL,
	"format" "export_format" NOT NULL,
	"filters" jsonb NOT NULL,
	"scope_snapshot" jsonb NOT NULL,
	"status" "export_status" DEFAULT 'QUEUED' NOT NULL,
	"object_key" text,
	"expires_at" timestamp with time zone,
	"failure_code" varchar(100),
	"failure_message" text,
	"correlation_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "export_jobs_expiry_check" CHECK ("export_jobs"."expires_at" is null or "export_jobs"."expires_at" > "export_jobs"."created_at")
);
--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_requester_tenant_fk" FOREIGN KEY ("client_organization_id","requested_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "export_jobs_client_created_idx" ON "export_jobs" USING btree ("client_organization_id","created_at");--> statement-breakpoint
CREATE INDEX "export_jobs_status_idx" ON "export_jobs" USING btree ("status","created_at");