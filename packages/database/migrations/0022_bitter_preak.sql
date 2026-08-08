DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM test_ride_jobs j
    JOIN inventory_units u
      ON u.client_organization_id = j.client_organization_id
     AND u.id = j.inventory_unit_id
    WHERE j.inventory_unit_id IS NOT NULL
      AND j.branch_id <> u.branch_id
  ) OR EXISTS (
    SELECT 1
    FROM test_ride_demo_vehicle_bookings b
    JOIN inventory_units u
      ON u.client_organization_id = b.client_organization_id
     AND u.id = b.inventory_unit_id
    WHERE b.inventory_unit_id IS NOT NULL
      AND b.branch_id <> u.branch_id
  ) THEN
    RAISE EXCEPTION 'Phase 7 inventory reconciliation found a test-ride/unit branch mismatch; resolve explicitly without rewriting ride history';
  END IF;
END;
$$;
--> statement-breakpoint
ALTER TABLE "inventory_units" ADD CONSTRAINT "inventory_units_client_branch_id_unique" UNIQUE("client_organization_id","branch_id","id");
--> statement-breakpoint
ALTER TABLE "test_ride_demo_vehicle_bookings" DROP CONSTRAINT "test_ride_vehicle_bookings_inventory_unit_tenant_fk";
--> statement-breakpoint
ALTER TABLE "test_ride_jobs" DROP CONSTRAINT "test_ride_jobs_inventory_unit_tenant_fk";
--> statement-breakpoint
ALTER TABLE "test_ride_demo_vehicle_bookings" ADD CONSTRAINT "test_ride_vehicle_bookings_inventory_unit_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id","inventory_unit_id") REFERENCES "public"."inventory_units"("client_organization_id","branch_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_jobs" ADD CONSTRAINT "test_ride_jobs_inventory_unit_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id","inventory_unit_id") REFERENCES "public"."inventory_units"("client_organization_id","branch_id","id") ON DELETE restrict ON UPDATE no action;
