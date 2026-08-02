CREATE TYPE "public"."agency_status" AS ENUM('ACTIVE', 'SUSPENDED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."assignment_scope" AS ENUM('ALL', 'TEAM', 'OWNED', 'ASSIGNED', 'OWNED_OR_ASSIGNED', 'NONE');--> statement-breakpoint
CREATE TYPE "public"."auth_client_type" AS ENUM('WEB', 'MOBILE');--> statement-breakpoint
CREATE TYPE "public"."authentication_audit_event_type" AS ENUM('LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'REFRESH_SUCCEEDED', 'REFRESH_FAILED', 'REFRESH_REUSE_DETECTED', 'LOGOUT', 'LOGOUT_ALL', 'SESSION_REVOKED', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_SUCCEEDED', 'PASSWORD_RESET_FAILED', 'MEMBERSHIP_SWITCHED', 'SUPPORT_ELEVATION_STARTED', 'SUPPORT_ELEVATION_REVOKED', 'SUPPORT_ELEVATION_EXPIRED', 'ACCESS_DENIED', 'ACCOUNT_STATUS_BLOCKED');--> statement-breakpoint
CREATE TYPE "public"."authentication_identity_status" AS ENUM('ACTIVE', 'SUSPENDED', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."authentication_provider" AS ENUM('PASSWORD', 'OAUTH');--> statement-breakpoint
CREATE TYPE "public"."canonical_role_code" AS ENUM('AGENCY_ADMIN', 'CLIENT_ADMIN', 'MANAGER', 'SALES_MANAGER', 'TELECALLER', 'SALESPERSON', 'TEST_RIDE_EXECUTIVE', 'INVENTORY_EXECUTIVE', 'BILLING_DOCUMENTATION_EXECUTIVE', 'DELIVERY_EXECUTIVE', 'RC_REGISTRATION_EXECUTIVE');--> statement-breakpoint
CREATE TYPE "public"."client_organization_status" AS ENUM('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."device_platform" AS ENUM('WEB', 'ANDROID', 'IOS', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."membership_context_type" AS ENUM('AGENCY', 'CLIENT');--> statement-breakpoint
CREATE TYPE "public"."membership_scope_mode" AS ENUM('ALL', 'SELECTED', 'NONE');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('INVITED', 'ACTIVE', 'SUSPENDED', 'ENDED');--> statement-breakpoint
CREATE TYPE "public"."permission_code" AS ENUM('account.profile.read', 'account.profile.update', 'account.sessions.read', 'account.sessions.revoke', 'account.tenant.select', 'organization.clients.read', 'organization.branches.read', 'organization.teams.read', 'organization.users.read', 'organization.users.manage', 'organization.roles.read', 'organization.roles.manage', 'organization.sessions.manage', 'platform.agencies.manage', 'platform.clients.manage', 'platform.support_elevation.manage');--> statement-breakpoint
CREATE TYPE "public"."role_application" AS ENUM('WEB', 'MOBILE');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED');--> statement-breakpoint
CREATE TABLE "agencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"legal_name" varchar(240) NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"status" "agency_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agencies_code_not_blank_check" CHECK (char_length(trim("agencies"."code")) > 0)
);
--> statement-breakpoint
CREATE TABLE "authentication_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "event_scope" NOT NULL,
	"client_organization_id" uuid,
	"user_id" uuid,
	"session_id" uuid,
	"membership_id" uuid,
	"support_elevation_id" uuid,
	"event_type" "authentication_audit_event_type" NOT NULL,
	"outcome" "audit_outcome" NOT NULL,
	"identifier_hash" varchar(64),
	"reason_code" varchar(160),
	"correlation_id" varchar(128) NOT NULL,
	"source_ip" "inet",
	"user_agent" text,
	"device_id" varchar(128),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authentication_audit_events_scope_client_check" CHECK (("authentication_audit_events"."scope" = 'PLATFORM' AND "authentication_audit_events"."client_organization_id" IS NULL) OR ("authentication_audit_events"."scope" = 'CLIENT' AND "authentication_audit_events"."client_organization_id" IS NOT NULL)),
	CONSTRAINT "authentication_audit_events_identifier_hash_check" CHECK ("authentication_audit_events"."identifier_hash" IS NULL OR (char_length("authentication_audit_events"."identifier_hash") = 64 AND "authentication_audit_events"."identifier_hash" ~ '^[0-9a-f]{64}$'))
);
--> statement-breakpoint
CREATE TABLE "authentication_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "authentication_provider" NOT NULL,
	"provider_key" varchar(64) NOT NULL,
	"subject_normalized" varchar(320) NOT NULL,
	"status" "authentication_identity_status" DEFAULT 'ACTIVE' NOT NULL,
	"password_digest" varchar(128),
	"password_salt" varchar(128),
	"password_scrypt_n" integer,
	"password_scrypt_r" integer,
	"password_scrypt_p" integer,
	"password_key_length" integer,
	"failed_attempt_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"last_authenticated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authentication_identities_user_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "authentication_identities_failed_attempt_count_check" CHECK ("authentication_identities"."failed_attempt_count" >= 0),
	CONSTRAINT "authentication_identities_credentials_check" CHECK ((
        "authentication_identities"."provider" = 'PASSWORD'
        AND "authentication_identities"."provider_key" = 'LOCAL'
        AND "authentication_identities"."password_digest" IS NOT NULL
        AND "authentication_identities"."password_salt" IS NOT NULL
        AND "authentication_identities"."password_scrypt_n" >= 16384
        AND "authentication_identities"."password_scrypt_r" >= 8
        AND "authentication_identities"."password_scrypt_p" >= 1
        AND "authentication_identities"."password_key_length" >= 32
      ) OR (
        "authentication_identities"."provider" = 'OAUTH'
        AND "authentication_identities"."password_digest" IS NULL
        AND "authentication_identities"."password_salt" IS NULL
        AND "authentication_identities"."password_scrypt_n" IS NULL
        AND "authentication_identities"."password_scrypt_r" IS NULL
        AND "authentication_identities"."password_scrypt_p" IS NULL
        AND "authentication_identities"."password_key_length" IS NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "branches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"timezone" varchar(64) DEFAULT 'Asia/Kolkata' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branches_client_id_unique" UNIQUE("client_organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "client_organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"legal_name" varchar(240) NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"status" "client_organization_status" DEFAULT 'PENDING' NOT NULL,
	"timezone" varchar(64) DEFAULT 'Asia/Kolkata' NOT NULL,
	"settings_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_organizations_settings_version_check" CHECK ("client_organizations"."settings_version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "membership_branch_scopes" (
	"client_organization_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_branch_scopes_pk" PRIMARY KEY("membership_id","branch_id")
);
--> statement-breakpoint
CREATE TABLE "membership_team_scopes" (
	"client_organization_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_team_scopes_pk" PRIMARY KEY("membership_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"context_type" "membership_context_type" NOT NULL,
	"agency_id" uuid,
	"client_organization_id" uuid,
	"role_id" uuid NOT NULL,
	"status" "membership_status" DEFAULT 'INVITED' NOT NULL,
	"branch_scope_mode" "membership_scope_mode" DEFAULT 'NONE' NOT NULL,
	"team_scope_mode" "membership_scope_mode" DEFAULT 'NONE' NOT NULL,
	"assignment_scope" "assignment_scope" DEFAULT 'NONE' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_id_context_unique" UNIQUE("id","context_type"),
	CONSTRAINT "memberships_user_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "memberships_client_id_unique" UNIQUE("client_organization_id","id"),
	CONSTRAINT "memberships_context_check" CHECK ((
        "memberships"."context_type" = 'AGENCY'
        AND "memberships"."agency_id" IS NOT NULL
        AND "memberships"."client_organization_id" IS NULL
        AND "memberships"."branch_scope_mode" = 'NONE'
        AND "memberships"."team_scope_mode" = 'NONE'
        AND "memberships"."assignment_scope" = 'NONE'
      ) OR (
        "memberships"."context_type" = 'CLIENT'
        AND "memberships"."agency_id" IS NULL
        AND "memberships"."client_organization_id" IS NOT NULL
      )),
	CONSTRAINT "memberships_effective_window_check" CHECK ("memberships"."effective_until" IS NULL OR "memberships"."effective_until" > "memberships"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"authentication_identity_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"request_correlation_id" varchar(128) NOT NULL,
	"source_ip" "inet",
	"user_agent" text,
	CONSTRAINT "password_reset_tokens_expiry_check" CHECK ("password_reset_tokens"."expires_at" > "password_reset_tokens"."requested_at"),
	CONSTRAINT "password_reset_tokens_terminal_state_check" CHECK ("password_reset_tokens"."used_at" IS NULL OR "password_reset_tokens"."revoked_at" IS NULL),
	CONSTRAINT "password_reset_tokens_hash_check" CHECK (char_length("password_reset_tokens"."token_hash") = 64 AND "password_reset_tokens"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" "permission_code" NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"authentication_identity_id" uuid NOT NULL,
	"current_membership_id" uuid,
	"client_type" "auth_client_type" NOT NULL,
	"device_id" varchar(128),
	"device_name" varchar(120),
	"device_platform" "device_platform" DEFAULT 'UNKNOWN' NOT NULL,
	"refresh_token_version" integer DEFAULT 1 NOT NULL,
	"source_ip" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" varchar(160),
	"compromised_at" timestamp with time zone,
	CONSTRAINT "refresh_sessions_user_id_unique" UNIQUE("user_id","id"),
	CONSTRAINT "refresh_sessions_token_version_check" CHECK ("refresh_sessions"."refresh_token_version" >= 1),
	CONSTRAINT "refresh_sessions_expiry_check" CHECK ("refresh_sessions"."expires_at" > "refresh_sessions"."created_at"),
	CONSTRAINT "refresh_sessions_revocation_check" CHECK (("refresh_sessions"."revoked_at" IS NULL AND "refresh_sessions"."revoked_reason" IS NULL) OR "refresh_sessions"."revoked_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "refresh_token_rotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"parent_rotation_id" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "refresh_token_rotations_sequence_check" CHECK ("refresh_token_rotations"."sequence" >= 1),
	CONSTRAINT "refresh_token_rotations_expiry_check" CHECK ("refresh_token_rotations"."expires_at" > "refresh_token_rotations"."issued_at"),
	CONSTRAINT "refresh_token_rotations_hash_check" CHECK (char_length("refresh_token_rotations"."token_hash") = 64 AND "refresh_token_rotations"."token_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "role_permission_mappings" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permission_mappings_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" "canonical_role_code" NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"context_type" "membership_context_type" NOT NULL,
	"application" "role_application" NOT NULL,
	"description" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_id_context_unique" UNIQUE("id","context_type")
);
--> statement-breakpoint
CREATE TABLE "support_elevations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"actor_membership_id" uuid NOT NULL,
	"actor_membership_context" "membership_context_type" DEFAULT 'AGENCY' NOT NULL,
	"actor_session_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"revoke_reason" text,
	CONSTRAINT "support_elevations_actor_context_check" CHECK ("support_elevations"."actor_membership_context" = 'AGENCY'),
	CONSTRAINT "support_elevations_reason_check" CHECK (char_length(trim("support_elevations"."reason")) >= 10),
	CONSTRAINT "support_elevations_expiry_check" CHECK ("support_elevations"."expires_at" > "support_elevations"."created_at" AND "support_elevations"."expires_at" <= "support_elevations"."created_at" + interval '60 minutes'),
	CONSTRAINT "support_elevations_revocation_check" CHECK (("support_elevations"."revoked_at" IS NULL AND "support_elevations"."revoked_by_user_id" IS NULL AND "support_elevations"."revoke_reason" IS NULL) OR "support_elevations"."revoked_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_organization_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_client_branch_id_unique" UNIQUE("client_organization_id","branch_id","id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"primary_email_normalized" varchar(320) NOT NULL,
	"status" "user_status" DEFAULT 'INVITED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"suspended_at" timestamp with time zone,
	"deactivated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "authentication_audit_events" ADD CONSTRAINT "authentication_audit_events_client_organization_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication_audit_events" ADD CONSTRAINT "authentication_audit_events_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication_audit_events" ADD CONSTRAINT "authentication_audit_events_session_fk" FOREIGN KEY ("session_id") REFERENCES "public"."refresh_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication_audit_events" ADD CONSTRAINT "authentication_audit_events_membership_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication_audit_events" ADD CONSTRAINT "authentication_audit_events_support_elevation_fk" FOREIGN KEY ("support_elevation_id") REFERENCES "public"."support_elevations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authentication_identities" ADD CONSTRAINT "authentication_identities_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branches" ADD CONSTRAINT "branches_client_organization_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_organizations" ADD CONSTRAINT "client_organizations_agency_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_branch_scopes" ADD CONSTRAINT "membership_branch_scopes_membership_tenant_fk" FOREIGN KEY ("client_organization_id","membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_branch_scopes" ADD CONSTRAINT "membership_branch_scopes_branch_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id") REFERENCES "public"."branches"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_team_scopes" ADD CONSTRAINT "membership_team_scopes_membership_tenant_fk" FOREIGN KEY ("client_organization_id","membership_id") REFERENCES "public"."memberships"("client_organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_team_scopes" ADD CONSTRAINT "membership_team_scopes_team_tenant_fk" FOREIGN KEY ("client_organization_id","branch_id","team_id") REFERENCES "public"."teams"("client_organization_id","branch_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_context_fk" FOREIGN KEY ("role_id","context_type") REFERENCES "public"."roles"("id","context_type") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_agency_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_client_organization_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_identity_fk" FOREIGN KEY ("user_id","authentication_identity_id") REFERENCES "public"."authentication_identities"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_identity_fk" FOREIGN KEY ("user_id","authentication_identity_id") REFERENCES "public"."authentication_identities"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_membership_fk" FOREIGN KEY ("user_id","current_membership_id") REFERENCES "public"."memberships"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_token_rotations" ADD CONSTRAINT "refresh_token_rotations_parent_rotation_id_refresh_token_rotations_id_fk" FOREIGN KEY ("parent_rotation_id") REFERENCES "public"."refresh_token_rotations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_token_rotations" ADD CONSTRAINT "refresh_token_rotations_session_fk" FOREIGN KEY ("session_id") REFERENCES "public"."refresh_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission_mappings" ADD CONSTRAINT "role_permission_mappings_role_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permission_mappings" ADD CONSTRAINT "role_permission_mappings_permission_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_elevations" ADD CONSTRAINT "support_elevations_client_organization_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_elevations" ADD CONSTRAINT "support_elevations_actor_membership_fk" FOREIGN KEY ("actor_user_id","actor_membership_id") REFERENCES "public"."memberships"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_elevations" ADD CONSTRAINT "support_elevations_actor_context_fk" FOREIGN KEY ("actor_membership_id","actor_membership_context") REFERENCES "public"."memberships"("id","context_type") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_elevations" ADD CONSTRAINT "support_elevations_actor_session_fk" FOREIGN KEY ("actor_user_id","actor_session_id") REFERENCES "public"."refresh_sessions"("user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_elevations" ADD CONSTRAINT "support_elevations_revoked_by_user_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_client_branch_fk" FOREIGN KEY ("client_organization_id","branch_id") REFERENCES "public"."branches"("client_organization_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agencies_code_uidx" ON "agencies" USING btree ("code");--> statement-breakpoint
CREATE INDEX "agencies_status_idx" ON "agencies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "authentication_audit_events_client_created_idx" ON "authentication_audit_events" USING btree ("client_organization_id","created_at");--> statement-breakpoint
CREATE INDEX "authentication_audit_events_user_created_idx" ON "authentication_audit_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "authentication_audit_events_session_created_idx" ON "authentication_audit_events" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "authentication_audit_events_correlation_idx" ON "authentication_audit_events" USING btree ("correlation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "authentication_identities_provider_subject_uidx" ON "authentication_identities" USING btree ("provider","provider_key","subject_normalized");--> statement-breakpoint
CREATE INDEX "authentication_identities_user_status_idx" ON "authentication_identities" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "authentication_identities_lockout_idx" ON "authentication_identities" USING btree ("status","locked_until");--> statement-breakpoint
CREATE UNIQUE INDEX "branches_client_code_uidx" ON "branches" USING btree ("client_organization_id","code");--> statement-breakpoint
CREATE INDEX "branches_client_active_idx" ON "branches" USING btree ("client_organization_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "client_organizations_agency_code_uidx" ON "client_organizations" USING btree ("agency_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "client_organizations_id_agency_uidx" ON "client_organizations" USING btree ("id","agency_id");--> statement-breakpoint
CREATE INDEX "client_organizations_agency_status_idx" ON "client_organizations" USING btree ("agency_id","status");--> statement-breakpoint
CREATE INDEX "membership_branch_scopes_client_branch_idx" ON "membership_branch_scopes" USING btree ("client_organization_id","branch_id");--> statement-breakpoint
CREATE INDEX "membership_team_scopes_client_team_idx" ON "membership_team_scopes" USING btree ("client_organization_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_active_agency_uidx" ON "memberships" USING btree ("user_id","agency_id") WHERE "memberships"."status" = 'ACTIVE' AND "memberships"."agency_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_active_client_uidx" ON "memberships" USING btree ("user_id","client_organization_id") WHERE "memberships"."status" = 'ACTIVE' AND "memberships"."client_organization_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "memberships_user_status_idx" ON "memberships" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "memberships_client_status_idx" ON "memberships" USING btree ("client_organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_uidx" ON "password_reset_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_user_requested_idx" ON "password_reset_tokens" USING btree ("user_id","requested_at");--> statement-breakpoint
CREATE INDEX "password_reset_tokens_expiry_idx" ON "password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_code_uidx" ON "permissions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "refresh_sessions_user_active_idx" ON "refresh_sessions" USING btree ("user_id","revoked_at","expires_at");--> statement-breakpoint
CREATE INDEX "refresh_sessions_membership_idx" ON "refresh_sessions" USING btree ("current_membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_token_rotations_token_hash_uidx" ON "refresh_token_rotations" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_token_rotations_session_sequence_uidx" ON "refresh_token_rotations" USING btree ("session_id","sequence");--> statement-breakpoint
CREATE INDEX "refresh_token_rotations_session_issued_idx" ON "refresh_token_rotations" USING btree ("session_id","issued_at");--> statement-breakpoint
CREATE INDEX "role_permission_mappings_permission_idx" ON "role_permission_mappings" USING btree ("permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_code_uidx" ON "roles" USING btree ("code");--> statement-breakpoint
CREATE INDEX "roles_context_active_idx" ON "roles" USING btree ("context_type","active");--> statement-breakpoint
CREATE INDEX "support_elevations_client_expiry_idx" ON "support_elevations" USING btree ("client_organization_id","expires_at");--> statement-breakpoint
CREATE INDEX "support_elevations_actor_active_idx" ON "support_elevations" USING btree ("actor_user_id","revoked_at","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_client_branch_code_uidx" ON "teams" USING btree ("client_organization_id","branch_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_client_id_uidx" ON "teams" USING btree ("client_organization_id","id");--> statement-breakpoint
CREATE INDEX "teams_client_branch_active_idx" ON "teams" USING btree ("client_organization_id","branch_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "users_primary_email_normalized_uidx" ON "users" USING btree ("primary_email_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "users_id_status_uidx" ON "users" USING btree ("id","status");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
-- Phase 0 permitted tenant UUIDs before the organization roots existed. Add
-- these foreign keys as NOT VALID so a populated installation can migrate
-- without dropping historical rows. PostgreSQL still enforces each constraint
-- for every new write. The block below validates immediately when the Phase 0
-- data already has matching client_organizations; otherwise deployment must
-- reconcile the reported legacy UUIDs and run ALTER TABLE ... VALIDATE CONSTRAINT.
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_client_organization_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_client_organization_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_client_organization_fk" FOREIGN KEY ("client_organization_id") REFERENCES "public"."client_organizations"("id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM "audit_events" AS legacy
		LEFT JOIN "client_organizations" AS client
			ON client."id" = legacy."client_organization_id"
		WHERE legacy."client_organization_id" IS NOT NULL AND client."id" IS NULL
	) THEN
		ALTER TABLE "audit_events" VALIDATE CONSTRAINT "audit_events_client_organization_fk";
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM "outbox_events" AS legacy
		LEFT JOIN "client_organizations" AS client
			ON client."id" = legacy."client_organization_id"
		WHERE legacy."client_organization_id" IS NOT NULL AND client."id" IS NULL
	) THEN
		ALTER TABLE "outbox_events" VALIDATE CONSTRAINT "outbox_events_client_organization_fk";
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM "webhook_events" AS legacy
		LEFT JOIN "client_organizations" AS client
			ON client."id" = legacy."client_organization_id"
		WHERE client."id" IS NULL
	) THEN
		ALTER TABLE "webhook_events" VALIDATE CONSTRAINT "webhook_events_client_organization_fk";
	END IF;
END;
$$;--> statement-breakpoint
INSERT INTO "roles" ("id", "code", "display_name", "context_type", "application", "description") VALUES
	('30000000-0000-4000-8000-000000000001', 'AGENCY_ADMIN', 'Agency Admin', 'AGENCY', 'WEB', 'Platform client lifecycle and reasoned, time-bound support access.'),
	('30000000-0000-4000-8000-000000000002', 'CLIENT_ADMIN', 'Client Admin', 'CLIENT', 'WEB', 'Client-wide identity, role, branch and settings administration.'),
	('30000000-0000-4000-8000-000000000003', 'MANAGER', 'Manager', 'CLIENT', 'WEB', 'Client-wide operational visibility and controlled exception handling.'),
	('30000000-0000-4000-8000-000000000004', 'SALES_MANAGER', 'Sales Manager', 'CLIENT', 'WEB', 'Assigned branch and team supervision.'),
	('30000000-0000-4000-8000-000000000005', 'TELECALLER', 'Telecaller', 'CLIENT', 'WEB', 'Assigned queue contact, qualification and handoff.'),
	('30000000-0000-4000-8000-000000000006', 'SALESPERSON', 'Salesperson', 'CLIENT', 'MOBILE', 'Owned or assigned lead activity on Android.'),
	('30000000-0000-4000-8000-000000000007', 'TEST_RIDE_EXECUTIVE', 'Test Ride Executive', 'CLIENT', 'MOBILE', 'Assigned test-ride execution on Android.'),
	('30000000-0000-4000-8000-000000000008', 'INVENTORY_EXECUTIVE', 'Inventory Executive', 'CLIENT', 'WEB', 'Assigned branch stock and vehicle allocation operations.'),
	('30000000-0000-4000-8000-000000000009', 'BILLING_DOCUMENTATION_EXECUTIVE', 'Billing and Documentation Executive', 'CLIENT', 'WEB', 'Assigned booking billing and documentation cases.'),
	('30000000-0000-4000-8000-000000000010', 'DELIVERY_EXECUTIVE', 'Delivery Executive', 'CLIENT', 'MOBILE', 'Assigned delivery execution on Android.'),
	('30000000-0000-4000-8000-000000000011', 'RC_REGISTRATION_EXECUTIVE', 'RC and Registration Executive', 'CLIENT', 'WEB', 'Assigned registration and RC cases.');--> statement-breakpoint
INSERT INTO "permissions" ("id", "code", "description") VALUES
	('40000000-0000-4000-8000-000000000001', 'account.profile.read', 'Read the authenticated user profile.'),
	('40000000-0000-4000-8000-000000000002', 'account.profile.update', 'Update the authenticated user profile.'),
	('40000000-0000-4000-8000-000000000003', 'account.sessions.read', 'List the authenticated user sessions and devices.'),
	('40000000-0000-4000-8000-000000000004', 'account.sessions.revoke', 'Revoke the authenticated user sessions and devices.'),
	('40000000-0000-4000-8000-000000000005', 'account.tenant.select', 'Select one of the authenticated user active memberships.'),
	('40000000-0000-4000-8000-000000000006', 'organization.clients.read', 'Read permitted client organization summaries.'),
	('40000000-0000-4000-8000-000000000007', 'organization.branches.read', 'Read branches within effective tenant and branch scope.'),
	('40000000-0000-4000-8000-000000000008', 'organization.teams.read', 'Read teams within effective tenant and team scope.'),
	('40000000-0000-4000-8000-000000000009', 'organization.users.read', 'Read client users within effective scope.'),
	('40000000-0000-4000-8000-000000000010', 'organization.users.manage', 'Manage client users and memberships.'),
	('40000000-0000-4000-8000-000000000011', 'organization.roles.read', 'Read role and permission definitions.'),
	('40000000-0000-4000-8000-000000000012', 'organization.roles.manage', 'Manage client role mappings.'),
	('40000000-0000-4000-8000-000000000013', 'organization.sessions.manage', 'Revoke another client user session with audit evidence.'),
	('40000000-0000-4000-8000-000000000014', 'platform.agencies.manage', 'Manage agency-level platform configuration.'),
	('40000000-0000-4000-8000-000000000015', 'platform.clients.manage', 'Manage client organization lifecycle.'),
	('40000000-0000-4000-8000-000000000016', 'platform.support_elevation.manage', 'Create and revoke reasoned support elevation.');--> statement-breakpoint
INSERT INTO "role_permission_mappings" ("role_id", "permission_id")
SELECT "roles"."id", "permissions"."id"
FROM "roles"
CROSS JOIN "permissions"
WHERE
	"permissions"."code" IN (
		'account.profile.read', 'account.profile.update', 'account.sessions.read',
		'account.sessions.revoke', 'account.tenant.select'
	)
	OR (
		"roles"."context_type" = 'CLIENT'
		AND "permissions"."code" IN ('organization.branches.read', 'organization.teams.read')
	)
	OR (
		"roles"."code" = 'AGENCY_ADMIN'
		AND "permissions"."code" IN (
			'organization.clients.read', 'organization.branches.read', 'organization.teams.read',
			'organization.users.read', 'organization.roles.read', 'platform.agencies.manage',
			'platform.clients.manage', 'platform.support_elevation.manage'
		)
	)
	OR (
		"roles"."code" = 'CLIENT_ADMIN'
		AND "permissions"."code" IN (
			'organization.clients.read', 'organization.users.read', 'organization.users.manage',
			'organization.roles.read', 'organization.roles.manage', 'organization.sessions.manage'
		)
	)
	OR (
		"roles"."code" = 'MANAGER'
		AND "permissions"."code" IN (
			'organization.clients.read', 'organization.users.read', 'organization.roles.read',
			'organization.sessions.manage'
		)
	)
	OR (
		"roles"."code" = 'SALES_MANAGER'
		AND "permissions"."code" IN ('organization.users.read', 'organization.roles.read')
	);--> statement-breakpoint
CREATE FUNCTION "public"."prevent_authentication_audit_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'authentication_audit_events are immutable'
		USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "authentication_audit_events_immutable"
BEFORE UPDATE OR DELETE ON "authentication_audit_events"
FOR EACH ROW
EXECUTE FUNCTION "public"."prevent_authentication_audit_event_mutation"();--> statement-breakpoint
CREATE FUNCTION "public"."prevent_refresh_token_rotation_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'refresh_token_rotations are immutable'
		USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "refresh_token_rotations_immutable"
BEFORE UPDATE OR DELETE ON "refresh_token_rotations"
FOR EACH ROW
EXECUTE FUNCTION "public"."prevent_refresh_token_rotation_mutation"();
