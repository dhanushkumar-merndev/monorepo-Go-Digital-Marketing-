CREATE TYPE "public"."rc_delivery_mode" AS ENUM('WHATSAPP', 'EMAIL', 'SMS', 'COURIER', 'PICKUP');--> statement-breakpoint
CREATE TYPE "public"."rc_document_status" AS ENUM('PENDING_UPLOAD', 'PENDING_SCAN', 'VERIFIED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('DOCUMENTS_READY', 'REGISTRATION_STARTED', 'RTO_SUBMITTED', 'NUMBER_ALLOTTED', 'RC_PENDING', 'RC_RECEIVED', 'RC_SHARED_COLLECTED', 'CASE_CLOSED', 'REOPENED');--> statement-breakpoint
CREATE TYPE "public"."vehicle_ownership_source" AS ENUM('DEALERSHIP_SALE', 'EXTERNAL');--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'registration.cases.read';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'registration.cases.manage';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'registration.cases.assign';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'registration.cases.execute';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'registration.cases.close';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'registration.cases.reopen';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'registration.documents.upload';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'registration.documents.review';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'registration.documents.share';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'registration.aging.read';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'registration.settings.manage';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'customer_vehicles.read';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'customer_vehicles.manage';--> statement-breakpoint
CREATE TABLE "customer_vehicle_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"customer_vehicle_id" uuid NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"reason" text,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"correlation_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"ownership_source" "vehicle_ownership_source" NOT NULL,
	"booking_id" uuid,
	"delivery_job_id" uuid,
	"registration_case_id" uuid,
	"inventory_unit_id" uuid,
	"brand_name" varchar(120) NOT NULL,
	"model_name" varchar(120) NOT NULL,
	"variant_name" varchar(160) NOT NULL,
	"vin" varchar(80),
	"engine_number" varchar(80),
	"registration_number" varchar(32),
	"purchase_date" date,
	"invoice_date" date,
	"delivery_date" date,
	"insurance_policy_number" varchar(100),
	"insurance_expires_on" date,
	"warranty_expires_on" date,
	"amc_expires_on" date,
	"rsa_expires_on" date,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_vehicles_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "customer_vehicles_version_check" CHECK ("customer_vehicles"."version" >= 1),
	CONSTRAINT "customer_vehicles_source_check" CHECK (("customer_vehicles"."ownership_source" = 'DEALERSHIP_SALE' and "customer_vehicles"."booking_id" is not null and "customer_vehicles"."delivery_job_id" is not null and "customer_vehicles"."inventory_unit_id" is not null) or ("customer_vehicles"."ownership_source" = 'EXTERNAL' and "customer_vehicles"."booking_id" is null and "customer_vehicles"."delivery_job_id" is null and "customer_vehicles"."registration_case_id" is null and "customer_vehicles"."inventory_unit_id" is null)),
	CONSTRAINT "customer_vehicles_identity_check" CHECK ("customer_vehicles"."vin" is not null or "customer_vehicles"."registration_number" is not null)
);
--> statement-breakpoint
CREATE TABLE "rc_delivery_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"registration_case_id" uuid NOT NULL,
	"rc_document_id" uuid NOT NULL,
	"delivery_mode" "rc_delivery_mode" NOT NULL,
	"recipient" varchar(240) NOT NULL,
	"purpose" text NOT NULL,
	"delivered_by_membership_id" uuid NOT NULL,
	"delivered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"link_expires_at" timestamp with time zone,
	"correlation_id" varchar(128) NOT NULL,
	CONSTRAINT "rc_delivery_client_id_unique" UNIQUE("client_organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "rc_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"registration_case_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" varchar(240) NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"content_length" integer NOT NULL,
	"checksum_sha256" varchar(44) NOT NULL,
	"scanner_status" varchar(32),
	"status" "rc_document_status" DEFAULT 'PENDING_UPLOAD' NOT NULL,
	"uploaded_by_membership_id" uuid NOT NULL,
	"uploaded_at" timestamp with time zone,
	"reviewed_by_membership_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rc_documents_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "rc_documents_size_check" CHECK ("rc_documents"."content_length" > 0 and "rc_documents"."content_length" <= 20971520)
);
--> statement-breakpoint
CREATE TABLE "registration_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"inventory_unit_id" uuid NOT NULL,
	"assigned_membership_id" uuid,
	"assigned_user_id" uuid,
	"status" "registration_status" DEFAULT 'DOCUMENTS_READY' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"application_started_at" timestamp with time zone,
	"rto_name" varchar(160),
	"rto_code" varchar(32),
	"application_number" varchar(100),
	"rto_submitted_at" timestamp with time zone,
	"expected_completion_at" timestamp with time zone,
	"temporary_registration_number" varchar(32),
	"permanent_registration_number" varchar(32),
	"number_allotted_at" timestamp with time zone,
	"pending_reason" text,
	"rc_received_at" timestamp with time zone,
	"shared_or_collected_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"reopened_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registration_cases_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "registration_cases_version_check" CHECK ("registration_cases"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "registration_command_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"command_type" varchar(100) NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"response_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registration_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"registration_case_id" uuid NOT NULL,
	"from_status" "registration_status",
	"to_status" "registration_status" NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"reason" text,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"corrects_event_id" uuid,
	"actor_membership_id" uuid NOT NULL,
	"correlation_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registration_events_client_id_unique" UNIQUE("client_organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "registration_settings" (
	"client_organization_id" uuid PRIMARY KEY NOT NULL,
	"sla_hours" jsonb DEFAULT '{"DOCUMENTS_READY":48,"REGISTRATION_STARTED":48,"RTO_SUBMITTED":168,"NUMBER_ALLOTTED":168,"RC_PENDING":720,"RC_RECEIVED":48,"RC_SHARED_COLLECTED":48,"REOPENED":48}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_membership_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registration_settings_version_check" CHECK ("registration_settings"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "customer_vehicle_events" ADD CONSTRAINT "customer_vehicle_events_vehicle_tenant_fk" FOREIGN KEY ("client_organization_id","customer_vehicle_id") REFERENCES "public"."customer_vehicles"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_vehicle_events" ADD CONSTRAINT "customer_vehicle_events_actor_tenant_fk" FOREIGN KEY ("client_organization_id","actor_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_vehicles" ADD CONSTRAINT "customer_vehicles_branch_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id") REFERENCES "public"."branches"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_vehicles" ADD CONSTRAINT "customer_vehicles_contact_tenant_fk" FOREIGN KEY ("client_organization_id","contact_id") REFERENCES "public"."contacts"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_vehicles" ADD CONSTRAINT "customer_vehicles_booking_tenant_fk" FOREIGN KEY ("client_organization_id","booking_id") REFERENCES "public"."bookings"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_vehicles" ADD CONSTRAINT "customer_vehicles_delivery_tenant_fk" FOREIGN KEY ("client_organization_id","delivery_job_id") REFERENCES "public"."delivery_jobs"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_vehicles" ADD CONSTRAINT "customer_vehicles_registration_tenant_fk" FOREIGN KEY ("client_organization_id","registration_case_id") REFERENCES "public"."registration_cases"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_vehicles" ADD CONSTRAINT "customer_vehicles_inventory_tenant_fk" FOREIGN KEY ("client_organization_id","inventory_unit_id") REFERENCES "public"."inventory_units"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_vehicles" ADD CONSTRAINT "customer_vehicles_creator_tenant_fk" FOREIGN KEY ("client_organization_id","created_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rc_delivery_records" ADD CONSTRAINT "rc_delivery_case_tenant_fk" FOREIGN KEY ("client_organization_id","registration_case_id") REFERENCES "public"."registration_cases"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rc_delivery_records" ADD CONSTRAINT "rc_delivery_document_tenant_fk" FOREIGN KEY ("client_organization_id","rc_document_id") REFERENCES "public"."rc_documents"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rc_delivery_records" ADD CONSTRAINT "rc_delivery_actor_tenant_fk" FOREIGN KEY ("client_organization_id","delivered_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rc_documents" ADD CONSTRAINT "rc_documents_case_tenant_fk" FOREIGN KEY ("client_organization_id","registration_case_id") REFERENCES "public"."registration_cases"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rc_documents" ADD CONSTRAINT "rc_documents_uploader_tenant_fk" FOREIGN KEY ("client_organization_id","uploaded_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rc_documents" ADD CONSTRAINT "rc_documents_reviewer_tenant_fk" FOREIGN KEY ("client_organization_id","reviewed_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_cases" ADD CONSTRAINT "registration_cases_branch_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id") REFERENCES "public"."branches"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_cases" ADD CONSTRAINT "registration_cases_booking_tenant_fk" FOREIGN KEY ("client_organization_id","booking_id") REFERENCES "public"."bookings"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_cases" ADD CONSTRAINT "registration_cases_contact_tenant_fk" FOREIGN KEY ("client_organization_id","contact_id") REFERENCES "public"."contacts"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_cases" ADD CONSTRAINT "registration_cases_inventory_tenant_fk" FOREIGN KEY ("client_organization_id","inventory_unit_id") REFERENCES "public"."inventory_units"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_cases" ADD CONSTRAINT "registration_cases_assignee_tenant_fk" FOREIGN KEY ("client_organization_id","assigned_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_cases" ADD CONSTRAINT "registration_cases_assignee_user_fk" FOREIGN KEY ("assigned_user_id","assigned_membership_id") REFERENCES "public"."memberships"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_cases" ADD CONSTRAINT "registration_cases_creator_tenant_fk" FOREIGN KEY ("client_organization_id","created_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_command_receipts" ADD CONSTRAINT "registration_command_receipts_client_organization_id_client_organizations_id_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_command_receipts" ADD CONSTRAINT "registration_receipts_actor_tenant_fk" FOREIGN KEY ("client_organization_id","actor_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_events" ADD CONSTRAINT "registration_events_case_tenant_fk" FOREIGN KEY ("client_organization_id","registration_case_id") REFERENCES "public"."registration_cases"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_events" ADD CONSTRAINT "registration_events_actor_tenant_fk" FOREIGN KEY ("client_organization_id","actor_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_settings" ADD CONSTRAINT "registration_settings_client_organization_id_client_organizations_id_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_settings" ADD CONSTRAINT "registration_settings_actor_tenant_fk" FOREIGN KEY ("client_organization_id","updated_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_vehicle_events_timeline_idx" ON "customer_vehicle_events" USING btree ("client_organization_id","customer_vehicle_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_vehicles_booking_uidx" ON "customer_vehicles" USING btree ("client_organization_id","booking_id") WHERE "customer_vehicles"."booking_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_vehicles_vin_uidx" ON "customer_vehicles" USING btree ("client_organization_id",upper("vin")) WHERE "customer_vehicles"."vin" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_vehicles_registration_uidx" ON "customer_vehicles" USING btree ("client_organization_id",upper("registration_number")) WHERE "customer_vehicles"."registration_number" is not null;--> statement-breakpoint
CREATE INDEX "customer_vehicles_contact_idx" ON "customer_vehicles" USING btree ("client_organization_id","contact_id","created_at");--> statement-breakpoint
CREATE INDEX "rc_delivery_case_timeline_idx" ON "rc_delivery_records" USING btree ("client_organization_id","registration_case_id","delivered_at");--> statement-breakpoint
CREATE INDEX "rc_documents_case_idx" ON "rc_documents" USING btree ("client_organization_id","registration_case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "registration_cases_booking_uidx" ON "registration_cases" USING btree ("client_organization_id","booking_id");--> statement-breakpoint
CREATE INDEX "registration_cases_queue_idx" ON "registration_cases" USING btree ("client_organization_id","branch_id","status","status_changed_at");--> statement-breakpoint
CREATE INDEX "registration_cases_assignee_idx" ON "registration_cases" USING btree ("client_organization_id","assigned_membership_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "registration_receipts_key_uidx" ON "registration_command_receipts" USING btree ("client_organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "registration_events_timeline_idx" ON "registration_events" USING btree ("client_organization_id","registration_case_id","created_at","id");
--> statement-breakpoint
ALTER TABLE "registration_events" ADD CONSTRAINT "registration_events_correction_tenant_fk" FOREIGN KEY ("client_organization_id","corrects_event_id") REFERENCES "public"."registration_events"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
  ('registration.cases.read', 'Read scoped registration and RC cases.'),
  ('registration.cases.manage', 'Create registration cases and append corrections.'),
  ('registration.cases.assign', 'Assign eligible RC Registration Executives.'),
  ('registration.cases.execute', 'Advance assigned registration and RC workflows.'),
  ('registration.cases.close', 'Close complete registration cases.'),
  ('registration.cases.reopen', 'Reopen closed registration cases with evidence.'),
  ('registration.documents.upload', 'Upload private RC documents.'),
  ('registration.documents.review', 'Review and access private RC documents.'),
  ('registration.documents.share', 'Create audited RC delivery records and signed links.'),
  ('registration.aging.read', 'Read registration aging and overdue queues.'),
  ('registration.settings.manage', 'Manage tenant registration SLA settings.'),
  ('customer_vehicles.read', 'Read scoped canonical customer vehicles.'),
  ('customer_vehicles.manage', 'Create customer vehicles and manage coverage details.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" IN ('AGENCY_ADMIN', 'CLIENT_ADMIN', 'MANAGER', 'SALES_MANAGER', 'TEAM_MANAGER')
  AND (p."code" LIKE 'registration.%' OR p."code" LIKE 'customer_vehicles.%')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'RC_REGISTRATION_EXECUTIVE'
  AND p."code" IN (
    'registration.cases.read', 'registration.cases.execute',
    'registration.cases.close',
    'registration.documents.upload', 'registration.documents.review',
    'registration.documents.share', 'registration.aging.read',
    'customer_vehicles.read', 'customer_vehicles.manage'
  )
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'BILLING_DOCUMENTATION_EXECUTIVE'
  AND p."code" IN ('registration.cases.read', 'registration.aging.read', 'customer_vehicles.read')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'INVENTORY_EXECUTIVE'
  AND p."code" IN ('registration.cases.read', 'registration.aging.read', 'customer_vehicles.read')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_registration_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'registration history is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER registration_events_immutable
BEFORE UPDATE OR DELETE ON "registration_events"
FOR EACH ROW EXECUTE FUNCTION prevent_registration_history_mutation();
--> statement-breakpoint
CREATE TRIGGER rc_delivery_records_immutable
BEFORE UPDATE OR DELETE ON "rc_delivery_records"
FOR EACH ROW EXECUTE FUNCTION prevent_registration_history_mutation();
--> statement-breakpoint
CREATE TRIGGER customer_vehicle_events_immutable
BEFORE UPDATE OR DELETE ON "customer_vehicle_events"
FOR EACH ROW EXECUTE FUNCTION prevent_registration_history_mutation();
