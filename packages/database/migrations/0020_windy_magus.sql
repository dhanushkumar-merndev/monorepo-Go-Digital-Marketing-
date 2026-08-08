DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "test_ride_location_samples" sample
		JOIN "test_ride_location_sessions" session
			ON session."client_organization_id" = sample."client_organization_id"
			AND session."id" = sample."location_session_id"
		WHERE session."test_ride_job_id" <> sample."test_ride_job_id"
			OR session."executive_user_id" <> sample."executive_user_id"
	) THEN
		RAISE EXCEPTION 'Phase 6 location sample/session identity mismatch; migration refuses to remap IDs or history.';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "test_ride_location_sessions" ADD CONSTRAINT "test_ride_location_sessions_sample_identity_unique" UNIQUE("client_organization_id","id","test_ride_job_id","executive_user_id");--> statement-breakpoint
ALTER TABLE "test_ride_location_samples" ADD CONSTRAINT "test_ride_locations_session_identity_fk" FOREIGN KEY ("client_organization_id","location_session_id","test_ride_job_id","executive_user_id") REFERENCES "public"."test_ride_location_sessions"("client_organization_id","id","test_ride_job_id","executive_user_id") ON DELETE restrict ON UPDATE no action;
