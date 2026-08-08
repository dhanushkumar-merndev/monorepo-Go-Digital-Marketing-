CREATE TYPE "public"."telephony_recording_source" AS ENUM('PROVIDER', 'MANUAL_UPLOAD');--> statement-breakpoint
ALTER TYPE "public"."telephony_call_origin" ADD VALUE 'MANUAL_UPLOAD';--> statement-breakpoint
ALTER TABLE "call_recordings" ADD COLUMN "source" "telephony_recording_source" DEFAULT 'PROVIDER' NOT NULL;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD COLUMN "original_filename" varchar(180);--> statement-breakpoint
ALTER TABLE "call_recordings" ADD COLUMN "mime_type" varchar(128);--> statement-breakpoint
ALTER TABLE "call_recordings" ADD COLUMN "size_bytes" integer;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD COLUMN "checksum_sha256" varchar(128);--> statement-breakpoint
ALTER TABLE "call_recordings" ADD COLUMN "uploaded_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD COLUMN "uploaded_by_membership_id" uuid;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD COLUMN "upload_notes" text;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_uploader_membership_tenant_fk" FOREIGN KEY ("client_organization_id","uploaded_by_membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_uploader_user_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_manual_upload_metadata_check" CHECK ("call_recordings"."source" <> 'MANUAL_UPLOAD' or ("call_recordings"."object_key" is not null and "call_recordings"."original_filename" is not null and "call_recordings"."mime_type" is not null and "call_recordings"."size_bytes" is not null and "call_recordings"."uploaded_by_user_id" is not null and "call_recordings"."uploaded_by_membership_id" is not null));--> statement-breakpoint
ALTER TABLE "call_recordings" ADD CONSTRAINT "call_recordings_size_bytes_check" CHECK ("call_recordings"."size_bytes" is null or "call_recordings"."size_bytes" >= 0);
--> statement-breakpoint
INSERT INTO "permissions" ("id", "code", "description") VALUES
  (gen_random_uuid(), 'telephony.recordings.upload', 'Create a private manual recording upload for an authorized Lead.')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description";
--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
JOIN "permissions" ON "permissions"."code" = 'telephony.recordings.upload'
WHERE "roles"."code" IN ('AGENCY_ADMIN', 'CLIENT_ADMIN', 'MANAGER', 'SALES_MANAGER', 'TEAM_MANAGER', 'TELECALLER', 'SALESPERSON')
ON CONFLICT DO NOTHING;
