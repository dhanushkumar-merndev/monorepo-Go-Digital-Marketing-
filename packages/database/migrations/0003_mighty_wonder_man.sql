CREATE TYPE "public"."external_auth_challenge_purpose" AS ENUM('LOGIN', 'LINK');--> statement-breakpoint
ALTER TYPE "public"."authentication_audit_event_type" ADD VALUE 'IDENTITY_LINKED';--> statement-breakpoint
ALTER TYPE "public"."authentication_audit_event_type" ADD VALUE 'IDENTITY_UNLINKED';--> statement-breakpoint
ALTER TYPE "public"."authentication_audit_event_type" ADD VALUE 'INVITATION_ACTIVATED';--> statement-breakpoint
-- PostgreSQL permits enum values to be added transactionally when the new
-- values are not referenced until a later transaction. This migration only
-- extends the enum; runtime audit inserts begin after deployment.
--
-- Fail explicitly instead of guessing how to merge legacy identity rows or
-- inventing a verified provider email for a previously hand-written row.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "authentication_identities"
		GROUP BY "user_id", "provider", "provider_key"
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Google auth preflight failed: duplicate authentication providers exist for one user'
			USING ERRCODE = '23514';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "authentication_identities"
		WHERE "provider" = 'OAUTH' AND "provider_key" = 'GOOGLE'
	) THEN
		RAISE EXCEPTION 'Google auth preflight failed: existing Google identities require verified-email reconciliation'
			USING ERRCODE = '23514';
	END IF;
END;
$$;--> statement-breakpoint
CREATE TABLE "external_auth_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purpose" "external_auth_challenge_purpose" NOT NULL,
	"client_type" "auth_client_type" NOT NULL,
	"nonce_hash" varchar(64) NOT NULL,
	"user_id" uuid,
	"session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "external_auth_challenges_binding_check" CHECK ((
        "external_auth_challenges"."purpose" = 'LOGIN'
        AND "external_auth_challenges"."user_id" IS NULL
        AND "external_auth_challenges"."session_id" IS NULL
      ) OR (
        "external_auth_challenges"."purpose" = 'LINK'
        AND "external_auth_challenges"."user_id" IS NOT NULL
        AND "external_auth_challenges"."session_id" IS NOT NULL
      )),
	CONSTRAINT "external_auth_challenges_nonce_hash_check" CHECK (char_length("external_auth_challenges"."nonce_hash") = 64 AND "external_auth_challenges"."nonce_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "external_auth_challenges_expiry_check" CHECK ("external_auth_challenges"."expires_at" > "external_auth_challenges"."created_at"),
	CONSTRAINT "external_auth_challenges_consumed_check" CHECK ("external_auth_challenges"."consumed_at" IS NULL OR "external_auth_challenges"."consumed_at" >= "external_auth_challenges"."created_at")
);
--> statement-breakpoint
ALTER TABLE "authentication_identities" DROP CONSTRAINT "authentication_identities_credentials_check";--> statement-breakpoint
ALTER TABLE "authentication_identities" ADD COLUMN "provider_email_normalized" varchar(320);--> statement-breakpoint
ALTER TABLE "external_auth_challenges" ADD CONSTRAINT "external_auth_challenges_user_session_fk" FOREIGN KEY ("user_id","session_id") REFERENCES "public"."refresh_sessions"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_auth_challenges_nonce_hash_uidx" ON "external_auth_challenges" USING btree ("nonce_hash");--> statement-breakpoint
CREATE INDEX "external_auth_challenges_expiry_idx" ON "external_auth_challenges" USING btree ("consumed_at","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "authentication_identities_user_provider_uidx" ON "authentication_identities" USING btree ("user_id","provider","provider_key");--> statement-breakpoint
ALTER TABLE "authentication_identities" ADD CONSTRAINT "authentication_identities_credentials_check" CHECK ((
        "authentication_identities"."provider" = 'PASSWORD'
        AND "authentication_identities"."provider_key" = 'LOCAL'
        AND "authentication_identities"."password_digest" IS NOT NULL
        AND "authentication_identities"."password_salt" IS NOT NULL
        AND "authentication_identities"."password_scrypt_n" >= 16384
        AND "authentication_identities"."password_scrypt_r" >= 8
        AND "authentication_identities"."password_scrypt_p" >= 1
        AND "authentication_identities"."password_key_length" >= 32
        AND "authentication_identities"."provider_email_normalized" IS NULL
      ) OR (
        "authentication_identities"."provider" = 'OAUTH'
        AND "authentication_identities"."provider_key" <> 'LOCAL'
        AND (
          "authentication_identities"."provider_key" <> 'GOOGLE'
          OR (
            "authentication_identities"."provider_email_normalized" IS NOT NULL
            AND "authentication_identities"."verified_at" IS NOT NULL
          )
        )
        AND "authentication_identities"."password_digest" IS NULL
        AND "authentication_identities"."password_salt" IS NULL
        AND "authentication_identities"."password_scrypt_n" IS NULL
        AND "authentication_identities"."password_scrypt_r" IS NULL
        AND "authentication_identities"."password_scrypt_p" IS NULL
        AND "authentication_identities"."password_key_length" IS NULL
      ));
