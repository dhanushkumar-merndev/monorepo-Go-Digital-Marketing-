CREATE TYPE "public"."mfa_authenticator_status" AS ENUM('PENDING', 'ACTIVE', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."mfa_challenge_kind" AS ENUM('ENROLLMENT', 'VERIFICATION');--> statement-breakpoint
CREATE TYPE "public"."mfa_login_provider" AS ENUM('PASSWORD', 'GOOGLE');--> statement-breakpoint
ALTER TYPE "public"."authentication_audit_event_type" ADD VALUE 'MFA_CHALLENGE_ISSUED';--> statement-breakpoint
ALTER TYPE "public"."authentication_audit_event_type" ADD VALUE 'MFA_ENROLLMENT_STARTED';--> statement-breakpoint
ALTER TYPE "public"."authentication_audit_event_type" ADD VALUE 'MFA_ENROLLMENT_COMPLETED';--> statement-breakpoint
ALTER TYPE "public"."authentication_audit_event_type" ADD VALUE 'MFA_VERIFICATION_SUCCEEDED';--> statement-breakpoint
ALTER TYPE "public"."authentication_audit_event_type" ADD VALUE 'MFA_VERIFICATION_FAILED';--> statement-breakpoint
ALTER TYPE "public"."authentication_audit_event_type" ADD VALUE 'MFA_RECOVERY_CODE_USED';--> statement-breakpoint
CREATE TABLE "mfa_authenticators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "mfa_authenticator_status" DEFAULT 'PENDING' NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"secret_nonce" varchar(64) NOT NULL,
	"secret_auth_tag" varchar(64) NOT NULL,
	"secret_key_id" varchar(64) NOT NULL,
	"last_accepted_time_step" integer,
	"confirmed_at" timestamp with time zone,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mfa_authenticators_user_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "mfa_authenticators_secret_check" CHECK (char_length("mfa_authenticators"."secret_ciphertext") >= 16
        AND char_length("mfa_authenticators"."secret_nonce") >= 16
        AND char_length("mfa_authenticators"."secret_auth_tag") >= 16
        AND char_length(trim("mfa_authenticators"."secret_key_id")) >= 1),
	CONSTRAINT "mfa_authenticators_time_step_check" CHECK ("mfa_authenticators"."last_accepted_time_step" IS NULL OR "mfa_authenticators"."last_accepted_time_step" >= 0),
	CONSTRAINT "mfa_authenticators_status_check" CHECK ((
        "mfa_authenticators"."status" = 'PENDING'
        AND "mfa_authenticators"."confirmed_at" IS NULL
        AND "mfa_authenticators"."disabled_at" IS NULL
      ) OR (
        "mfa_authenticators"."status" = 'ACTIVE'
        AND "mfa_authenticators"."confirmed_at" IS NOT NULL
        AND "mfa_authenticators"."disabled_at" IS NULL
      ) OR (
        "mfa_authenticators"."status" = 'DISABLED'
        AND "mfa_authenticators"."disabled_at" IS NOT NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "mfa_login_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"user_id" uuid NOT NULL,
	"authentication_identity_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"authenticator_id" uuid,
	"kind" "mfa_challenge_kind" NOT NULL,
	"provider" "mfa_login_provider" NOT NULL,
	"client_type" "auth_client_type" NOT NULL,
	"device_id" varchar(128) NOT NULL,
	"device_name" varchar(120) NOT NULL,
	"device_platform" "device_platform" DEFAULT 'UNKNOWN' NOT NULL,
	"source_ip" "inet",
	"user_agent" text,
	"failed_attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "mfa_login_challenges_token_hash_check" CHECK (char_length("mfa_login_challenges"."token_hash") = 64 AND "mfa_login_challenges"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "mfa_login_challenges_binding_check" CHECK ("mfa_login_challenges"."kind" = 'ENROLLMENT'
        OR ("mfa_login_challenges"."kind" = 'VERIFICATION' AND "mfa_login_challenges"."authenticator_id" IS NOT NULL)),
	CONSTRAINT "mfa_login_challenges_attempt_check" CHECK ("mfa_login_challenges"."failed_attempt_count" >= 0 AND "mfa_login_challenges"."failed_attempt_count" <= 10),
	CONSTRAINT "mfa_login_challenges_expiry_check" CHECK ("mfa_login_challenges"."expires_at" > "mfa_login_challenges"."created_at"
        AND "mfa_login_challenges"."expires_at" <= "mfa_login_challenges"."created_at" + interval '10 minutes'),
	CONSTRAINT "mfa_login_challenges_consumed_check" CHECK ("mfa_login_challenges"."consumed_at" IS NULL OR "mfa_login_challenges"."consumed_at" >= "mfa_login_challenges"."created_at")
);
--> statement-breakpoint
CREATE TABLE "mfa_recovery_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"authenticator_id" uuid NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"used_at" timestamp with time zone,
	"replaced_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mfa_recovery_codes_hash_check" CHECK (char_length("mfa_recovery_codes"."code_hash") = 64 AND "mfa_recovery_codes"."code_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "mfa_recovery_codes_replacement_check" CHECK ("mfa_recovery_codes"."replaced_by_id" IS NULL OR "mfa_recovery_codes"."used_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "mfa_authenticators" ADD CONSTRAINT "mfa_authenticators_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_login_challenges" ADD CONSTRAINT "mfa_login_challenges_user_identity_fk" FOREIGN KEY ("user_id","authentication_identity_id") REFERENCES "public"."authentication_identities"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_login_challenges" ADD CONSTRAINT "mfa_login_challenges_user_membership_fk" FOREIGN KEY ("user_id","membership_id") REFERENCES "public"."memberships"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_login_challenges" ADD CONSTRAINT "mfa_login_challenges_user_authenticator_fk" FOREIGN KEY ("user_id","authenticator_id") REFERENCES "public"."mfa_authenticators"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_replaced_by_id_mfa_recovery_codes_id_fk" FOREIGN KEY ("replaced_by_id") REFERENCES "public"."mfa_recovery_codes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mfa_recovery_codes" ADD CONSTRAINT "mfa_recovery_codes_user_authenticator_fk" FOREIGN KEY ("user_id","authenticator_id") REFERENCES "public"."mfa_authenticators"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mfa_authenticators_user_current_uidx" ON "mfa_authenticators" USING btree ("user_id") WHERE "mfa_authenticators"."status" <> 'DISABLED';--> statement-breakpoint
CREATE INDEX "mfa_authenticators_user_status_idx" ON "mfa_authenticators" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "mfa_login_challenges_token_hash_uidx" ON "mfa_login_challenges" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "mfa_login_challenges_active_idx" ON "mfa_login_challenges" USING btree ("user_id","consumed_at","expires_at");--> statement-breakpoint
CREATE INDEX "mfa_login_challenges_expiry_idx" ON "mfa_login_challenges" USING btree ("consumed_at","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mfa_recovery_codes_hash_uidx" ON "mfa_recovery_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE INDEX "mfa_recovery_codes_authenticator_active_idx" ON "mfa_recovery_codes" USING btree ("authenticator_id","used_at");