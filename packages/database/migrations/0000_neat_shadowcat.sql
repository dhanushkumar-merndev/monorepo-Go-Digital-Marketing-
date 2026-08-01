CREATE TYPE "public"."audit_outcome" AS ENUM('SUCCESS', 'DENIED', 'FAILURE');--> statement-breakpoint
CREATE TYPE "public"."event_scope" AS ENUM('PLATFORM', 'CLIENT');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'DEAD_LETTER');--> statement-breakpoint
CREATE TYPE "public"."webhook_status" AS ENUM('RECEIVED', 'PROCESSING', 'PROCESSED', 'DUPLICATE', 'FAILED', 'DEAD_LETTER');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "event_scope" NOT NULL,
	"client_organization_id" uuid,
	"actor_id" varchar(128),
	"actor_type" varchar(64) NOT NULL,
	"effective_role" varchar(100),
	"action" varchar(160) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" varchar(128) NOT NULL,
	"outcome" "audit_outcome" NOT NULL,
	"old_summary" jsonb,
	"new_summary" jsonb,
	"reason" text,
	"correlation_id" varchar(128) NOT NULL,
	"source_ip" "inet",
	"user_agent" text,
	"device_id" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_scope_client_check" CHECK (("audit_events"."scope" = 'PLATFORM' AND "audit_events"."client_organization_id" IS NULL) OR ("audit_events"."scope" = 'CLIENT' AND "audit_events"."client_organization_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "event_scope" NOT NULL,
	"client_organization_id" uuid,
	"aggregate_type" varchar(100) NOT NULL,
	"aggregate_id" varchar(128) NOT NULL,
	"event_type" varchar(160) NOT NULL,
	"event_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"correlation_id" varchar(128) NOT NULL,
	"status" "outbox_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" varchar(128),
	"processed_at" timestamp with time zone,
	"last_error_code" varchar(100),
	"last_error_message" text,
	CONSTRAINT "outbox_events_scope_client_check" CHECK (("outbox_events"."scope" = 'PLATFORM' AND "outbox_events"."client_organization_id" IS NULL) OR ("outbox_events"."scope" = 'CLIENT' AND "outbox_events"."client_organization_id" IS NOT NULL)),
	CONSTRAINT "outbox_events_attempts_check" CHECK ("outbox_events"."attempts" >= 0),
	CONSTRAINT "outbox_events_version_check" CHECK ("outbox_events"."event_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"provider" varchar(64) NOT NULL,
	"external_event_id" varchar(256) NOT NULL,
	"event_type" varchar(160) NOT NULL,
	"status" "webhook_status" DEFAULT 'RECEIVED' NOT NULL,
	"signature_verified_at" timestamp with time zone NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"normalized_payload" jsonb,
	"correlation_id" varchar(128) NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"raw_payload_expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error_code" varchar(100),
	"last_error_message" text,
	CONSTRAINT "webhook_events_attempts_check" CHECK ("webhook_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX "audit_events_client_created_idx" ON "audit_events" USING btree ("client_organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("client_organization_id","entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_correlation_idx" ON "audit_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE INDEX "outbox_events_pending_idx" ON "outbox_events" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "outbox_events_client_occurred_idx" ON "outbox_events" USING btree ("client_organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events" USING btree ("client_organization_id","aggregate_type","aggregate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_client_provider_external_uidx" ON "webhook_events" USING btree ("client_organization_id","provider","external_event_id");--> statement-breakpoint
CREATE INDEX "webhook_events_processing_idx" ON "webhook_events" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "webhook_events_client_received_idx" ON "webhook_events" USING btree ("client_organization_id","received_at");--> statement-breakpoint
CREATE INDEX "webhook_events_payload_expiry_idx" ON "webhook_events" USING btree ("raw_payload_expires_at");--> statement-breakpoint
CREATE FUNCTION "public"."prevent_audit_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'audit_events are immutable'
		USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "audit_events_immutable"
BEFORE UPDATE OR DELETE ON "audit_events"
FOR EACH ROW
EXECUTE FUNCTION "public"."prevent_audit_event_mutation"();
