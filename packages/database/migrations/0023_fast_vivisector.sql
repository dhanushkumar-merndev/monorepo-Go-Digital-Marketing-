ALTER TABLE "test_ride_demo_vehicle_bookings" DROP CONSTRAINT "test_ride_vehicle_bookings_inventory_unit_tenant_fk";
--> statement-breakpoint
ALTER TABLE "test_ride_jobs" DROP CONSTRAINT "test_ride_jobs_inventory_unit_tenant_fk";
--> statement-breakpoint
ALTER TABLE "inventory_units" DROP CONSTRAINT "inventory_units_client_branch_id_unique";--> statement-breakpoint
ALTER TABLE "test_ride_demo_vehicle_bookings" ADD CONSTRAINT "test_ride_vehicle_bookings_inventory_unit_tenant_fk" FOREIGN KEY ("client_organization_id","inventory_unit_id") REFERENCES "public"."inventory_units"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_jobs" ADD CONSTRAINT "test_ride_jobs_inventory_unit_tenant_fk" FOREIGN KEY ("client_organization_id","inventory_unit_id") REFERENCES "public"."inventory_units"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;
