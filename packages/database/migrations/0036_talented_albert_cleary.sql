ALTER TABLE "users" ADD COLUMN "supabase_auth_user_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "users_supabase_auth_user_id_uidx" ON "users" USING btree ("supabase_auth_user_id");