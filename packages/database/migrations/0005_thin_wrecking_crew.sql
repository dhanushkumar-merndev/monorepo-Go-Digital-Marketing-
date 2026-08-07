CREATE TYPE "public"."lead_assignment_method" AS ENUM('MANUAL', 'ROUND_ROBIN');--> statement-breakpoint
CREATE TYPE "public"."duplicate_candidate_status" AS ENUM('PENDING', 'LINKED', 'KEPT_SEPARATE', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."follow_up_status" AS ENUM('OPEN', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."lead_entry_method" AS ENUM('MANUAL', 'PUBLIC_FORM', 'PROVIDER', 'IMPORT');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('META', 'WHATSAPP_AD', 'GOOGLE_ADS', 'WEBSITE', 'WALK_IN', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('NEW', 'PENDING_REVIEW', 'CONTACT_ATTEMPT', 'ACCEPTED', 'REJECTED', 'CONTACTED', 'INTERESTED', 'FOLLOW_UP', 'SHOWROOM_VISIT', 'TEST_RIDE_REQUESTED', 'TEST_RIDE_BOOKED', 'TEST_RIDE_COMPLETED', 'NEGOTIATION', 'BOOKING_CONFIRMED', 'LOST', 'REOPENED');--> statement-breakpoint
CREATE TYPE "public"."lead_lost_reason" AS ENUM('PRICE', 'FINANCE_REJECTED', 'MODEL_UNAVAILABLE', 'COMPETITOR_PURCHASE', 'POSTPONED', 'NO_RESPONSE', 'FAMILY_DECISION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."lead_queue_strategy" AS ENUM('ROUND_ROBIN', 'MANUAL');--> statement-breakpoint
CREATE TYPE "public"."lead_rejection_reason" AS ENUM('INVALID_NUMBER', 'DUPLICATE', 'NOT_INTERESTED_FIRST_CONTACT', 'OUTSIDE_SERVICE_AREA', 'WRONG_ENQUIRY', 'ALREADY_PURCHASED', 'SPAM');--> statement-breakpoint
CREATE TYPE "public"."lead_sla_state" AS ENUM('OPEN', 'MET', 'WARNING', 'BREACHED');--> statement-breakpoint
CREATE TYPE "public"."lead_task_status" AS ENUM('OPEN', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "lead_assignment_queue_members" (
	"client_organization_id" uuid NOT NULL,
	"queue_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"last_assigned_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_assignment_queue_members_pk" PRIMARY KEY("queue_id","membership_id")
);
--> statement-breakpoint
CREATE TABLE "lead_assignment_queues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"team_id" uuid,
	"code" varchar(64) NOT NULL,
	"name" varchar(160) NOT NULL,
	"strategy" "lead_queue_strategy" DEFAULT 'ROUND_ROBIN' NOT NULL,
	"source_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"language_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"max_active_leads_per_user" integer DEFAULT 50 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_assignment_queues_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "lead_assignment_queues_capacity_check" CHECK ("lead_assignment_queues"."max_active_leads_per_user" >= 1),
	CONSTRAINT "lead_assignment_queues_version_check" CHECK ("lead_assignment_queues"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "lead_campaign_attributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"campaign_id" varchar(256),
	"campaign_name" varchar(256),
	"ad_id" varchar(256),
	"ad_set_id" varchar(256),
	"form_id" varchar(256),
	"gclid" varchar(256),
	"utm_source" varchar(256),
	"utm_medium" varchar(256),
	"utm_campaign" varchar(256),
	"utm_term" varchar(256),
	"utm_content" varchar(256),
	"page_url" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_campaign_attributions_client_id_unique" UNIQUE("client_organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"purpose" varchar(64) NOT NULL,
	"status" varchar(32) NOT NULL,
	"notice_version" varchar(64) NOT NULL,
	"source" varchar(64) NOT NULL,
	"evidence" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contact_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel_type" varchar(32) NOT NULL,
	"value_normalized" varchar(320) NOT NULL,
	"lookup_hash" varchar(64),
	"is_primary" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"primary_phone_e164" varchar(20) NOT NULL,
	"primary_phone_lookup_hash" varchar(64) NOT NULL,
	"alternate_phone_e164" varchar(20),
	"alternate_phone_lookup_hash" varchar(64),
	"primary_email_normalized" varchar(320),
	"canonical_contact_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "contacts_version_check" CHECK ("contacts"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "lead_duplicate_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"candidate_contact_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"match_type" varchar(32) NOT NULL,
	"score" integer NOT NULL,
	"status" "duplicate_candidate_status" DEFAULT 'PENDING' NOT NULL,
	"resolved_by" uuid,
	"resolution_reason" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"from_membership_id" uuid,
	"to_membership_id" uuid NOT NULL,
	"method" "lead_assignment_method" NOT NULL,
	"reason" text NOT NULL,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"owner_membership_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"channel" varchar(32) NOT NULL,
	"priority" varchar(16) NOT NULL,
	"purpose" varchar(500) NOT NULL,
	"note" text,
	"outcome" varchar(500),
	"status" "follow_up_status" DEFAULT 'OPEN' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_ingestion_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"provider" varchar(64) NOT NULL,
	"external_event_id" varchar(256) NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"lead_id" uuid,
	"response_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"assignment_queue_id" uuid,
	"campaign_attribution_id" uuid,
	"source" "lead_source" NOT NULL,
	"source_name" varchar(160),
	"entry_method" "lead_entry_method" NOT NULL,
	"external_provider" varchar(64),
	"external_lead_id" varchar(256),
	"vehicle_interest" varchar(240) NOT NULL,
	"language" varchar(32),
	"status" "lead_status" DEFAULT 'NEW' NOT NULL,
	"rejection_reason" "lead_rejection_reason",
	"lost_reason" "lead_lost_reason",
	"relationship_owner_id" uuid,
	"relationship_owner_membership_id" uuid,
	"current_process_owner_id" uuid,
	"current_process_owner_membership_id" uuid,
	"conversation_owner_id" uuid,
	"conversation_owner_membership_id" uuid,
	"next_action_at" timestamp with time zone,
	"first_action_at" timestamp with time zone,
	"sla_due_at" timestamp with time zone NOT NULL,
	"sla_warning_at" timestamp with time zone NOT NULL,
	"sla_state" "lead_sla_state" DEFAULT 'OPEN' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_opportunities_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "lead_opportunities_version_check" CHECK ("lead_opportunities"."version" >= 1),
	CONSTRAINT "lead_opportunities_other_source_check" CHECK ("lead_opportunities"."source" <> 'OTHER' or "lead_opportunities"."source_name" is not null)
);
--> statement-breakpoint
CREATE TABLE "lead_outcome_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"event_type" varchar(32) NOT NULL,
	"rejection_reason" "lead_rejection_reason",
	"lost_reason" "lead_lost_reason",
	"reason" text NOT NULL,
	"canonical_contact_id" uuid,
	"canonical_lead_id" uuid,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_settings" (
	"client_organization_id" uuid PRIMARY KEY NOT NULL,
	"first_action_sla_minutes" integer DEFAULT 15 NOT NULL,
	"warning_before_minutes" integer DEFAULT 5 NOT NULL,
	"outside_hours_policy" varchar(32) DEFAULT 'NEXT_BUSINESS_HOUR' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_settings_sla_check" CHECK ("lead_settings"."first_action_sla_minutes" between 1 and 1440),
	CONSTRAINT "lead_settings_warning_check" CHECK ("lead_settings"."warning_before_minutes" >= 0 and "lead_settings"."warning_before_minutes" < "lead_settings"."first_action_sla_minutes"),
	CONSTRAINT "lead_settings_version_check" CHECK ("lead_settings"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "lead_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"from_status" "lead_status",
	"to_status" "lead_status" NOT NULL,
	"actor_id" uuid,
	"reason" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"owner_membership_id" uuid NOT NULL,
	"title" varchar(240) NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"priority" varchar(16) NOT NULL,
	"status" "lead_task_status" DEFAULT 'OPEN' NOT NULL,
	"created_by" uuid NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "public_lead_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"client_form_key" varchar(128) NOT NULL,
	"branch_id" uuid NOT NULL,
	"assignment_queue_id" uuid,
	"name" varchar(160) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"bot_protection_enabled" boolean DEFAULT false NOT NULL,
	"rate_limit_per_minute" integer DEFAULT 30 NOT NULL,
	"consent_notice_version" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "public_lead_forms_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "public_lead_forms_rate_limit_check" CHECK ("public_lead_forms"."rate_limit_per_minute" between 1 and 600)
);
--> statement-breakpoint
CREATE TABLE "lead_sla_escalations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"timer_id" uuid NOT NULL,
	"level" integer NOT NULL,
	"state" varchar(32) DEFAULT 'OPEN' NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "lead_sla_timers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"warning_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"state" "lead_sla_state" DEFAULT 'OPEN' NOT NULL,
	"satisfied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_assignment_queue_members" ADD CONSTRAINT "lead_assignment_queue_members_queue_tenant_fk" FOREIGN KEY ("client_organization_id","queue_id") REFERENCES "public"."lead_assignment_queues"("client_organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignment_queue_members" ADD CONSTRAINT "lead_assignment_queue_members_membership_tenant_fk" FOREIGN KEY ("client_organization_id","membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignment_queues" ADD CONSTRAINT "lead_assignment_queues_branch_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id") REFERENCES "public"."branches"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignment_queues" ADD CONSTRAINT "lead_assignment_queues_team_tenant_fk" FOREIGN KEY ("client_organization_id","team_id") REFERENCES "public"."teams"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_campaign_attributions" ADD CONSTRAINT "lead_campaign_attributions_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_contact_tenant_fk" FOREIGN KEY ("client_organization_id","contact_id") REFERENCES "public"."contacts"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_channels" ADD CONSTRAINT "contact_channels_contact_tenant_fk" FOREIGN KEY ("client_organization_id","contact_id") REFERENCES "public"."contacts"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_canonical_tenant_fk" FOREIGN KEY ("client_organization_id","canonical_contact_id") REFERENCES "public"."contacts"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_duplicate_candidates" ADD CONSTRAINT "lead_duplicate_candidates_contact_tenant_fk" FOREIGN KEY ("client_organization_id","contact_id") REFERENCES "public"."contacts"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_duplicate_candidates" ADD CONSTRAINT "lead_duplicate_candidates_candidate_tenant_fk" FOREIGN KEY ("client_organization_id","candidate_contact_id") REFERENCES "public"."contacts"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_duplicate_candidates" ADD CONSTRAINT "lead_duplicate_candidates_lead_tenant_fk" FOREIGN KEY ("client_organization_id","lead_id") REFERENCES "public"."lead_opportunities"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_lead_tenant_fk" FOREIGN KEY ("client_organization_id","lead_id") REFERENCES "public"."lead_opportunities"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_to_membership_tenant_fk" FOREIGN KEY ("client_organization_id","to_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_assignments" ADD CONSTRAINT "lead_assignments_actor_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_follow_ups" ADD CONSTRAINT "lead_follow_ups_lead_tenant_fk" FOREIGN KEY ("client_organization_id","lead_id") REFERENCES "public"."lead_opportunities"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_follow_ups" ADD CONSTRAINT "lead_follow_ups_owner_tenant_fk" FOREIGN KEY ("client_organization_id","owner_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_ingestion_receipts" ADD CONSTRAINT "lead_ingestion_receipts_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_ingestion_receipts" ADD CONSTRAINT "lead_ingestion_receipts_lead_tenant_fk" FOREIGN KEY ("client_organization_id","lead_id") REFERENCES "public"."lead_opportunities"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_lead_tenant_fk" FOREIGN KEY ("client_organization_id","lead_id") REFERENCES "public"."lead_opportunities"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_author_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_opportunities" ADD CONSTRAINT "lead_opportunities_contact_tenant_fk" FOREIGN KEY ("client_organization_id","contact_id") REFERENCES "public"."contacts"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_opportunities" ADD CONSTRAINT "lead_opportunities_branch_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id") REFERENCES "public"."branches"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_opportunities" ADD CONSTRAINT "lead_opportunities_queue_tenant_fk" FOREIGN KEY ("client_organization_id","assignment_queue_id") REFERENCES "public"."lead_assignment_queues"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_opportunities" ADD CONSTRAINT "lead_opportunities_campaign_tenant_fk" FOREIGN KEY ("client_organization_id","campaign_attribution_id") REFERENCES "public"."lead_campaign_attributions"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_opportunities" ADD CONSTRAINT "lead_opportunities_relationship_membership_tenant_fk" FOREIGN KEY ("client_organization_id","relationship_owner_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_opportunities" ADD CONSTRAINT "lead_opportunities_relationship_user_membership_fk" FOREIGN KEY ("relationship_owner_id","relationship_owner_membership_id") REFERENCES "public"."memberships"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_opportunities" ADD CONSTRAINT "lead_opportunities_process_membership_tenant_fk" FOREIGN KEY ("client_organization_id","current_process_owner_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_opportunities" ADD CONSTRAINT "lead_opportunities_process_user_membership_fk" FOREIGN KEY ("current_process_owner_id","current_process_owner_membership_id") REFERENCES "public"."memberships"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_opportunities" ADD CONSTRAINT "lead_opportunities_conversation_membership_tenant_fk" FOREIGN KEY ("client_organization_id","conversation_owner_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_opportunities" ADD CONSTRAINT "lead_opportunities_conversation_user_membership_fk" FOREIGN KEY ("conversation_owner_id","conversation_owner_membership_id") REFERENCES "public"."memberships"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_outcome_events" ADD CONSTRAINT "lead_outcome_events_lead_tenant_fk" FOREIGN KEY ("client_organization_id","lead_id") REFERENCES "public"."lead_opportunities"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_outcome_events" ADD CONSTRAINT "lead_outcome_events_contact_tenant_fk" FOREIGN KEY ("client_organization_id","canonical_contact_id") REFERENCES "public"."contacts"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_outcome_events" ADD CONSTRAINT "lead_outcome_events_canonical_lead_tenant_fk" FOREIGN KEY ("client_organization_id","canonical_lead_id") REFERENCES "public"."lead_opportunities"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_settings" ADD CONSTRAINT "lead_settings_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_settings" ADD CONSTRAINT "lead_settings_updated_by_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_history_lead_tenant_fk" FOREIGN KEY ("client_organization_id","lead_id") REFERENCES "public"."lead_opportunities"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_status_history" ADD CONSTRAINT "lead_status_actor_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_lead_tenant_fk" FOREIGN KEY ("client_organization_id","lead_id") REFERENCES "public"."lead_opportunities"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_owner_tenant_fk" FOREIGN KEY ("client_organization_id","owner_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_lead_forms" ADD CONSTRAINT "public_lead_forms_branch_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id") REFERENCES "public"."branches"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "public_lead_forms" ADD CONSTRAINT "public_lead_forms_queue_tenant_fk" FOREIGN KEY ("client_organization_id","assignment_queue_id") REFERENCES "public"."lead_assignment_queues"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_sla_escalations" ADD CONSTRAINT "lead_sla_escalations_lead_tenant_fk" FOREIGN KEY ("client_organization_id","lead_id") REFERENCES "public"."lead_opportunities"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_sla_escalations" ADD CONSTRAINT "lead_sla_timer_fk" FOREIGN KEY ("timer_id") REFERENCES "public"."lead_sla_timers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_sla_timers" ADD CONSTRAINT "lead_sla_timers_lead_tenant_fk" FOREIGN KEY ("client_organization_id","lead_id") REFERENCES "public"."lead_opportunities"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_assignment_queue_members_rotation_idx" ON "lead_assignment_queue_members" USING btree ("client_organization_id","queue_id","active","last_assigned_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_assignment_queues_client_code_uidx" ON "lead_assignment_queues" USING btree ("client_organization_id","code");--> statement-breakpoint
CREATE INDEX "lead_campaign_attributions_campaign_idx" ON "lead_campaign_attributions" USING btree ("client_organization_id","campaign_name","utm_campaign");--> statement-breakpoint
CREATE INDEX "consent_records_contact_purpose_idx" ON "consent_records" USING btree ("client_organization_id","contact_id","purpose","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_channels_client_contact_type_value_uidx" ON "contact_channels" USING btree ("client_organization_id","contact_id","channel_type","value_normalized");--> statement-breakpoint
CREATE INDEX "contact_channels_lookup_idx" ON "contact_channels" USING btree ("client_organization_id","lookup_hash");--> statement-breakpoint
CREATE INDEX "contacts_client_phone_hash_idx" ON "contacts" USING btree ("client_organization_id","primary_phone_lookup_hash");--> statement-breakpoint
CREATE INDEX "contacts_client_alt_phone_hash_idx" ON "contacts" USING btree ("client_organization_id","alternate_phone_lookup_hash");--> statement-breakpoint
CREATE INDEX "contacts_client_email_idx" ON "contacts" USING btree ("client_organization_id","primary_email_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_duplicate_candidates_pair_uidx" ON "lead_duplicate_candidates" USING btree ("client_organization_id","lead_id","candidate_contact_id");--> statement-breakpoint
CREATE INDEX "lead_duplicate_candidates_queue_idx" ON "lead_duplicate_candidates" USING btree ("client_organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "lead_assignments_lead_history_idx" ON "lead_assignments" USING btree ("client_organization_id","lead_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_follow_ups_due_idx" ON "lead_follow_ups" USING btree ("client_organization_id","status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_ingestion_receipts_external_uidx" ON "lead_ingestion_receipts" USING btree ("client_organization_id","provider","external_event_id");--> statement-breakpoint
CREATE INDEX "lead_notes_lead_idx" ON "lead_notes" USING btree ("client_organization_id","lead_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_opportunities_external_uidx" ON "lead_opportunities" USING btree ("client_organization_id","source","external_lead_id") WHERE "lead_opportunities"."external_lead_id" is not null;--> statement-breakpoint
CREATE INDEX "lead_opportunities_status_owner_next_idx" ON "lead_opportunities" USING btree ("client_organization_id","status","current_process_owner_id","next_action_at");--> statement-breakpoint
CREATE INDEX "lead_opportunities_branch_status_idx" ON "lead_opportunities" USING btree ("client_organization_id","branch_id","status");--> statement-breakpoint
CREATE INDEX "lead_opportunities_sla_idx" ON "lead_opportunities" USING btree ("client_organization_id","sla_state","sla_due_at");--> statement-breakpoint
CREATE INDEX "lead_outcome_events_search_idx" ON "lead_outcome_events" USING btree ("client_organization_id","event_type","created_at");--> statement-breakpoint
CREATE INDEX "lead_status_history_search_idx" ON "lead_status_history" USING btree ("client_organization_id","to_status","created_at");--> statement-breakpoint
CREATE INDEX "lead_status_history_lead_idx" ON "lead_status_history" USING btree ("client_organization_id","lead_id","created_at");--> statement-breakpoint
CREATE INDEX "lead_tasks_due_idx" ON "lead_tasks" USING btree ("client_organization_id","status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "public_lead_forms_key_uidx" ON "public_lead_forms" USING btree ("client_form_key");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_sla_escalations_level_uidx" ON "lead_sla_escalations" USING btree ("timer_id","level");--> statement-breakpoint
CREATE INDEX "lead_sla_escalations_queue_idx" ON "lead_sla_escalations" USING btree ("client_organization_id","state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_sla_timers_active_uidx" ON "lead_sla_timers" USING btree ("client_organization_id","lead_id") WHERE "lead_sla_timers"."state" in ('OPEN', 'WARNING', 'BREACHED');--> statement-breakpoint
CREATE INDEX "lead_sla_timers_due_idx" ON "lead_sla_timers" USING btree ("client_organization_id","state","due_at");