CREATE TYPE "public"."inventory_allocation_status" AS ENUM('ACTIVE', 'RELEASED', 'REPLACED', 'DELIVERED');--> statement-breakpoint
CREATE TYPE "public"."inventory_reservation_status" AS ENUM('ACTIVE', 'RELEASED', 'EXPIRED', 'CANCELLED', 'CONVERTED');--> statement-breakpoint
CREATE TYPE "public"."inventory_transfer_event_type" AS ENUM('STARTED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."inventory_unit_status" AS ENUM('EXPECTED', 'AVAILABLE', 'RESERVED', 'ALLOCATED', 'DEMO', 'IN_TRANSFER', 'DELIVERED', 'BLOCKED', 'CANCELLED', 'REMOVED');--> statement-breakpoint
CREATE TABLE "inventory_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"inventory_unit_id" uuid NOT NULL,
	"booking_reference" varchar(120) NOT NULL,
	"status" "inventory_allocation_status" DEFAULT 'ACTIVE' NOT NULL,
	"readiness_asserted" boolean NOT NULL,
	"reason" text NOT NULL,
	"customer_communication_decision" text,
	"replaces_allocation_id" uuid,
	"allocated_by_user_id" uuid NOT NULL,
	"allocated_by_membership_id" uuid NOT NULL,
	"allocated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "inventory_allocations_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "inventory_allocations_readiness_check" CHECK ("inventory_allocations"."readiness_asserted" = true)
);
--> statement-breakpoint
CREATE TABLE "inventory_brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(160) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_brands_client_id_unique" UNIQUE("client_organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "inventory_colours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(120) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_colours_client_id_unique" UNIQUE("client_organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "inventory_command_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"idempotency_key" varchar(128) NOT NULL,
	"command_type" varchar(80) NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"response_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(160) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_models_client_id_unique" UNIQUE("client_organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "inventory_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"inventory_unit_id" uuid NOT NULL,
	"lead_id" uuid,
	"booking_reference" varchar(120),
	"status" "inventory_reservation_status" DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"released_reason" text,
	"released_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_reservations_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "inventory_reservations_context_check" CHECK ("inventory_reservations"."lead_id" is not null or "inventory_reservations"."booking_reference" is not null)
);
--> statement-breakpoint
CREATE TABLE "inventory_transfer_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"transfer_id" uuid NOT NULL,
	"inventory_unit_id" uuid NOT NULL,
	"event_type" "inventory_transfer_event_type" NOT NULL,
	"reason" text,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_transfer_events_client_id_unique" UNIQUE("client_organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "inventory_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"inventory_unit_id" uuid NOT NULL,
	"from_branch_id" uuid NOT NULL,
	"to_branch_id" uuid NOT NULL,
	"prior_status" "inventory_unit_status" NOT NULL,
	"reference" varchar(120) NOT NULL,
	"reason" text NOT NULL,
	"initiated_by_user_id" uuid NOT NULL,
	"initiated_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_transfers_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "inventory_transfers_branch_check" CHECK ("inventory_transfers"."from_branch_id" <> "inventory_transfers"."to_branch_id"),
	CONSTRAINT "inventory_transfers_prior_status_check" CHECK ("inventory_transfers"."prior_status" in ('AVAILABLE', 'DEMO', 'BLOCKED'))
);
--> statement-breakpoint
CREATE TABLE "inventory_unit_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"inventory_unit_id" uuid NOT NULL,
	"from_status" "inventory_unit_status",
	"to_status" "inventory_unit_status" NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"reason" text,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_user_id" uuid,
	"actor_membership_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_history_client_id_unique" UNIQUE("client_organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "inventory_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"colour_id" uuid NOT NULL,
	"unit_reference" varchar(100) NOT NULL,
	"vin" varchar(64),
	"chassis_number" varchar(80),
	"engine_number" varchar(80),
	"status" "inventory_unit_status" DEFAULT 'EXPECTED' NOT NULL,
	"ownership_type" varchar(64) NOT NULL,
	"acquisition_reference" varchar(120),
	"expected_arrival_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"current_odometer_km" integer DEFAULT 0 NOT NULL,
	"condition_notes" text,
	"service_due_at" timestamp with time zone,
	"blocked_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_by_membership_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_units_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "inventory_units_version_check" CHECK ("inventory_units"."version" >= 1),
	CONSTRAINT "inventory_units_odometer_check" CHECK ("inventory_units"."current_odometer_km" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(160) NOT NULL,
	"fuel_powertrain" varchar(80) NOT NULL,
	"model_year" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_variants_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "inventory_variants_model_year_check" CHECK ("inventory_variants"."model_year" between 1900 and 2200)
);
--> statement-breakpoint
ALTER TABLE "test_ride_demo_vehicle_bookings" ADD COLUMN "inventory_unit_id" uuid;--> statement-breakpoint
ALTER TABLE "test_ride_jobs" ADD COLUMN "inventory_unit_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_allocations" ADD CONSTRAINT "inventory_allocations_unit_tenant_fk" FOREIGN KEY ("client_organization_id","inventory_unit_id") REFERENCES "public"."inventory_units"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_allocations" ADD CONSTRAINT "inventory_allocations_replacement_tenant_fk" FOREIGN KEY ("client_organization_id","replaces_allocation_id") REFERENCES "public"."inventory_allocations"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_allocations" ADD CONSTRAINT "inventory_allocations_actor_membership_tenant_fk" FOREIGN KEY ("client_organization_id","allocated_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_allocations" ADD CONSTRAINT "inventory_allocations_actor_user_membership_fk" FOREIGN KEY ("allocated_by_user_id","allocated_by_membership_id") REFERENCES "public"."memberships"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_brands" ADD CONSTRAINT "inventory_brands_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_colours" ADD CONSTRAINT "inventory_colours_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_command_receipts" ADD CONSTRAINT "inventory_command_receipts_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_models" ADD CONSTRAINT "inventory_models_brand_tenant_fk" FOREIGN KEY ("client_organization_id","brand_id") REFERENCES "public"."inventory_brands"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_unit_tenant_fk" FOREIGN KEY ("client_organization_id","inventory_unit_id") REFERENCES "public"."inventory_units"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_lead_tenant_fk" FOREIGN KEY ("client_organization_id","lead_id") REFERENCES "public"."lead_opportunities"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_creator_membership_tenant_fk" FOREIGN KEY ("client_organization_id","created_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_creator_user_membership_fk" FOREIGN KEY ("created_by_user_id","created_by_membership_id") REFERENCES "public"."memberships"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfer_events" ADD CONSTRAINT "inventory_transfer_events_transfer_tenant_fk" FOREIGN KEY ("client_organization_id","transfer_id") REFERENCES "public"."inventory_transfers"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfer_events" ADD CONSTRAINT "inventory_transfer_events_unit_tenant_fk" FOREIGN KEY ("client_organization_id","inventory_unit_id") REFERENCES "public"."inventory_units"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfer_events" ADD CONSTRAINT "inventory_transfer_events_actor_membership_tenant_fk" FOREIGN KEY ("client_organization_id","actor_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfer_events" ADD CONSTRAINT "inventory_transfer_events_actor_user_membership_fk" FOREIGN KEY ("actor_user_id","actor_membership_id") REFERENCES "public"."memberships"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_unit_tenant_fk" FOREIGN KEY ("client_organization_id","inventory_unit_id") REFERENCES "public"."inventory_units"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_from_branch_tenant_fk" FOREIGN KEY ("client_organization_id","from_branch_id") REFERENCES "public"."branches"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_to_branch_tenant_fk" FOREIGN KEY ("client_organization_id","to_branch_id") REFERENCES "public"."branches"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_actor_membership_tenant_fk" FOREIGN KEY ("client_organization_id","initiated_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_actor_user_membership_fk" FOREIGN KEY ("initiated_by_user_id","initiated_by_membership_id") REFERENCES "public"."memberships"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_unit_status_history" ADD CONSTRAINT "inventory_history_unit_tenant_fk" FOREIGN KEY ("client_organization_id","inventory_unit_id") REFERENCES "public"."inventory_units"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_unit_status_history" ADD CONSTRAINT "inventory_history_actor_membership_tenant_fk" FOREIGN KEY ("client_organization_id","actor_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_unit_status_history" ADD CONSTRAINT "inventory_history_actor_user_membership_fk" FOREIGN KEY ("actor_user_id","actor_membership_id") REFERENCES "public"."memberships"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_branch_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id") REFERENCES "public"."branches"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_variant_tenant_fk" FOREIGN KEY ("client_organization_id","variant_id") REFERENCES "public"."inventory_variants"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_colour_tenant_fk" FOREIGN KEY ("client_organization_id","colour_id") REFERENCES "public"."inventory_colours"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_creator_membership_tenant_fk" FOREIGN KEY ("client_organization_id","created_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_creator_user_membership_fk" FOREIGN KEY ("created_by_user_id","created_by_membership_id") REFERENCES "public"."memberships"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_variants" ADD CONSTRAINT "inventory_variants_model_tenant_fk" FOREIGN KEY ("client_organization_id","model_id") REFERENCES "public"."inventory_models"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_allocations_active_unit_uidx" ON "inventory_allocations" USING btree ("client_organization_id","inventory_unit_id") WHERE "inventory_allocations"."status" = 'ACTIVE';--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_allocations_active_booking_uidx" ON "inventory_allocations" USING btree ("client_organization_id","booking_reference") WHERE "inventory_allocations"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "inventory_allocations_queue_idx" ON "inventory_allocations" USING btree ("client_organization_id","status","allocated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_brands_client_code_uidx" ON "inventory_brands" USING btree ("client_organization_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_colours_client_code_uidx" ON "inventory_colours" USING btree ("client_organization_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_command_receipts_key_uidx" ON "inventory_command_receipts" USING btree ("client_organization_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_models_client_brand_code_uidx" ON "inventory_models" USING btree ("client_organization_id","brand_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_reservations_active_unit_uidx" ON "inventory_reservations" USING btree ("client_organization_id","inventory_unit_id") WHERE "inventory_reservations"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "inventory_reservations_expiry_idx" ON "inventory_reservations" USING btree ("client_organization_id","status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_transfer_events_once_uidx" ON "inventory_transfer_events" USING btree ("client_organization_id","transfer_id","event_type");--> statement-breakpoint
CREATE INDEX "inventory_transfer_events_timeline_idx" ON "inventory_transfer_events" USING btree ("client_organization_id","transfer_id","created_at","id");--> statement-breakpoint
CREATE INDEX "inventory_transfers_unit_timeline_idx" ON "inventory_transfers" USING btree ("client_organization_id","inventory_unit_id","created_at","id");--> statement-breakpoint
CREATE INDEX "inventory_history_unit_timeline_idx" ON "inventory_unit_status_history" USING btree ("client_organization_id","inventory_unit_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_units_client_reference_uidx" ON "inventory_units" USING btree ("client_organization_id","unit_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_units_client_vin_uidx" ON "inventory_units" USING btree ("client_organization_id","vin") WHERE "inventory_units"."vin" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_units_client_chassis_uidx" ON "inventory_units" USING btree ("client_organization_id","chassis_number") WHERE "inventory_units"."chassis_number" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_units_client_engine_uidx" ON "inventory_units" USING btree ("client_organization_id","engine_number") WHERE "inventory_units"."engine_number" is not null;--> statement-breakpoint
CREATE INDEX "inventory_units_client_branch_status_idx" ON "inventory_units" USING btree ("client_organization_id","branch_id","status");--> statement-breakpoint
CREATE INDEX "inventory_units_client_variant_status_idx" ON "inventory_units" USING btree ("client_organization_id","variant_id","status");--> statement-breakpoint
CREATE INDEX "inventory_units_expected_arrival_idx" ON "inventory_units" USING btree ("client_organization_id","status","expected_arrival_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_variants_client_model_code_uidx" ON "inventory_variants" USING btree ("client_organization_id","model_id","code");--> statement-breakpoint
ALTER TABLE "test_ride_demo_vehicle_bookings" ADD CONSTRAINT "test_ride_vehicle_bookings_inventory_unit_tenant_fk" FOREIGN KEY ("client_organization_id","inventory_unit_id") REFERENCES "public"."inventory_units"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_jobs" ADD CONSTRAINT "test_ride_jobs_inventory_unit_tenant_fk" FOREIGN KEY ("client_organization_id","inventory_unit_id") REFERENCES "public"."inventory_units"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES
  ('inventory.catalogue.read', 'Read the tenant vehicle catalogue.'),
  ('inventory.catalogue.manage', 'Create tenant vehicle catalogue records.'),
  ('inventory.units.read', 'Read branch-scoped physical stock with masked identifiers.'),
  ('inventory.units.sensitive.read', 'Read full VIN, chassis and engine identifiers.'),
  ('inventory.units.manage', 'Create, receive and manage physical inventory units.'),
  ('inventory.reservations.manage', 'Create, extend, expire and release inventory reservations.'),
  ('inventory.allocations.manage', 'Allocate and release a physical unit for a booking.'),
  ('inventory.allocations.reallocate', 'Approve reasoned VIN reallocation between physical units.'),
  ('inventory.transfers.manage', 'Start and finish immutable branch transfers.'),
  ('inventory.corrections.manage', 'Perform controlled blocked, cancelled or removed corrections.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" IN ('AGENCY_ADMIN', 'CLIENT_ADMIN', 'MANAGER')
  AND p."code" LIKE 'inventory.%'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" = 'INVENTORY_EXECUTIVE'
  AND p."code" IN (
    'inventory.catalogue.read', 'inventory.catalogue.manage',
    'inventory.units.read', 'inventory.units.sensitive.read', 'inventory.units.manage',
    'inventory.reservations.manage', 'inventory.allocations.manage', 'inventory.transfers.manage'
  )
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."code" IN ('SALES_MANAGER', 'SALESPERSON', 'TEST_RIDE_EXECUTIVE', 'BILLING_DOCUMENTATION_EXECUTIVE', 'TEAM_MANAGER')
  AND p."code" IN ('inventory.catalogue.read', 'inventory.units.read')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_inventory_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'inventory history is append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER inventory_unit_status_history_immutable
BEFORE UPDATE OR DELETE ON "inventory_unit_status_history"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_history_mutation();
--> statement-breakpoint
CREATE TRIGGER inventory_transfers_immutable
BEFORE UPDATE OR DELETE ON "inventory_transfers"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_history_mutation();
--> statement-breakpoint
CREATE TRIGGER inventory_transfer_events_immutable
BEFORE UPDATE OR DELETE ON "inventory_transfer_events"
FOR EACH ROW EXECUTE FUNCTION prevent_inventory_history_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_inventory_transfer_terminal_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.event_type IN ('COMPLETED', 'CANCELLED') AND EXISTS (
    SELECT 1
    FROM inventory_transfer_events e
    WHERE e.client_organization_id = NEW.client_organization_id
      AND e.transfer_id = NEW.transfer_id
      AND e.event_type IN ('COMPLETED', 'CANCELLED')
  ) THEN
    RAISE EXCEPTION 'inventory transfer already has a terminal event';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER inventory_transfer_terminal_once
BEFORE INSERT ON "inventory_transfer_events"
FOR EACH ROW EXECUTE FUNCTION guard_inventory_transfer_terminal_event();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_inventory_unit_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF NOT (
    (OLD.status = 'EXPECTED' AND NEW.status IN ('AVAILABLE', 'CANCELLED', 'REMOVED')) OR
    (OLD.status = 'AVAILABLE' AND NEW.status IN ('RESERVED', 'ALLOCATED', 'DEMO', 'IN_TRANSFER', 'BLOCKED', 'CANCELLED', 'REMOVED')) OR
    (OLD.status = 'RESERVED' AND NEW.status IN ('AVAILABLE', 'ALLOCATED', 'BLOCKED', 'CANCELLED')) OR
    (OLD.status = 'ALLOCATED' AND NEW.status IN ('AVAILABLE', 'DELIVERED')) OR
    (OLD.status = 'DEMO' AND NEW.status IN ('AVAILABLE', 'IN_TRANSFER', 'BLOCKED', 'CANCELLED', 'REMOVED')) OR
    (OLD.status = 'IN_TRANSFER' AND NEW.status IN ('AVAILABLE', 'DEMO', 'BLOCKED')) OR
    (OLD.status = 'BLOCKED' AND NEW.status IN ('AVAILABLE', 'DEMO', 'IN_TRANSFER', 'CANCELLED', 'REMOVED')) OR
    (OLD.status = 'CANCELLED' AND NEW.status = 'REMOVED')
  ) THEN
    RAISE EXCEPTION 'invalid inventory transition from % to %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER inventory_units_status_transition_guard
BEFORE UPDATE OF "status" ON "inventory_units"
FOR EACH ROW EXECUTE FUNCTION guard_inventory_unit_status_transition();
