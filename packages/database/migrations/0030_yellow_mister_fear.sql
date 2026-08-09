CREATE TYPE "public"."customer_activity_type" AS ENUM('FEEDBACK', 'COMPLAINT', 'ESCALATION', 'REMINDER');--> statement-breakpoint
CREATE TYPE "public"."reminder_base_date_field" AS ENUM('DELIVERY_DATE', 'PURCHASE_DATE', 'INSURANCE_EXPIRY', 'PUC_EXPIRY', 'WARRANTY_EXPIRY', 'AMC_EXPIRY', 'RSA_EXPIRY');--> statement-breakpoint
CREATE TYPE "public"."reminder_communication_category" AS ENUM('OPERATIONAL', 'MARKETING');--> statement-breakpoint
CREATE TYPE "public"."reminder_outbox_status" AS ENUM('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD_LETTER');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('SCHEDULED', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'CANCELLED', 'SUPPRESSED');--> statement-breakpoint
CREATE TYPE "public"."reminder_threshold_kind" AS ENUM('DATE', 'KILOMETRE');--> statement-breakpoint
CREATE TYPE "public"."reminder_type" AS ENUM('SERVICE_DUE', 'INSURANCE_EXPIRY', 'PUC_EXPIRY', 'WARRANTY_EXPIRY', 'AMC_EXPIRY', 'ROADSIDE_ASSISTANCE_EXPIRY', 'RC_PENDING', 'SERVICE_APPOINTMENT', 'EXCHANGE_ELIGIBILITY', 'UPGRADE_OPPORTUNITY');--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'reminders.read';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'reminders.rules.manage';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'reminders.generate';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'reminders.dispatch.manage';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'reminders.preferences.manage';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'customer_activities.create';--> statement-breakpoint
CREATE TABLE "customer_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"customer_vehicle_id" uuid,
	"activity_type" "customer_activity_type" NOT NULL,
	"subject" varchar(240) NOT NULL,
	"details" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_membership_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_reminder_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"customer_vehicle_id" uuid NOT NULL,
	"rule_template_id" uuid NOT NULL,
	"due_at" timestamp with time zone,
	"due_kilometres" integer,
	"source_vehicle_version" integer NOT NULL,
	"rule_version" integer NOT NULL,
	"schedule_version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_plans_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "reminder_plans_schedule_version_check" CHECK ("customer_reminder_plans"."schedule_version" >= 1),
	CONSTRAINT "reminder_plans_due_check" CHECK (("customer_reminder_plans"."due_at" is not null and "customer_reminder_plans"."due_kilometres" is null) or ("customer_reminder_plans"."due_at" is null and "customer_reminder_plans"."due_kilometres" is not null))
);
--> statement-breakpoint
CREATE TABLE "customer_reminder_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"customer_vehicle_id" uuid NOT NULL,
	"operational_enabled" boolean DEFAULT true NOT NULL,
	"marketing_enabled" boolean DEFAULT false NOT NULL,
	"preferred_channel" varchar(16) DEFAULT 'WHATSAPP' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by_membership_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_preferences_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "reminder_preferences_version_check" CHECK ("customer_reminder_preferences"."version" >= 1),
	CONSTRAINT "reminder_preferences_channel_check" CHECK ("customer_reminder_preferences"."preferred_channel" in ('WHATSAPP','EMAIL','SMS'))
);
--> statement-breakpoint
CREATE TABLE "reminder_command_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"command_type" varchar(100) NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"type" "reminder_type" NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"default_category" "reminder_communication_category" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_definitions_client_id_unique" UNIQUE("client_organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "reminder_dispatch_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"reminder_instance_id" uuid NOT NULL,
	"status" "reminder_outbox_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" varchar(128),
	"provider_message_id" varchar(256),
	"last_error_code" varchar(100),
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_outbox_attempts_check" CHECK ("reminder_dispatch_outbox"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reminder_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"reminder_instance_id" uuid NOT NULL,
	"from_status" "reminder_status",
	"to_status" "reminder_status" NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"reason" text,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_membership_id" uuid,
	"correlation_id" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"customer_reminder_plan_id" uuid NOT NULL,
	"materialization_key" varchar(200) NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" "reminder_status" DEFAULT 'SCHEDULED' NOT NULL,
	"category" "reminder_communication_category" NOT NULL,
	"channel" varchar(16) NOT NULL,
	"template_id" uuid NOT NULL,
	"consent_reference_id" uuid,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"suppression_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_instances_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "reminder_instances_retry_check" CHECK ("reminder_instances"."retry_count" >= 0),
	CONSTRAINT "reminder_instances_version_check" CHECK ("reminder_instances"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "reminder_rule_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"reminder_definition_id" uuid NOT NULL,
	"brand_name" varchar(120),
	"model_name" varchar(120),
	"variant_name" varchar(160),
	"model_year" integer,
	"threshold_kind" "reminder_threshold_kind" NOT NULL,
	"base_date_field" "reminder_base_date_field",
	"due_after_days" integer,
	"due_kilometres" integer,
	"notice_days" jsonb DEFAULT '[30,15,7,1]'::jsonb NOT NULL,
	"category" "reminder_communication_category" NOT NULL,
	"channel" varchar(16) NOT NULL,
	"template_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_rules_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "reminder_rules_version_check" CHECK ("reminder_rule_templates"."version" >= 1),
	CONSTRAINT "reminder_rules_channel_check" CHECK ("reminder_rule_templates"."channel" in ('WHATSAPP','EMAIL','SMS')),
	CONSTRAINT "reminder_rules_threshold_check" CHECK (("reminder_rule_templates"."threshold_kind" = 'DATE' and "reminder_rule_templates"."base_date_field" is not null and "reminder_rule_templates"."due_after_days" is not null and "reminder_rule_templates"."due_kilometres" is null) or ("reminder_rule_templates"."threshold_kind" = 'KILOMETRE' and "reminder_rule_templates"."base_date_field" is null and "reminder_rule_templates"."due_after_days" is null and "reminder_rule_templates"."due_kilometres" is not null))
);
--> statement-breakpoint
ALTER TABLE "customer_vehicles" ADD COLUMN "model_year" integer;--> statement-breakpoint
ALTER TABLE "customer_vehicles" ADD COLUMN "puc_expires_on" date;--> statement-breakpoint
ALTER TABLE "customer_vehicles" ADD COLUMN "current_odometer_km" integer;--> statement-breakpoint
ALTER TABLE "customer_vehicles" ADD COLUMN "service_plan_version" varchar(64);--> statement-breakpoint
ALTER TABLE "customer_vehicles" ADD COLUMN "service_due_on" date;--> statement-breakpoint
ALTER TABLE "customer_vehicles" ADD COLUMN "service_due_kilometres" integer;--> statement-breakpoint
ALTER TABLE "customer_activities" ADD CONSTRAINT "customer_activities_contact_tenant_fk" FOREIGN KEY ("client_organization_id","contact_id") REFERENCES "public"."contacts"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_activities" ADD CONSTRAINT "customer_activities_vehicle_tenant_fk" FOREIGN KEY ("client_organization_id","customer_vehicle_id") REFERENCES "public"."customer_vehicles"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_activities" ADD CONSTRAINT "customer_activities_actor_tenant_fk" FOREIGN KEY ("client_organization_id","actor_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_reminder_plans" ADD CONSTRAINT "reminder_plans_vehicle_tenant_fk" FOREIGN KEY ("client_organization_id","customer_vehicle_id") REFERENCES "public"."customer_vehicles"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_reminder_plans" ADD CONSTRAINT "reminder_plans_rule_tenant_fk" FOREIGN KEY ("client_organization_id","rule_template_id") REFERENCES "public"."reminder_rule_templates"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_reminder_preferences" ADD CONSTRAINT "reminder_preferences_vehicle_tenant_fk" FOREIGN KEY ("client_organization_id","customer_vehicle_id") REFERENCES "public"."customer_vehicles"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_reminder_preferences" ADD CONSTRAINT "reminder_preferences_actor_tenant_fk" FOREIGN KEY ("client_organization_id","updated_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_command_receipts" ADD CONSTRAINT "reminder_command_receipts_client_organization_id_client_organizations_id_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_definitions" ADD CONSTRAINT "reminder_definitions_client_organization_id_client_organizations_id_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_dispatch_outbox" ADD CONSTRAINT "reminder_outbox_instance_tenant_fk" FOREIGN KEY ("client_organization_id","reminder_instance_id") REFERENCES "public"."reminder_instances"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_instance_tenant_fk" FOREIGN KEY ("client_organization_id","reminder_instance_id") REFERENCES "public"."reminder_instances"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_actor_tenant_fk" FOREIGN KEY ("client_organization_id","actor_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_instances" ADD CONSTRAINT "reminder_instances_plan_tenant_fk" FOREIGN KEY ("client_organization_id","customer_reminder_plan_id") REFERENCES "public"."customer_reminder_plans"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_instances" ADD CONSTRAINT "reminder_instances_template_tenant_fk" FOREIGN KEY ("client_organization_id","template_id") REFERENCES "public"."message_templates"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_rule_templates" ADD CONSTRAINT "reminder_rules_definition_tenant_fk" FOREIGN KEY ("client_organization_id","reminder_definition_id") REFERENCES "public"."reminder_definitions"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_rule_templates" ADD CONSTRAINT "reminder_rules_template_tenant_fk" FOREIGN KEY ("client_organization_id","template_id") REFERENCES "public"."message_templates"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_rule_templates" ADD CONSTRAINT "reminder_rules_actor_tenant_fk" FOREIGN KEY ("client_organization_id","created_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_activities_timeline_idx" ON "customer_activities" USING btree ("client_organization_id","contact_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_plans_vehicle_rule_uidx" ON "customer_reminder_plans" USING btree ("client_organization_id","customer_vehicle_id","rule_template_id");--> statement-breakpoint
CREATE INDEX "reminder_plans_due_idx" ON "customer_reminder_plans" USING btree ("client_organization_id","active","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_preferences_vehicle_uidx" ON "customer_reminder_preferences" USING btree ("client_organization_id","customer_vehicle_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_command_receipts_key_uidx" ON "reminder_command_receipts" USING btree ("client_organization_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_definitions_type_uidx" ON "reminder_definitions" USING btree ("client_organization_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_outbox_instance_uidx" ON "reminder_dispatch_outbox" USING btree ("client_organization_id","reminder_instance_id");--> statement-breakpoint
CREATE INDEX "reminder_outbox_pending_idx" ON "reminder_dispatch_outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "reminder_events_timeline_idx" ON "reminder_events" USING btree ("client_organization_id","reminder_instance_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_instances_materialization_uidx" ON "reminder_instances" USING btree ("client_organization_id","materialization_key");--> statement-breakpoint
CREATE INDEX "reminder_instances_queue_idx" ON "reminder_instances" USING btree ("client_organization_id","status","scheduled_for");--> statement-breakpoint
CREATE INDEX "reminder_rules_match_idx" ON "reminder_rule_templates" USING btree ("client_organization_id","active","brand_name","model_name","variant_name","model_year");--> statement-breakpoint
ALTER TABLE "customer_vehicles" ADD CONSTRAINT "customer_vehicles_odometer_check" CHECK ("customer_vehicles"."current_odometer_km" is null or "customer_vehicles"."current_odometer_km" >= 0);
--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
  ('reminders.read', 'Read scoped customer reminder plans, queues and history.'),
  ('reminders.rules.manage', 'Manage fixed reminder rule templates.'),
  ('reminders.generate', 'Generate and safely refresh reminder plans.'),
  ('reminders.dispatch.manage', 'Manage reminder dispatch, reschedule and retry.'),
  ('reminders.preferences.manage', 'Capture customer reminder preferences.'),
  ('customer_activities.create', 'Append customer feedback, complaints and escalations.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."code" IN ('AGENCY_ADMIN', 'CLIENT_ADMIN', 'MANAGER', 'SALES_MANAGER', 'TEAM_MANAGER')
  AND (p."code" LIKE 'reminders.%' OR p."code" = 'customer_activities.create')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."code" IN ('SALESPERSON', 'RC_REGISTRATION_EXECUTIVE')
  AND p."code" IN ('reminders.read', 'reminders.generate', 'reminders.dispatch.manage', 'reminders.preferences.manage', 'customer_activities.create')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "reminder_definitions" ("client_organization_id", "type", "display_name", "default_category")
SELECT c."id", valueset."type"::reminder_type, valueset."display_name",
  valueset."category"::reminder_communication_category
FROM "client_organizations" c
CROSS JOIN (VALUES
  ('SERVICE_DUE', 'Service due', 'OPERATIONAL'),
  ('INSURANCE_EXPIRY', 'Insurance expiry', 'OPERATIONAL'),
  ('PUC_EXPIRY', 'PUC expiry', 'OPERATIONAL'),
  ('WARRANTY_EXPIRY', 'Warranty expiry', 'OPERATIONAL'),
  ('AMC_EXPIRY', 'AMC expiry', 'OPERATIONAL'),
  ('ROADSIDE_ASSISTANCE_EXPIRY', 'Roadside assistance expiry', 'OPERATIONAL'),
  ('RC_PENDING', 'RC pending', 'OPERATIONAL'),
  ('SERVICE_APPOINTMENT', 'Service appointment', 'OPERATIONAL'),
  ('EXCHANGE_ELIGIBILITY', 'Exchange eligibility', 'MARKETING'),
  ('UPGRADE_OPPORTUNITY', 'Upgrade opportunity', 'MARKETING')
) AS valueset("type", "display_name", "category")
ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_reminder_history_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'reminder and customer activity history is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER reminder_events_immutable
BEFORE UPDATE OR DELETE ON "reminder_events"
FOR EACH ROW EXECUTE FUNCTION prevent_reminder_history_mutation();
--> statement-breakpoint
CREATE TRIGGER customer_activities_immutable
BEFORE UPDATE OR DELETE ON "customer_activities"
FOR EACH ROW EXECUTE FUNCTION prevent_reminder_history_mutation();
