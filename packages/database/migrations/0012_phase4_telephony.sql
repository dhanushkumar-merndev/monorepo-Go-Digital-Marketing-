CREATE TYPE "public"."telephony_call_direction" AS ENUM('INBOUND', 'OUTBOUND');--> statement-breakpoint
CREATE TYPE "public"."telephony_call_origin" AS ENUM('PROVIDER', 'TEL_FALLBACK');--> statement-breakpoint
CREATE TYPE "public"."telephony_call_outcome" AS ENUM('INTERESTED', 'CALLBACK', 'TEST_RIDE_REQUESTED', 'SHOWROOM_VISIT', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'NOT_INTERESTED', 'ALREADY_PURCHASED', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."telephony_call_status" AS ENUM('REQUESTED', 'RINGING', 'ANSWERED', 'COMPLETED', 'FAILED', 'CANCELLED', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."telephony_connection_status" AS ENUM('ACTIVE', 'DISABLED', 'PENDING_APPROVAL', 'DEGRADED');--> statement-breakpoint
CREATE TYPE "public"."telephony_outcome_requirement" AS ENUM('NOT_REQUIRED', 'REQUIRED', 'RECORDED', 'EXCEPTION');--> statement-breakpoint
CREATE TYPE "public"."telephony_participant_role" AS ENUM('AGENT', 'CUSTOMER', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."telephony_reconciliation_status" AS ENUM('RUNNING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."telephony_recording_availability" AS ENUM('PENDING', 'AVAILABLE', 'UNAVAILABLE', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "call_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"call_id" uuid NOT NULL,
	"provider" varchar(64) NOT NULL,
	"provider_event_id" varchar(256),
	"event_type" varchar(128) NOT NULL,
	"status" "telephony_call_status",
	"occurred_at" timestamp with time zone NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"webhook_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_outcome_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"call_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"approved_by_user_id" uuid NOT NULL,
	"approved_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"call_id" uuid NOT NULL,
	"outcome" "telephony_call_outcome" NOT NULL,
	"note" text,
	"callback_follow_up_id" uuid,
	"recorded_by_user_id" uuid NOT NULL,
	"recorded_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "call_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"call_id" uuid NOT NULL,
	"role" "telephony_participant_role" NOT NULL,
	"contact_id" uuid,
	"membership_id" uuid,
	"user_id" uuid,
	"phone_e164" varchar(32),
	"display_name" varchar(160),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "call_participants_customer_contact_check" CHECK ("call_participants"."role" <> 'CUSTOMER' or "call_participants"."contact_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "call_recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"call_id" uuid NOT NULL,
	"provider_recording_id" varchar(256),
	"provider_recording_reference" varchar(500),
	"object_key" varchar(1024),
	"availability" "telephony_recording_availability" DEFAULT 'PENDING' NOT NULL,
	"consent_record_id" uuid,
	"retention_expires_at" timestamp with time zone,
	"recorded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "call_recordings_available_consent_check" CHECK ("call_recordings"."availability" <> 'AVAILABLE' or ("call_recordings"."consent_record_id" is not null and "call_recordings"."retention_expires_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"connection_id" uuid,
	"provider" varchar(64) NOT NULL,
	"provider_call_id" varchar(256),
	"origin" "telephony_call_origin" NOT NULL,
	"direction" "telephony_call_direction" NOT NULL,
	"status" "telephony_call_status" DEFAULT 'REQUESTED' NOT NULL,
	"outcome_requirement" "telephony_outcome_requirement" DEFAULT 'NOT_REQUIRED' NOT NULL,
	"initiated_by_user_id" uuid,
	"initiated_by_membership_id" uuid,
	"virtual_number" varchar(32),
	"started_at" timestamp with time zone,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calls_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "calls_duration_check" CHECK ("calls"."duration_seconds" is null or "calls"."duration_seconds" >= 0),
	CONSTRAINT "calls_completed_outcome_requirement_check" CHECK ("calls"."status" <> 'COMPLETED' or "calls"."outcome_requirement" in ('REQUIRED', 'RECORDED', 'EXCEPTION'))
);
--> statement-breakpoint
CREATE TABLE "telephony_provider_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"provider" varchar(64) NOT NULL,
	"connection_key" varchar(128) NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"status" "telephony_connection_status" DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"secret_reference" varchar(500),
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_health_at" timestamp with time zone,
	"last_health_status" varchar(32),
	"last_webhook_at" timestamp with time zone,
	"last_reconciled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_connections_client_id_unique" UNIQUE("client_organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "telephony_reconciliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"status" "telephony_reconciliation_status" DEFAULT 'RUNNING' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"cursor" varchar(512),
	"recovered_events" integer DEFAULT 0 NOT NULL,
	"processed_calls" integer DEFAULT 0 NOT NULL,
	"error_code" varchar(100),
	"error_message" text,
	"initiated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telephony_reconciliations_counts_check" CHECK ("telephony_reconciliations"."recovered_events" >= 0 and "telephony_reconciliations"."processed_calls" >= 0)
);
--> statement-breakpoint
ALTER TABLE "permissions" ALTER COLUMN "code" SET DATA TYPE varchar(100);--> statement-breakpoint
INSERT INTO "permissions" ("id", "code", "description") VALUES
  (gen_random_uuid(), 'telephony.calls.read', 'Read tenant- and assignment-scoped call history.'),
  (gen_random_uuid(), 'telephony.calls.start', 'Start an approved provider call or a tel: fallback for an allowed lead.'),
  (gen_random_uuid(), 'telephony.outcomes.manage', 'Record a call outcome and an optional callback follow-up.'),
  (gen_random_uuid(), 'telephony.outcomes.override', 'Approve a reasoned supervisor exception for a completed call without an outcome.'),
  (gen_random_uuid(), 'telephony.recordings.read', 'Request a private, consent- and retention-checked recording URL.'),
  (gen_random_uuid(), 'telephony.connections.manage', 'Configure the tenant development telephony connection.'),
  (gen_random_uuid(), 'telephony.reconciliation.manage', 'Run a tenant telephony reconciliation.'),
  (gen_random_uuid(), 'telephony.health.read', 'Read tenant telephony webhook and provider health.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions" ON "permissions"."code" IN (
  'telephony.calls.read', 'telephony.calls.start', 'telephony.outcomes.manage',
  'telephony.outcomes.override', 'telephony.recordings.read',
  'telephony.connections.manage', 'telephony.reconciliation.manage', 'telephony.health.read'
)
WHERE "roles"."code" IN ('AGENCY_ADMIN', 'CLIENT_ADMIN', 'MANAGER', 'SALES_MANAGER')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions" ON "permissions"."code" IN (
  'telephony.calls.read', 'telephony.calls.start', 'telephony.outcomes.manage',
  'telephony.recordings.read', 'telephony.health.read'
)
WHERE "roles"."code" = 'TEAM_MANAGER'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions" ON "permissions"."code" IN (
  'telephony.calls.read', 'telephony.calls.start', 'telephony.outcomes.manage'
)
WHERE "roles"."code" IN ('TELECALLER', 'SALESPERSON')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_client_id_unique" UNIQUE("client_organization_id","id");--> statement-breakpoint
ALTER TABLE "lead_follow_ups" ADD CONSTRAINT "lead_follow_ups_client_id_unique" UNIQUE("client_organization_id","id");--> statement-breakpoint
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_call_tenant_fk" FOREIGN KEY ("client_organization_id","call_id") REFERENCES "public"."calls"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_outcome_exceptions" ADD CONSTRAINT "call_outcome_exceptions_call_tenant_fk" FOREIGN KEY ("client_organization_id","call_id") REFERENCES "public"."calls"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_outcome_exceptions" ADD CONSTRAINT "call_outcome_exceptions_membership_tenant_fk" FOREIGN KEY ("client_organization_id","approved_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_outcome_exceptions" ADD CONSTRAINT "call_outcome_exceptions_user_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_outcomes" ADD CONSTRAINT "call_outcomes_call_tenant_fk" FOREIGN KEY ("client_organization_id","call_id") REFERENCES "public"."calls"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_outcomes" ADD CONSTRAINT "call_outcomes_follow_up_tenant_fk" FOREIGN KEY ("client_organization_id","callback_follow_up_id") REFERENCES "public"."lead_follow_ups"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_outcomes" ADD CONSTRAINT "call_outcomes_membership_tenant_fk" FOREIGN KEY ("client_organization_id","recorded_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_outcomes" ADD CONSTRAINT "call_outcomes_user_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_call_tenant_fk" FOREIGN KEY ("client_organization_id","call_id") REFERENCES "public"."calls"("client_organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_contact_tenant_fk" FOREIGN KEY ("client_organization_id","contact_id") REFERENCES "public"."contacts"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_membership_tenant_fk" FOREIGN KEY ("client_organization_id","membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_participants" ADD CONSTRAINT "call_participants_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_call_tenant_fk" FOREIGN KEY ("client_organization_id","call_id") REFERENCES "public"."calls"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_consent_tenant_fk" FOREIGN KEY ("client_organization_id","consent_record_id") REFERENCES "public"."consent_records"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_lead_tenant_fk" FOREIGN KEY ("client_organization_id","lead_id") REFERENCES "public"."lead_opportunities"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_contact_tenant_fk" FOREIGN KEY ("client_organization_id","contact_id") REFERENCES "public"."contacts"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_connection_tenant_fk" FOREIGN KEY ("client_organization_id","connection_id") REFERENCES "public"."telephony_provider_connections"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_initiator_membership_tenant_fk" FOREIGN KEY ("client_organization_id","initiated_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_initiator_user_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_provider_connections" ADD CONSTRAINT "telephony_connections_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_reconciliations" ADD CONSTRAINT "telephony_reconciliations_connection_tenant_fk" FOREIGN KEY ("client_organization_id","connection_id") REFERENCES "public"."telephony_provider_connections"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telephony_reconciliations" ADD CONSTRAINT "telephony_reconciliations_user_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "call_events_provider_event_uidx" ON "call_events" USING btree ("client_organization_id","provider","provider_event_id") WHERE "call_events"."provider_event_id" is not null;--> statement-breakpoint
CREATE INDEX "call_events_call_occurred_idx" ON "call_events" USING btree ("client_organization_id","call_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "call_outcome_exceptions_call_uidx" ON "call_outcome_exceptions" USING btree ("client_organization_id","call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "call_outcomes_call_uidx" ON "call_outcomes" USING btree ("client_organization_id","call_id");--> statement-breakpoint
CREATE INDEX "call_outcomes_client_created_idx" ON "call_outcomes" USING btree ("client_organization_id","created_at");--> statement-breakpoint
CREATE INDEX "call_participants_call_idx" ON "call_participants" USING btree ("client_organization_id","call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "call_recordings_provider_uidx" ON "call_recordings" USING btree ("client_organization_id","provider_recording_id") WHERE "call_recordings"."provider_recording_id" is not null;--> statement-breakpoint
CREATE INDEX "call_recordings_call_idx" ON "call_recordings" USING btree ("client_organization_id","call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calls_provider_call_uidx" ON "calls" USING btree ("client_organization_id","provider","provider_call_id") WHERE "calls"."provider_call_id" is not null;--> statement-breakpoint
CREATE INDEX "calls_lead_created_idx" ON "calls" USING btree ("client_organization_id","lead_id","created_at");--> statement-breakpoint
CREATE INDEX "calls_outcome_queue_idx" ON "calls" USING btree ("client_organization_id","outcome_requirement","ended_at");--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_connections_client_provider_uidx" ON "telephony_provider_connections" USING btree ("client_organization_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_connections_key_uidx" ON "telephony_provider_connections" USING btree ("connection_key");--> statement-breakpoint
CREATE INDEX "telephony_connections_client_status_idx" ON "telephony_provider_connections" USING btree ("client_organization_id","status");--> statement-breakpoint
CREATE INDEX "telephony_reconciliations_client_started_idx" ON "telephony_reconciliations" USING btree ("client_organization_id","started_at");
