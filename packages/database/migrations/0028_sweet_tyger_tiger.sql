ALTER TABLE "delivery_location_samples" DROP CONSTRAINT "delivery_locations_session_tenant_fk";
--> statement-breakpoint
ALTER TABLE "delivery_location_sessions" ADD CONSTRAINT "delivery_location_sessions_job_identity_unique" UNIQUE("client_organization_id","id","delivery_job_id");--> statement-breakpoint
ALTER TABLE "delivery_location_samples" ADD CONSTRAINT "delivery_locations_session_identity_fk" FOREIGN KEY ("client_organization_id","location_session_id","delivery_job_id") REFERENCES "public"."delivery_location_sessions"("client_organization_id","id","delivery_job_id") ON DELETE restrict ON UPDATE no action;
