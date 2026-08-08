CREATE TYPE "public"."conversation_participant_role" AS ENUM('CUSTOMER', 'AGENT', 'QUEUE');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('OPEN', 'PENDING', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."message_content_type" AS ENUM('TEXT', 'TEMPLATE', 'MEDIA', 'NOTE');--> statement-breakpoint
CREATE TYPE "public"."message_delivery_status" AS ENUM('QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'RECEIVED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('INBOUND', 'OUTBOUND', 'INTERNAL');--> statement-breakpoint
CREATE TYPE "public"."message_media_availability" AS ENUM('PENDING', 'AVAILABLE', 'UNAVAILABLE', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."message_outbox_status" AS ENUM('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD_LETTER');--> statement-breakpoint
CREATE TYPE "public"."message_template_category" AS ENUM('MARKETING', 'UTILITY', 'AUTHENTICATION');--> statement-breakpoint
CREATE TYPE "public"."message_template_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."messaging_channel" AS ENUM('WHATSAPP', 'EMAIL', 'SMS');--> statement-breakpoint
CREATE TYPE "public"."messaging_connection_status" AS ENUM('PENDING_APPROVAL', 'ACTIVE', 'DEGRADED', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."messaging_opt_in_status" AS ENUM('GRANTED', 'DENIED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."messaging_suppression_scope" AS ENUM('MARKETING', 'ALL');--> statement-breakpoint
CREATE TABLE "conversation_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"from_owner_membership_id" uuid,
	"to_owner_membership_id" uuid,
	"from_team_id" uuid,
	"to_team_id" uuid,
	"reason" text NOT NULL,
	"assigned_by_user_id" uuid NOT NULL,
	"assigned_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "conversation_participant_role" NOT NULL,
	"contact_id" uuid,
	"membership_id" uuid,
	"user_id" uuid,
	"team_id" uuid,
	"address" varchar(320),
	"display_name" varchar(160),
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_participants_identity_check" CHECK (("conversation_participants"."role" = 'CUSTOMER' and "conversation_participants"."contact_id" is not null) or ("conversation_participants"."role" = 'AGENT' and "conversation_participants"."membership_id" is not null and "conversation_participants"."user_id" is not null) or ("conversation_participants"."role" = 'QUEUE' and "conversation_participants"."team_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"channel" "messaging_channel" NOT NULL,
	"contact_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"team_id" uuid,
	"conversation_owner_id" uuid,
	"conversation_owner_membership_id" uuid,
	"remote_address" varchar(320) NOT NULL,
	"subject" varchar(240),
	"status" "conversation_status" DEFAULT 'OPEN' NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"last_inbound_at" timestamp with time zone,
	"last_outbound_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "conversations_unread_check" CHECK ("conversations"."unread_count" >= 0),
	CONSTRAINT "conversations_version_check" CHECK ("conversations"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "message_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"provider_media_id" varchar(256),
	"object_key" varchar(1024),
	"original_filename" varchar(180),
	"mime_type" varchar(128) NOT NULL,
	"size_bytes" integer,
	"checksum_sha256" varchar(128),
	"availability" "message_media_availability" DEFAULT 'PENDING' NOT NULL,
	"retention_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_media_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "message_media_size_check" CHECK ("message_media"."size_bytes" is null or "message_media"."size_bytes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "message_outbound_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"status" "message_outbox_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" varchar(128),
	"sent_at" timestamp with time zone,
	"last_error_code" varchar(100),
	"last_error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_outbox_attempts_check" CHECK ("message_outbound_outbox"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "message_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"status" "message_delivery_status" NOT NULL,
	"provider_event_id" varchar(256),
	"occurred_at" timestamp with time zone NOT NULL,
	"error_code" varchar(100),
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_template_id" varchar(256),
	"name" varchar(512) NOT NULL,
	"language" varchar(32) NOT NULL,
	"category" "message_template_category" NOT NULL,
	"status" "message_template_status" DEFAULT 'PENDING' NOT NULL,
	"body_text" text NOT NULL,
	"components" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_templates_client_id_unique" UNIQUE("client_organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" "message_direction" NOT NULL,
	"content_type" "message_content_type" NOT NULL,
	"status" "message_delivery_status" NOT NULL,
	"body_text" text,
	"template_id" uuid,
	"template_variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provider_message_id" varchar(256),
	"client_idempotency_key" varchar(256),
	"reply_to_message_id" uuid,
	"sender_user_id" uuid,
	"sender_membership_id" uuid,
	"provider_occurred_at" timestamp with time zone,
	"provider_sequence" varchar(128),
	"referral_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "messages_content_check" CHECK (("messages"."content_type" in ('TEXT', 'NOTE') and "messages"."body_text" is not null) or ("messages"."content_type" = 'TEMPLATE' and "messages"."template_id" is not null) or "messages"."content_type" = 'MEDIA'),
	CONSTRAINT "messages_sender_check" CHECK ("messages"."direction" = 'INBOUND' or ("messages"."sender_user_id" is not null and "messages"."sender_membership_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "messaging_opt_in_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel" "messaging_channel" NOT NULL,
	"category" "message_template_category",
	"status" "messaging_opt_in_status" NOT NULL,
	"source" varchar(64) NOT NULL,
	"notice_version" varchar(64) NOT NULL,
	"evidence" text NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_opt_in_client_id_unique" UNIQUE("client_organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "messaging_provider_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"default_assignment_queue_id" uuid,
	"provider" varchar(64) NOT NULL,
	"channel" "messaging_channel" NOT NULL,
	"connection_key" varchar(128) NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"status" "messaging_connection_status" DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"waba_id" varchar(128),
	"phone_number_id" varchar(128),
	"business_phone_e164" varchar(32),
	"credential_ciphertext" text,
	"credential_iv" varchar(64),
	"credential_auth_tag" varchar(64),
	"credential_key_id" varchar(64),
	"embedded_onboarding_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"template_sync_status" varchar(32) DEFAULT 'NOT_SYNCED' NOT NULL,
	"template_synced_at" timestamp with time zone,
	"quality_rating" varchar(32),
	"messaging_limit" varchar(64),
	"webhook_state" varchar(32) DEFAULT 'NOT_VERIFIED' NOT NULL,
	"last_webhook_at" timestamp with time zone,
	"last_health_at" timestamp with time zone,
	"last_health_status" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_connections_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "messaging_connections_credentials_check" CHECK (("messaging_provider_connections"."credential_ciphertext" is null and "messaging_provider_connections"."credential_iv" is null and "messaging_provider_connections"."credential_auth_tag" is null and "messaging_provider_connections"."credential_key_id" is null) or ("messaging_provider_connections"."credential_ciphertext" is not null and "messaging_provider_connections"."credential_iv" is not null and "messaging_provider_connections"."credential_auth_tag" is not null and "messaging_provider_connections"."credential_key_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "messaging_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel" "messaging_channel" NOT NULL,
	"scope" "messaging_suppression_scope" NOT NULL,
	"reason" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messaging_suppressions_client_id_unique" UNIQUE("client_organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "conversation_assignments" ADD CONSTRAINT "conversation_assignments_conversation_tenant_fk" FOREIGN KEY ("client_organization_id","conversation_id") REFERENCES "public"."conversations"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_assignments" ADD CONSTRAINT "conversation_assignments_to_owner_tenant_fk" FOREIGN KEY ("client_organization_id","to_owner_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_assignments" ADD CONSTRAINT "conversation_assignments_actor_tenant_fk" FOREIGN KEY ("client_organization_id","assigned_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_assignments" ADD CONSTRAINT "conversation_assignments_actor_user_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_tenant_fk" FOREIGN KEY ("client_organization_id","conversation_id") REFERENCES "public"."conversations"("client_organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_contact_tenant_fk" FOREIGN KEY ("client_organization_id","contact_id") REFERENCES "public"."contacts"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_membership_tenant_fk" FOREIGN KEY ("client_organization_id","membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_connection_tenant_fk" FOREIGN KEY ("client_organization_id","connection_id") REFERENCES "public"."messaging_provider_connections"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_tenant_fk" FOREIGN KEY ("client_organization_id","contact_id") REFERENCES "public"."contacts"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_lead_tenant_fk" FOREIGN KEY ("client_organization_id","lead_id") REFERENCES "public"."lead_opportunities"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_branch_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id") REFERENCES "public"."branches"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_team_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id","team_id") REFERENCES "public"."teams"("client_organization_id","branch_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_owner_membership_tenant_fk" FOREIGN KEY ("client_organization_id","conversation_owner_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_owner_user_membership_fk" FOREIGN KEY ("conversation_owner_id","conversation_owner_membership_id") REFERENCES "public"."memberships"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_media" ADD CONSTRAINT "message_media_message_tenant_fk" FOREIGN KEY ("client_organization_id","message_id") REFERENCES "public"."messages"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_outbound_outbox" ADD CONSTRAINT "message_outbox_message_tenant_fk" FOREIGN KEY ("client_organization_id","message_id") REFERENCES "public"."messages"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_status_history" ADD CONSTRAINT "message_status_history_message_tenant_fk" FOREIGN KEY ("client_organization_id","message_id") REFERENCES "public"."messages"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_connection_tenant_fk" FOREIGN KEY ("client_organization_id","connection_id") REFERENCES "public"."messaging_provider_connections"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_tenant_fk" FOREIGN KEY ("client_organization_id","conversation_id") REFERENCES "public"."conversations"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_template_tenant_fk" FOREIGN KEY ("client_organization_id","template_id") REFERENCES "public"."message_templates"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_membership_tenant_fk" FOREIGN KEY ("client_organization_id","sender_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_tenant_fk" FOREIGN KEY ("client_organization_id","reply_to_message_id") REFERENCES "public"."messages"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_opt_in_records" ADD CONSTRAINT "messaging_opt_in_contact_tenant_fk" FOREIGN KEY ("client_organization_id","contact_id") REFERENCES "public"."contacts"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_provider_connections" ADD CONSTRAINT "messaging_connections_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_provider_connections" ADD CONSTRAINT "messaging_connections_branch_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id") REFERENCES "public"."branches"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messaging_suppressions" ADD CONSTRAINT "messaging_suppressions_contact_tenant_fk" FOREIGN KEY ("client_organization_id","contact_id") REFERENCES "public"."contacts"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_assignments_conversation_idx" ON "conversation_assignments" USING btree ("client_organization_id","conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "conversation_participants_conversation_idx" ON "conversation_participants" USING btree ("client_organization_id","conversation_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_active_remote_uidx" ON "conversations" USING btree ("client_organization_id","connection_id","remote_address") WHERE "conversations"."status" <> 'CLOSED';--> statement-breakpoint
CREATE INDEX "conversations_inbox_idx" ON "conversations" USING btree ("client_organization_id","status","conversation_owner_id","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_lead_idx" ON "conversations" USING btree ("client_organization_id","lead_id","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_media_provider_uidx" ON "message_media" USING btree ("client_organization_id","provider_media_id") WHERE "message_media"."provider_media_id" is not null;--> statement-breakpoint
CREATE INDEX "message_media_message_idx" ON "message_media" USING btree ("client_organization_id","message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_outbox_message_uidx" ON "message_outbound_outbox" USING btree ("client_organization_id","message_id");--> statement-breakpoint
CREATE INDEX "message_outbox_pending_idx" ON "message_outbound_outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "message_status_provider_event_uidx" ON "message_status_history" USING btree ("client_organization_id","provider_event_id") WHERE "message_status_history"."provider_event_id" is not null;--> statement-breakpoint
CREATE INDEX "message_status_history_order_idx" ON "message_status_history" USING btree ("client_organization_id","message_id","occurred_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_templates_name_language_uidx" ON "message_templates" USING btree ("client_organization_id","connection_id","name","language");--> statement-breakpoint
CREATE INDEX "message_templates_catalog_idx" ON "message_templates" USING btree ("client_organization_id","status","category","name");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_provider_id_uidx" ON "messages" USING btree ("client_organization_id","provider_message_id") WHERE "messages"."provider_message_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_idempotency_uidx" ON "messages" USING btree ("client_organization_id","client_idempotency_key") WHERE "messages"."client_idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "messages_timeline_order_idx" ON "messages" USING btree ("client_organization_id","conversation_id","provider_occurred_at","provider_sequence","received_at","id");--> statement-breakpoint
CREATE INDEX "messaging_opt_in_lookup_idx" ON "messaging_opt_in_records" USING btree ("client_organization_id","contact_id","channel","category","captured_at");--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_connections_key_uidx" ON "messaging_provider_connections" USING btree ("connection_key");--> statement-breakpoint
CREATE UNIQUE INDEX "messaging_connections_phone_uidx" ON "messaging_provider_connections" USING btree ("client_organization_id","provider","phone_number_id") WHERE "messaging_provider_connections"."phone_number_id" is not null;--> statement-breakpoint
CREATE INDEX "messaging_connections_client_status_idx" ON "messaging_provider_connections" USING btree ("client_organization_id","channel","status");--> statement-breakpoint
CREATE INDEX "messaging_suppressions_active_idx" ON "messaging_suppressions" USING btree ("client_organization_id","contact_id","channel","active","starts_at","ends_at");
--> statement-breakpoint
INSERT INTO "permissions" ("id", "code", "description") VALUES
  (gen_random_uuid(), 'messaging.conversations.read', 'Read tenant- and conversation-owner-scoped conversations.'),
  (gen_random_uuid(), 'messaging.messages.send', 'Send policy-compliant free-form or approved-template messages.'),
  (gen_random_uuid(), 'messaging.notes.create', 'Append internal notes to a scoped conversation.'),
  (gen_random_uuid(), 'messaging.assignments.manage', 'Assign conversation owners and queues with history.'),
  (gen_random_uuid(), 'messaging.templates.read', 'Read tenant message templates and provider approval status.'),
  (gen_random_uuid(), 'messaging.templates.manage', 'Synchronize and manage tenant message templates.'),
  (gen_random_uuid(), 'messaging.connections.manage', 'Configure encrypted official messaging connections.'),
  (gen_random_uuid(), 'messaging.failures.manage', 'Inspect and retry failed or dead-letter messages.'),
  (gen_random_uuid(), 'messaging.media.read', 'Request scoped private message media access.'),
  (gen_random_uuid(), 'messaging.media.upload', 'Upload private outbound message media.')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions" ON "permissions"."code" LIKE 'messaging.%'
WHERE "roles"."code" IN ('AGENCY_ADMIN', 'CLIENT_ADMIN', 'MANAGER', 'SALES_MANAGER')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions" ON "permissions"."code" IN (
  'messaging.conversations.read', 'messaging.messages.send', 'messaging.notes.create',
  'messaging.assignments.manage', 'messaging.templates.read', 'messaging.failures.manage',
  'messaging.media.read', 'messaging.media.upload'
)
WHERE "roles"."code" = 'TEAM_MANAGER'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions" ON "permissions"."code" IN (
  'messaging.conversations.read', 'messaging.messages.send', 'messaging.notes.create',
  'messaging.templates.read', 'messaging.failures.manage', 'messaging.media.read',
  'messaging.media.upload'
)
WHERE "roles"."code" IN ('TELECALLER', 'SALESPERSON')
ON CONFLICT DO NOTHING;
