CREATE TYPE "public"."creative_asset_status" AS ENUM('GENERATED', 'MODERATION_PENDING', 'REVIEW_PENDING', 'APPROVED', 'REJECTED', 'PUBLISHED');--> statement-breakpoint
CREATE TYPE "public"."integration_connection_status" AS ENUM('PENDING_APPROVAL', 'ACTIVE', 'DEGRADED', 'DISCONNECTED');--> statement-breakpoint
CREATE TYPE "public"."transcript_suggestion_status" AS ENUM('REVIEW_PENDING', 'ACCEPTED', 'REJECTED');--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'integrations.read';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'integrations.manage';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'onboarding.manage';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'ai.creatives.manage';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'ai.creatives.review';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'ai.transcripts.manage';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'ai.transcripts.review';--> statement-breakpoint
ALTER TYPE "public"."permission_code" ADD VALUE 'social.publish';--> statement-breakpoint
CREATE TABLE "call_transcript_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"call_id" uuid NOT NULL,
	"recording_id" uuid NOT NULL,
	"transcript" text NOT NULL,
	"summary" text NOT NULL,
	"suggestions" jsonb NOT NULL,
	"status" "transcript_suggestion_status" DEFAULT 'REVIEW_PENDING' NOT NULL,
	"reviewed_by_membership_id" uuid,
	"review_reason" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_creative_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"requested_by_membership_id" uuid NOT NULL,
	"brand_profile" varchar(240) NOT NULL,
	"brand_template" varchar(240) NOT NULL,
	"brief" text NOT NULL,
	"provider" varchar(64) NOT NULL,
	"status" "creative_asset_status" DEFAULT 'MODERATION_PENDING' NOT NULL,
	"object_key" text,
	"moderation_summary" text,
	"reviewed_by_membership_id" uuid,
	"review_reason" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creative_assets_review_check" CHECK ("generated_creative_assets"."status" not in ('APPROVED', 'REJECTED', 'PUBLISHED') or "generated_creative_assets"."reviewed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "integration_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"provider" varchar(64) NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"status" "integration_connection_status" DEFAULT 'PENDING_APPROVAL' NOT NULL,
	"credential_ciphertext" text,
	"credential_key_id" varchar(64),
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"failure_summary" text,
	"webhook_state" varchar(32) DEFAULT 'NOT_VERIFIED' NOT NULL,
	"quota_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"disconnected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"item_code" varchar(80) NOT NULL,
	"complete" boolean DEFAULT false NOT NULL,
	"evidence" text,
	"completed_by_membership_id" uuid,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "call_transcript_suggestions" ADD CONSTRAINT "call_transcript_call_tenant_fk" FOREIGN KEY ("client_organization_id","call_id") REFERENCES "public"."calls"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_transcript_suggestions" ADD CONSTRAINT "call_transcript_recording_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."call_recordings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_transcript_suggestions" ADD CONSTRAINT "call_transcript_reviewer_tenant_fk" FOREIGN KEY ("client_organization_id","reviewed_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_creative_assets" ADD CONSTRAINT "creative_assets_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_creative_assets" ADD CONSTRAINT "creative_assets_requester_tenant_fk" FOREIGN KEY ("client_organization_id","requested_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_creative_assets" ADD CONSTRAINT "creative_assets_reviewer_tenant_fk" FOREIGN KEY ("client_organization_id","reviewed_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_checklist_items" ADD CONSTRAINT "onboarding_checklist_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_checklist_items" ADD CONSTRAINT "onboarding_checklist_actor_tenant_fk" FOREIGN KEY ("client_organization_id","completed_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "call_transcript_recording_uidx" ON "call_transcript_suggestions" USING btree ("client_organization_id","recording_id");--> statement-breakpoint
CREATE INDEX "call_transcript_status_idx" ON "call_transcript_suggestions" USING btree ("client_organization_id","status");--> statement-breakpoint
CREATE INDEX "creative_assets_status_idx" ON "generated_creative_assets" USING btree ("client_organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connections_provider_uidx" ON "integration_connections" USING btree ("client_organization_id","provider");--> statement-breakpoint
CREATE INDEX "integration_connections_status_idx" ON "integration_connections" USING btree ("client_organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_checklist_item_uidx" ON "onboarding_checklist_items" USING btree ("client_organization_id","item_code");
