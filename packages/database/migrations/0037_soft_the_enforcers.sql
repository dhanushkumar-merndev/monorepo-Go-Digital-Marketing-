CREATE INDEX "lead_opportunities_client_captured_idx" ON "lead_opportunities" USING btree ("client_organization_id","captured_at","id");--> statement-breakpoint
CREATE INDEX "calls_client_created_idx" ON "calls" USING btree ("client_organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX "inventory_units_status_received_idx" ON "inventory_units" USING btree ("client_organization_id","status","received_at","id");--> statement-breakpoint
CREATE INDEX "bookings_client_created_idx" ON "bookings" USING btree ("client_organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX "finance_cases_client_created_idx" ON "finance_cases" USING btree ("client_organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX "insurance_cases_client_created_idx" ON "insurance_cases" USING btree ("client_organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX "delivery_jobs_client_schedule_idx" ON "delivery_jobs" USING btree ("client_organization_id","scheduled_for","status","id");--> statement-breakpoint
CREATE INDEX "customer_vehicles_client_created_idx" ON "customer_vehicles" USING btree ("client_organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX "registration_cases_client_created_idx" ON "registration_cases" USING btree ("client_organization_id","created_at","status","id");--> statement-breakpoint
CREATE INDEX "registration_cases_status_changed_idx" ON "registration_cases" USING btree ("client_organization_id","status_changed_at","id");