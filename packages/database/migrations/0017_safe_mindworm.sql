CREATE TYPE "public"."test_ride_booking_status" AS ENUM('HELD', 'RELEASED', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."test_ride_status" AS ENUM('REQUESTED', 'BOOKED', 'CUSTOMER_CONFIRMED', 'EXECUTIVE_ASSIGNED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'NO_SHOW');--> statement-breakpoint
CREATE TYPE "public"."test_ride_tracking_stop_reason" AS ENUM('COMPLETED', 'CANCELLED', 'NO_SHOW', 'MANUAL_STOP', 'PERMISSION_REVOKED', 'TIMEOUT');--> statement-breakpoint
CREATE TABLE "test_ride_demo_vehicle_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"test_ride_job_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"demo_vehicle_reference" varchar(100) NOT NULL,
	"scheduled_start_at" timestamp with time zone NOT NULL,
	"scheduled_end_at" timestamp with time zone NOT NULL,
	"status" "test_ride_booking_status" DEFAULT 'HELD' NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_ride_vehicle_bookings_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "test_ride_vehicle_bookings_schedule_check" CHECK ("test_ride_demo_vehicle_bookings"."scheduled_end_at" > "test_ride_demo_vehicle_bookings"."scheduled_start_at")
);
--> statement-breakpoint
CREATE TABLE "test_ride_command_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"test_ride_job_id" uuid NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"command_type" varchar(64) NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"response_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_ride_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"test_ride_job_id" uuid NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"from_status" "test_ride_status",
	"to_status" "test_ride_status",
	"actor_user_id" uuid,
	"actor_membership_id" uuid,
	"reason" text,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_ride_events_client_id_unique" UNIQUE("client_organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "test_ride_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"team_id" uuid,
	"vehicle_model" varchar(240) NOT NULL,
	"demo_vehicle_reference" varchar(100) NOT NULL,
	"customer_location" text NOT NULL,
	"notes" text,
	"scheduled_start_at" timestamp with time zone NOT NULL,
	"scheduled_end_at" timestamp with time zone NOT NULL,
	"status" "test_ride_status" DEFAULT 'REQUESTED' NOT NULL,
	"executive_user_id" uuid,
	"executive_membership_id" uuid,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone,
	"confirmation_channel" varchar(32),
	"confirmed_at" timestamp with time zone,
	"otp_required" boolean DEFAULT false NOT NULL,
	"otp_hash" varchar(64),
	"start_odometer_km" integer,
	"end_odometer_km" integer,
	"start_checklist" jsonb,
	"completion_checklist" jsonb,
	"completion_evidence" text,
	"feedback" text,
	"cancellation_reason" text,
	"no_show_reason" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"no_show_at" timestamp with time zone,
	"tracking_started_at" timestamp with time zone,
	"tracking_stopped_at" timestamp with time zone,
	"tracking_expires_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_ride_jobs_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "test_ride_jobs_schedule_check" CHECK ("test_ride_jobs"."scheduled_end_at" > "test_ride_jobs"."scheduled_start_at"),
	CONSTRAINT "test_ride_jobs_version_check" CHECK ("test_ride_jobs"."version" >= 1),
	CONSTRAINT "test_ride_jobs_odometer_check" CHECK (("test_ride_jobs"."start_odometer_km" is null or "test_ride_jobs"."start_odometer_km" >= 0) and ("test_ride_jobs"."end_odometer_km" is null or "test_ride_jobs"."end_odometer_km" >= "test_ride_jobs"."start_odometer_km")),
	CONSTRAINT "test_ride_jobs_otp_check" CHECK (("test_ride_jobs"."otp_required" = false and "test_ride_jobs"."otp_hash" is null) or ("test_ride_jobs"."otp_required" = true and "test_ride_jobs"."otp_hash" is not null))
);
--> statement-breakpoint
CREATE TABLE "test_ride_location_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"test_ride_job_id" uuid NOT NULL,
	"location_session_id" uuid NOT NULL,
	"executive_user_id" uuid NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"accuracy_meters" double precision NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	CONSTRAINT "test_ride_locations_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "test_ride_locations_latitude_check" CHECK ("test_ride_location_samples"."latitude" between -90 and 90),
	CONSTRAINT "test_ride_locations_longitude_check" CHECK ("test_ride_location_samples"."longitude" between -180 and 180),
	CONSTRAINT "test_ride_locations_accuracy_check" CHECK ("test_ride_location_samples"."accuracy_meters" > 0),
	CONSTRAINT "test_ride_locations_retention_check" CHECK ("test_ride_location_samples"."expires_at" > "test_ride_location_samples"."captured_at")
);
--> statement-breakpoint
CREATE TABLE "test_ride_location_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"test_ride_job_id" uuid NOT NULL,
	"executive_user_id" uuid NOT NULL,
	"executive_membership_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"stopped_at" timestamp with time zone,
	"stop_reason" "test_ride_tracking_stop_reason",
	CONSTRAINT "test_ride_location_sessions_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "test_ride_location_sessions_window_check" CHECK ("test_ride_location_sessions"."expires_at" > "test_ride_location_sessions"."started_at")
);
--> statement-breakpoint
ALTER TABLE "test_ride_demo_vehicle_bookings" ADD CONSTRAINT "test_ride_vehicle_bookings_job_tenant_fk" FOREIGN KEY ("client_organization_id","test_ride_job_id") REFERENCES "public"."test_ride_jobs"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_demo_vehicle_bookings" ADD CONSTRAINT "test_ride_vehicle_bookings_branch_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id") REFERENCES "public"."branches"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_command_receipts" ADD CONSTRAINT "test_ride_command_receipts_job_tenant_fk" FOREIGN KEY ("client_organization_id","test_ride_job_id") REFERENCES "public"."test_ride_jobs"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_events" ADD CONSTRAINT "test_ride_events_job_tenant_fk" FOREIGN KEY ("client_organization_id","test_ride_job_id") REFERENCES "public"."test_ride_jobs"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_events" ADD CONSTRAINT "test_ride_events_actor_membership_tenant_fk" FOREIGN KEY ("client_organization_id","actor_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_events" ADD CONSTRAINT "test_ride_events_actor_user_membership_fk" FOREIGN KEY ("actor_user_id","actor_membership_id") REFERENCES "public"."memberships"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_jobs" ADD CONSTRAINT "test_ride_jobs_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_jobs" ADD CONSTRAINT "test_ride_jobs_lead_tenant_fk" FOREIGN KEY ("client_organization_id","lead_id") REFERENCES "public"."lead_opportunities"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_jobs" ADD CONSTRAINT "test_ride_jobs_contact_tenant_fk" FOREIGN KEY ("client_organization_id","contact_id") REFERENCES "public"."contacts"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_jobs" ADD CONSTRAINT "test_ride_jobs_branch_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id") REFERENCES "public"."branches"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_jobs" ADD CONSTRAINT "test_ride_jobs_team_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id","team_id") REFERENCES "public"."teams"("client_organization_id","branch_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_jobs" ADD CONSTRAINT "test_ride_jobs_executive_membership_tenant_fk" FOREIGN KEY ("client_organization_id","executive_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_jobs" ADD CONSTRAINT "test_ride_jobs_executive_user_membership_fk" FOREIGN KEY ("executive_user_id","executive_membership_id") REFERENCES "public"."memberships"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_jobs" ADD CONSTRAINT "test_ride_jobs_assigned_by_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_jobs" ADD CONSTRAINT "test_ride_jobs_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_location_samples" ADD CONSTRAINT "test_ride_locations_job_tenant_fk" FOREIGN KEY ("client_organization_id","test_ride_job_id") REFERENCES "public"."test_ride_jobs"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_location_samples" ADD CONSTRAINT "test_ride_locations_session_tenant_fk" FOREIGN KEY ("client_organization_id","location_session_id") REFERENCES "public"."test_ride_location_sessions"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_location_samples" ADD CONSTRAINT "test_ride_locations_user_fk" FOREIGN KEY ("executive_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_location_sessions" ADD CONSTRAINT "test_ride_location_sessions_job_tenant_fk" FOREIGN KEY ("client_organization_id","test_ride_job_id") REFERENCES "public"."test_ride_jobs"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_location_sessions" ADD CONSTRAINT "test_ride_location_sessions_member_tenant_fk" FOREIGN KEY ("client_organization_id","executive_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_location_sessions" ADD CONSTRAINT "test_ride_location_sessions_user_member_fk" FOREIGN KEY ("executive_user_id","executive_membership_id") REFERENCES "public"."memberships"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "test_ride_vehicle_bookings_active_job_uidx" ON "test_ride_demo_vehicle_bookings" USING btree ("client_organization_id","test_ride_job_id") WHERE "test_ride_demo_vehicle_bookings"."status" = 'HELD';--> statement-breakpoint
CREATE INDEX "test_ride_vehicle_bookings_overlap_idx" ON "test_ride_demo_vehicle_bookings" USING btree ("client_organization_id","branch_id","demo_vehicle_reference","status","scheduled_start_at","scheduled_end_at");--> statement-breakpoint
CREATE UNIQUE INDEX "test_ride_command_receipts_key_uidx" ON "test_ride_command_receipts" USING btree ("client_organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "test_ride_command_receipts_job_idx" ON "test_ride_command_receipts" USING btree ("client_organization_id","test_ride_job_id","created_at");--> statement-breakpoint
CREATE INDEX "test_ride_events_timeline_idx" ON "test_ride_events" USING btree ("client_organization_id","test_ride_job_id","created_at","id");--> statement-breakpoint
CREATE INDEX "test_ride_jobs_client_schedule_idx" ON "test_ride_jobs" USING btree ("client_organization_id","scheduled_start_at","status");--> statement-breakpoint
CREATE INDEX "test_ride_jobs_assignee_status_idx" ON "test_ride_jobs" USING btree ("client_organization_id","executive_membership_id","status","scheduled_start_at");--> statement-breakpoint
CREATE INDEX "test_ride_jobs_active_tracking_idx" ON "test_ride_jobs" USING btree ("client_organization_id","status","tracking_stopped_at");--> statement-breakpoint
CREATE UNIQUE INDEX "test_ride_locations_idempotency_uidx" ON "test_ride_location_samples" USING btree ("client_organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "test_ride_locations_job_timeline_idx" ON "test_ride_location_samples" USING btree ("client_organization_id","test_ride_job_id","captured_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "test_ride_location_sessions_active_job_uidx" ON "test_ride_location_sessions" USING btree ("client_organization_id","test_ride_job_id") WHERE "test_ride_location_sessions"."stopped_at" is null;--> statement-breakpoint
CREATE INDEX "test_ride_location_sessions_active_user_idx" ON "test_ride_location_sessions" USING btree ("client_organization_id","executive_membership_id","stopped_at");
--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
  ('test_rides.read', 'Read test rides within tenant, branch, team and assignment scope.'),
  ('test_rides.schedule', 'Schedule, book and confirm test rides for scoped Leads.'),
  ('test_rides.assign', 'Assign or reassign an eligible Test Ride Executive.'),
  ('test_rides.execute', 'Start and finish only an assigned test-ride job.'),
  ('test_rides.location.write', 'Submit location only during an explicitly active assigned ride.'),
  ('test_rides.active_map.read', 'Read ACTIVE rides and their stale-aware current location.'),
  ('test_rides.cancel', 'Cancel a scoped test ride with a mandatory reason.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" IN ('AGENCY_ADMIN', 'CLIENT_ADMIN', 'MANAGER', 'SALES_MANAGER', 'TEAM_MANAGER')
  AND p."code" IN (
    'test_rides.read',
    'test_rides.schedule',
    'test_rides.assign',
    'test_rides.active_map.read',
    'test_rides.cancel'
  )
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'SALESPERSON'
  AND p."code" IN ('test_rides.read', 'test_rides.schedule', 'test_rides.cancel')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'TEST_RIDE_EXECUTIVE'
  AND p."code" IN (
    'test_rides.read',
    'test_rides.execute',
    'test_rides.location.write',
    'test_rides.cancel'
  )
ON CONFLICT DO NOTHING;
