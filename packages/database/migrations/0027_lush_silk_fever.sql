CREATE TYPE "public"."delivery_checklist_code" AS ENUM('ACCESSORIES', 'PDI', 'DOCUMENTS', 'FUEL_OR_CHARGE', 'BATTERY', 'EXTERIOR_CONDITION', 'INTERIOR_CONDITION');--> statement-breakpoint
CREATE TYPE "public"."delivery_proof_status" AS ENUM('PENDING_UPLOAD', 'PENDING_SCAN', 'VERIFIED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."delivery_proof_type" AS ENUM('OTP', 'SIGNATURE', 'PHOTO', 'RECEIVED_BY');--> statement-breakpoint
CREATE TYPE "public"."delivery_reschedule_status" AS ENUM('NONE', 'PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('VEHICLE_ALLOCATED', 'VEHICLE_PREPARATION', 'READY_FOR_DELIVERY', 'DELIVERY_SCHEDULED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELAYED', 'FAILED', 'RESCHEDULED', 'CANCELLED');--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'delivery.jobs.read';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'delivery.jobs.manage';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'delivery.jobs.assign';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'delivery.jobs.execute';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'delivery.jobs.cancel';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'delivery.checklists.manage';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'delivery.proofs.upload';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'delivery.proofs.review';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'delivery.location.write';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'delivery.active_map.read';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'delivery.reschedules.approve';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'delivery.settings.manage';--> statement-breakpoint
CREATE TABLE "delivery_checklist_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"delivery_job_id" uuid NOT NULL,
	"checklist_item_id" uuid NOT NULL,
	"checked" boolean NOT NULL,
	"note" text,
	"actor_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"delivery_job_id" uuid NOT NULL,
	"code" "delivery_checklist_code" NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"note" text,
	"checked_by_membership_id" uuid,
	"checked_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "delivery_checklist_items_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "delivery_checklist_items_version_check" CHECK ("delivery_checklist_items"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "delivery_command_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"command_type" varchar(100) NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"response_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"inventory_unit_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"assigned_membership_id" uuid,
	"assigned_user_id" uuid,
	"status" "delivery_status" DEFAULT 'VEHICLE_ALLOCATED' NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"destination_address" text NOT NULL,
	"destination_latitude" double precision,
	"destination_longitude" double precision,
	"tracking_active" boolean DEFAULT false NOT NULL,
	"tracking_started_at" timestamp with time zone,
	"tracking_expires_at" timestamp with time zone,
	"last_location_at" timestamp with time zone,
	"reschedule_status" "delivery_reschedule_status" DEFAULT 'NONE' NOT NULL,
	"requested_schedule_at" timestamp with time zone,
	"exception_reason" text,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_jobs_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "delivery_jobs_destination_latitude_check" CHECK ("delivery_jobs"."destination_latitude" is null or "delivery_jobs"."destination_latitude" between -90 and 90),
	CONSTRAINT "delivery_jobs_destination_longitude_check" CHECK ("delivery_jobs"."destination_longitude" is null or "delivery_jobs"."destination_longitude" between -180 and 180),
	CONSTRAINT "delivery_jobs_version_check" CHECK ("delivery_jobs"."version" >= 1),
	CONSTRAINT "delivery_jobs_tracking_window_check" CHECK (("delivery_jobs"."tracking_started_at" is null and "delivery_jobs"."tracking_expires_at" is null) or ("delivery_jobs"."tracking_started_at" is not null and "delivery_jobs"."tracking_expires_at" > "delivery_jobs"."tracking_started_at"))
);
--> statement-breakpoint
CREATE TABLE "delivery_location_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"delivery_job_id" uuid NOT NULL,
	"location_session_id" uuid NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"accuracy_meters" double precision NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "delivery_locations_latitude_check" CHECK ("delivery_location_samples"."latitude" between -90 and 90),
	CONSTRAINT "delivery_locations_longitude_check" CHECK ("delivery_location_samples"."longitude" between -180 and 180),
	CONSTRAINT "delivery_locations_accuracy_check" CHECK ("delivery_location_samples"."accuracy_meters" > 0),
	CONSTRAINT "delivery_locations_retention_check" CHECK ("delivery_location_samples"."expires_at" > "delivery_location_samples"."captured_at")
);
--> statement-breakpoint
CREATE TABLE "delivery_location_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"delivery_job_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"stopped_at" timestamp with time zone,
	"stop_reason" varchar(80),
	CONSTRAINT "delivery_location_sessions_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "delivery_location_sessions_window_check" CHECK ("delivery_location_sessions"."expires_at" > "delivery_location_sessions"."started_at")
);
--> statement-breakpoint
CREATE TABLE "delivery_otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"delivery_job_id" uuid NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_otp_challenges_attempts_check" CHECK ("delivery_otp_challenges"."attempts" between 0 and 5)
);
--> statement-breakpoint
CREATE TABLE "delivery_proof_download_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"delivery_job_id" uuid NOT NULL,
	"delivery_proof_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"correlation_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"delivery_job_id" uuid NOT NULL,
	"proof_type" "delivery_proof_type" NOT NULL,
	"status" "delivery_proof_status" NOT NULL,
	"object_key" text,
	"file_name" varchar(240),
	"content_type" varchar(120),
	"content_length" integer,
	"checksum_sha256" varchar(64),
	"scanner_status" varchar(40),
	"received_by_name" varchar(160),
	"value_hash" varchar(64),
	"uploaded_by_membership_id" uuid,
	"reviewed_by_membership_id" uuid,
	"review_reason" text,
	"uploaded_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_proofs_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "delivery_proofs_object_metadata_check" CHECK (("delivery_proofs"."proof_type" in ('SIGNATURE', 'PHOTO') and "delivery_proofs"."object_key" is not null and "delivery_proofs"."content_length" > 0 and "delivery_proofs"."checksum_sha256" is not null) or ("delivery_proofs"."proof_type" = 'RECEIVED_BY' and "delivery_proofs"."received_by_name" is not null) or ("delivery_proofs"."proof_type" = 'OTP' and "delivery_proofs"."value_hash" is not null))
);
--> statement-breakpoint
CREATE TABLE "delivery_settings" (
	"client_organization_id" uuid PRIMARY KEY NOT NULL,
	"required_checklist_codes" jsonb DEFAULT '["ACCESSORIES","PDI","DOCUMENTS","FUEL_OR_CHARGE","BATTERY","EXTERIOR_CONDITION","INTERIOR_CONDITION"]'::jsonb NOT NULL,
	"required_proof_types" jsonb DEFAULT '["RECEIVED_BY"]'::jsonb NOT NULL,
	"active_timeout_minutes" integer DEFAULT 480 NOT NULL,
	"location_retention_days" integer DEFAULT 30 NOT NULL,
	"location_stale_seconds" integer DEFAULT 180 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_membership_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_settings_bounds_check" CHECK ("delivery_settings"."active_timeout_minutes" between 30 and 1440 and "delivery_settings"."location_retention_days" between 1 and 365 and "delivery_settings"."location_stale_seconds" between 60 and 1800 and "delivery_settings"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "delivery_status_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"delivery_job_id" uuid NOT NULL,
	"from_status" "delivery_status",
	"to_status" "delivery_status" NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"reason" text,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_membership_id" uuid,
	"correlation_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_checklist_events" ADD CONSTRAINT "delivery_checklist_events_job_tenant_fk" FOREIGN KEY ("client_organization_id","delivery_job_id") REFERENCES "public"."delivery_jobs"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_checklist_events" ADD CONSTRAINT "delivery_checklist_events_item_tenant_fk" FOREIGN KEY ("client_organization_id","checklist_item_id") REFERENCES "public"."delivery_checklist_items"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_checklist_events" ADD CONSTRAINT "delivery_checklist_events_actor_tenant_fk" FOREIGN KEY ("client_organization_id","actor_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_checklist_items" ADD CONSTRAINT "delivery_checklist_items_job_tenant_fk" FOREIGN KEY ("client_organization_id","delivery_job_id") REFERENCES "public"."delivery_jobs"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_checklist_items" ADD CONSTRAINT "delivery_checklist_items_actor_tenant_fk" FOREIGN KEY ("client_organization_id","checked_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_command_receipts" ADD CONSTRAINT "delivery_command_receipts_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_branch_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id") REFERENCES "public"."branches"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_booking_tenant_fk" FOREIGN KEY ("client_organization_id","booking_id") REFERENCES "public"."bookings"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_inventory_tenant_fk" FOREIGN KEY ("client_organization_id","inventory_unit_id") REFERENCES "public"."inventory_units"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_contact_tenant_fk" FOREIGN KEY ("client_organization_id","contact_id") REFERENCES "public"."contacts"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_lead_tenant_fk" FOREIGN KEY ("client_organization_id","lead_id") REFERENCES "public"."lead_opportunities"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_assignee_tenant_fk" FOREIGN KEY ("client_organization_id","assigned_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_assignee_user_membership_fk" FOREIGN KEY ("assigned_user_id","assigned_membership_id") REFERENCES "public"."memberships"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_jobs" ADD CONSTRAINT "delivery_jobs_creator_tenant_fk" FOREIGN KEY ("client_organization_id","created_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_location_samples" ADD CONSTRAINT "delivery_locations_job_tenant_fk" FOREIGN KEY ("client_organization_id","delivery_job_id") REFERENCES "public"."delivery_jobs"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_location_samples" ADD CONSTRAINT "delivery_locations_session_tenant_fk" FOREIGN KEY ("client_organization_id","location_session_id") REFERENCES "public"."delivery_location_sessions"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_location_sessions" ADD CONSTRAINT "delivery_location_sessions_job_tenant_fk" FOREIGN KEY ("client_organization_id","delivery_job_id") REFERENCES "public"."delivery_jobs"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_location_sessions" ADD CONSTRAINT "delivery_location_sessions_member_tenant_fk" FOREIGN KEY ("client_organization_id","membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_location_sessions" ADD CONSTRAINT "delivery_location_sessions_user_member_fk" FOREIGN KEY ("user_id","membership_id") REFERENCES "public"."memberships"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_otp_challenges" ADD CONSTRAINT "delivery_otp_challenges_job_tenant_fk" FOREIGN KEY ("client_organization_id","delivery_job_id") REFERENCES "public"."delivery_jobs"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_proof_download_events" ADD CONSTRAINT "delivery_proof_downloads_job_tenant_fk" FOREIGN KEY ("client_organization_id","delivery_job_id") REFERENCES "public"."delivery_jobs"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_proof_download_events" ADD CONSTRAINT "delivery_proof_downloads_proof_tenant_fk" FOREIGN KEY ("client_organization_id","delivery_proof_id") REFERENCES "public"."delivery_proofs"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_proof_download_events" ADD CONSTRAINT "delivery_proof_downloads_actor_tenant_fk" FOREIGN KEY ("client_organization_id","actor_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_job_tenant_fk" FOREIGN KEY ("client_organization_id","delivery_job_id") REFERENCES "public"."delivery_jobs"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_uploader_tenant_fk" FOREIGN KEY ("client_organization_id","uploaded_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_proofs" ADD CONSTRAINT "delivery_proofs_reviewer_tenant_fk" FOREIGN KEY ("client_organization_id","reviewed_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_settings" ADD CONSTRAINT "delivery_settings_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_settings" ADD CONSTRAINT "delivery_settings_actor_tenant_fk" FOREIGN KEY ("client_organization_id","updated_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_status_events" ADD CONSTRAINT "delivery_status_events_job_tenant_fk" FOREIGN KEY ("client_organization_id","delivery_job_id") REFERENCES "public"."delivery_jobs"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_status_events" ADD CONSTRAINT "delivery_status_events_actor_tenant_fk" FOREIGN KEY ("client_organization_id","actor_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_checklist_events_timeline_idx" ON "delivery_checklist_events" USING btree ("client_organization_id","delivery_job_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_checklist_items_code_uidx" ON "delivery_checklist_items" USING btree ("client_organization_id","delivery_job_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_command_receipts_key_uidx" ON "delivery_command_receipts" USING btree ("client_organization_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_jobs_booking_uidx" ON "delivery_jobs" USING btree ("client_organization_id","booking_id");--> statement-breakpoint
CREATE INDEX "delivery_jobs_branch_status_schedule_idx" ON "delivery_jobs" USING btree ("client_organization_id","branch_id","status","scheduled_for");--> statement-breakpoint
CREATE INDEX "delivery_jobs_assignee_schedule_idx" ON "delivery_jobs" USING btree ("client_organization_id","assigned_membership_id","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_locations_idempotency_uidx" ON "delivery_location_samples" USING btree ("client_organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "delivery_locations_job_timeline_idx" ON "delivery_location_samples" USING btree ("client_organization_id","delivery_job_id","captured_at");--> statement-breakpoint
CREATE INDEX "delivery_locations_expiry_idx" ON "delivery_location_samples" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_location_sessions_active_job_uidx" ON "delivery_location_sessions" USING btree ("client_organization_id","delivery_job_id") WHERE "delivery_location_sessions"."stopped_at" is null;--> statement-breakpoint
CREATE INDEX "delivery_location_sessions_active_user_idx" ON "delivery_location_sessions" USING btree ("client_organization_id","membership_id","stopped_at");--> statement-breakpoint
CREATE INDEX "delivery_otp_challenges_active_idx" ON "delivery_otp_challenges" USING btree ("client_organization_id","delivery_job_id","expires_at");--> statement-breakpoint
CREATE INDEX "delivery_proof_downloads_timeline_idx" ON "delivery_proof_download_events" USING btree ("client_organization_id","delivery_job_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_proofs_verified_type_uidx" ON "delivery_proofs" USING btree ("client_organization_id","delivery_job_id","proof_type") WHERE "delivery_proofs"."status" = 'VERIFIED';--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_proofs_object_key_uidx" ON "delivery_proofs" USING btree ("object_key") WHERE "delivery_proofs"."object_key" is not null;--> statement-breakpoint
CREATE INDEX "delivery_proofs_job_created_idx" ON "delivery_proofs" USING btree ("client_organization_id","delivery_job_id","created_at");--> statement-breakpoint
CREATE INDEX "delivery_status_events_timeline_idx" ON "delivery_status_events" USING btree ("client_organization_id","delivery_job_id","created_at");
--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
  ('delivery.jobs.read', 'Read scoped delivery jobs and minimized customer details.'),
  ('delivery.jobs.manage', 'Create, prepare and schedule delivery jobs.'),
  ('delivery.jobs.assign', 'Assign eligible delivery executives within branch scope.'),
  ('delivery.jobs.execute', 'Execute assigned deliveries and reasoned exceptions.'),
  ('delivery.jobs.cancel', 'Cancel deliveries with required audit evidence.'),
  ('delivery.checklists.manage', 'Record delivery preparation and PDI checklist evidence.'),
  ('delivery.proofs.upload', 'Capture private configured delivery proof.'),
  ('delivery.proofs.review', 'Review and access private delivery proof.'),
  ('delivery.location.write', 'Submit location for an active assigned delivery.'),
  ('delivery.active_map.read', 'Monitor active stale-aware delivery locations.'),
  ('delivery.reschedules.approve', 'Approve or reject delivery reschedule requests.'),
  ('delivery.settings.manage', 'Manage delivery checklist, proof and location policy.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" IN ('AGENCY_ADMIN', 'CLIENT_ADMIN', 'MANAGER', 'SALES_MANAGER', 'TEAM_MANAGER')
  AND p."code" LIKE 'delivery.%'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'DELIVERY_EXECUTIVE'
  AND p."code" IN (
    'delivery.jobs.read', 'delivery.jobs.execute', 'delivery.checklists.manage',
    'delivery.proofs.upload', 'delivery.location.write'
  )
ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_delivery_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'delivery history is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER delivery_status_events_immutable
BEFORE UPDATE OR DELETE ON "delivery_status_events"
FOR EACH ROW EXECUTE FUNCTION prevent_delivery_history_mutation();
--> statement-breakpoint
CREATE TRIGGER delivery_checklist_events_immutable
BEFORE UPDATE OR DELETE ON "delivery_checklist_events"
FOR EACH ROW EXECUTE FUNCTION prevent_delivery_history_mutation();
--> statement-breakpoint
CREATE TRIGGER delivery_proof_download_events_immutable
BEFORE UPDATE OR DELETE ON "delivery_proof_download_events"
FOR EACH ROW EXECUTE FUNCTION prevent_delivery_history_mutation();
