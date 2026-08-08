CREATE TABLE "test_ride_allocation_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"resource_type" varchar(24) NOT NULL,
	"resource_reference" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_ride_allocation_locks_type_check" CHECK ("test_ride_allocation_locks"."resource_type" in ('VEHICLE', 'EXECUTIVE'))
);
--> statement-breakpoint
ALTER TABLE "test_ride_allocation_locks" ADD CONSTRAINT "test_ride_allocation_locks_client_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_ride_allocation_locks" ADD CONSTRAINT "test_ride_allocation_locks_branch_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id") REFERENCES "public"."branches"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "test_ride_allocation_locks_resource_uidx" ON "test_ride_allocation_locks" USING btree ("client_organization_id","branch_id","resource_type","resource_reference");