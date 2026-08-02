-- Preflight the two one-live-record invariants. A previously deployed Phase 1
-- database must reconcile duplicate live reset tokens/elevations explicitly so
-- the operator does not silently discard security evidence during migration.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "password_reset_tokens"
		WHERE "used_at" IS NULL AND "revoked_at" IS NULL
		GROUP BY "user_id"
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Phase 1 hardening preflight failed: multiple unconsumed password reset tokens exist for one user'
			USING ERRCODE = '23514';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "support_elevations"
		WHERE "revoked_at" IS NULL
		GROUP BY "actor_session_id"
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'Phase 1 hardening preflight failed: multiple unrevoked support elevations exist for one session'
			USING ERRCODE = '23514';
	END IF;
END;
$$;--> statement-breakpoint
ALTER TABLE "support_elevations" DROP CONSTRAINT "support_elevations_revocation_check";--> statement-breakpoint
CREATE UNIQUE INDEX "password_reset_tokens_user_unconsumed_uidx" ON "password_reset_tokens" USING btree ("user_id") WHERE "password_reset_tokens"."used_at" IS NULL AND "password_reset_tokens"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "support_elevations_actor_session_unrevoked_uidx" ON "support_elevations" USING btree ("actor_session_id") WHERE "support_elevations"."revoked_at" IS NULL;--> statement-breakpoint
ALTER TABLE "support_elevations" ADD CONSTRAINT "support_elevations_revocation_check" CHECK ((
        "support_elevations"."revoked_at" IS NULL
        AND "support_elevations"."revoked_by_user_id" IS NULL
        AND "support_elevations"."revoke_reason" IS NULL
      ) OR (
        "support_elevations"."revoked_at" IS NOT NULL
        AND "support_elevations"."revoke_reason" IS NOT NULL
        AND "support_elevations"."revoked_at" >= "support_elevations"."created_at"
      ));--> statement-breakpoint
CREATE FUNCTION "public"."enforce_support_elevation_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	actor RECORD;
	target RECORD;
	actor_session RECORD;
BEGIN
	SELECT
		membership."agency_id",
		membership."context_type",
		membership."effective_from",
		membership."effective_until",
		membership."status" AS membership_status,
		account."status" AS user_status,
		agency."status" AS agency_status,
		role."active" AS role_active,
		role."application" AS role_application
	INTO actor
	FROM "memberships" AS membership
	INNER JOIN "users" AS account ON account."id" = membership."user_id"
	INNER JOIN "agencies" AS agency ON agency."id" = membership."agency_id"
	INNER JOIN "roles" AS role ON role."id" = membership."role_id"
	WHERE membership."id" = NEW."actor_membership_id"
		AND membership."user_id" = NEW."actor_user_id";

	IF NOT FOUND
		OR actor."context_type" <> 'AGENCY'
		OR actor."membership_status" <> 'ACTIVE'
		OR actor."user_status" <> 'ACTIVE'
		OR actor."agency_status" <> 'ACTIVE'
		OR actor."role_active" IS NOT TRUE
		OR actor."role_application" <> 'WEB'
		OR actor."effective_from" > NEW."created_at"
		OR (actor."effective_until" IS NOT NULL AND actor."effective_until" <= NEW."created_at")
	THEN
		RAISE EXCEPTION 'support elevation actor is not an active agency web membership'
			USING ERRCODE = '23514', CONSTRAINT = 'support_elevations_scope_invariant';
	END IF;

	SELECT client."agency_id", client."status"
	INTO target
	FROM "client_organizations" AS client
	WHERE client."id" = NEW."client_organization_id";

	IF NOT FOUND OR target."agency_id" <> actor."agency_id" OR target."status" <> 'ACTIVE' THEN
		RAISE EXCEPTION 'support elevation target is outside the actor agency or inactive'
			USING ERRCODE = '23514', CONSTRAINT = 'support_elevations_scope_invariant';
	END IF;

	SELECT session."current_membership_id", session."expires_at", session."revoked_at"
	INTO actor_session
	FROM "refresh_sessions" AS session
	WHERE session."id" = NEW."actor_session_id"
		AND session."user_id" = NEW."actor_user_id";

	IF NOT FOUND
		OR actor_session."current_membership_id" <> NEW."actor_membership_id"
		OR actor_session."revoked_at" IS NOT NULL
		OR actor_session."expires_at" <= NEW."created_at"
	THEN
		RAISE EXCEPTION 'support elevation session is inactive or bound to another membership'
			USING ERRCODE = '23514', CONSTRAINT = 'support_elevations_scope_invariant';
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "support_elevations_scope_invariant"
BEFORE INSERT OR UPDATE OF "client_organization_id", "actor_user_id", "actor_membership_id", "actor_membership_context", "actor_session_id", "created_at", "expires_at"
ON "support_elevations"
FOR EACH ROW
EXECUTE FUNCTION "public"."enforce_support_elevation_scope"();--> statement-breakpoint
CREATE FUNCTION "public"."revoke_auth_for_user_status"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	changed_at timestamp with time zone := clock_timestamp();
	state_reason text := 'USER_' || NEW."status"::text;
BEGIN
	WITH revoked AS (
		UPDATE "support_elevations"
		SET
			"revoked_at" = greatest(changed_at, "created_at"),
			"revoke_reason" = state_reason
		WHERE "actor_user_id" = NEW."id" AND "revoked_at" IS NULL
		RETURNING *
	)
	INSERT INTO "authentication_audit_events" (
		"scope", "client_organization_id", "user_id", "session_id", "membership_id",
		"support_elevation_id", "event_type", "outcome", "reason_code", "correlation_id", "metadata"
	)
	SELECT
		'CLIENT', revoked."client_organization_id", revoked."actor_user_id",
		revoked."actor_session_id", revoked."actor_membership_id", revoked."id",
		'SUPPORT_ELEVATION_REVOKED', 'SUCCESS', state_reason,
		'account-state:' || NEW."id"::text,
		jsonb_build_object('reason', state_reason, 'status', NEW."status"::text)
	FROM revoked;

	WITH revoked AS (
		UPDATE "refresh_sessions"
		SET "revoked_at" = changed_at, "revoked_reason" = state_reason
		WHERE "user_id" = NEW."id" AND "revoked_at" IS NULL
		RETURNING *
	)
	INSERT INTO "authentication_audit_events" (
		"scope", "client_organization_id", "user_id", "session_id", "membership_id",
		"event_type", "outcome", "reason_code", "correlation_id", "metadata"
	)
	SELECT
		CASE WHEN membership."client_organization_id" IS NULL THEN 'PLATFORM'::"event_scope" ELSE 'CLIENT'::"event_scope" END,
		membership."client_organization_id", revoked."user_id", revoked."id",
		revoked."current_membership_id", 'ACCOUNT_STATUS_BLOCKED', 'DENIED', state_reason,
		'account-state:' || NEW."id"::text,
		jsonb_build_object('reason', state_reason, 'status', NEW."status"::text)
	FROM revoked
	LEFT JOIN "memberships" AS membership ON membership."id" = revoked."current_membership_id";

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "users_inactive_revoke_auth"
AFTER UPDATE OF "status" ON "users"
FOR EACH ROW
WHEN (NEW."status" <> 'ACTIVE')
EXECUTE FUNCTION "public"."revoke_auth_for_user_status"();--> statement-breakpoint
CREATE FUNCTION "public"."revoke_auth_for_identity_status"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	changed_at timestamp with time zone := clock_timestamp();
	state_reason text := 'IDENTITY_' || NEW."status"::text;
BEGIN
	WITH revoked AS (
		UPDATE "support_elevations" AS elevation
		SET
			"revoked_at" = greatest(changed_at, elevation."created_at"),
			"revoke_reason" = state_reason
		WHERE elevation."actor_session_id" IN (
			SELECT session."id" FROM "refresh_sessions" AS session
			WHERE session."authentication_identity_id" = NEW."id"
		) AND elevation."revoked_at" IS NULL
		RETURNING elevation.*
	)
	INSERT INTO "authentication_audit_events" (
		"scope", "client_organization_id", "user_id", "session_id", "membership_id",
		"support_elevation_id", "event_type", "outcome", "reason_code", "correlation_id", "metadata"
	)
	SELECT
		'CLIENT', revoked."client_organization_id", revoked."actor_user_id",
		revoked."actor_session_id", revoked."actor_membership_id", revoked."id",
		'SUPPORT_ELEVATION_REVOKED', 'SUCCESS', state_reason,
		'identity-state:' || NEW."id"::text,
		jsonb_build_object('reason', state_reason, 'status', NEW."status"::text)
	FROM revoked;

	WITH revoked AS (
		UPDATE "refresh_sessions"
		SET "revoked_at" = changed_at, "revoked_reason" = state_reason
		WHERE "authentication_identity_id" = NEW."id" AND "revoked_at" IS NULL
		RETURNING *
	)
	INSERT INTO "authentication_audit_events" (
		"scope", "client_organization_id", "user_id", "session_id", "membership_id",
		"event_type", "outcome", "reason_code", "correlation_id", "metadata"
	)
	SELECT
		CASE WHEN membership."client_organization_id" IS NULL THEN 'PLATFORM'::"event_scope" ELSE 'CLIENT'::"event_scope" END,
		membership."client_organization_id", revoked."user_id", revoked."id",
		revoked."current_membership_id", 'ACCOUNT_STATUS_BLOCKED', 'DENIED', state_reason,
		'identity-state:' || NEW."id"::text,
		jsonb_build_object('reason', state_reason, 'status', NEW."status"::text)
	FROM revoked
	LEFT JOIN "memberships" AS membership ON membership."id" = revoked."current_membership_id";

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "authentication_identities_inactive_revoke_auth"
AFTER UPDATE OF "status" ON "authentication_identities"
FOR EACH ROW
WHEN (NEW."status" <> 'ACTIVE')
EXECUTE FUNCTION "public"."revoke_auth_for_identity_status"();--> statement-breakpoint
CREATE FUNCTION "public"."revoke_auth_for_membership_status"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	changed_at timestamp with time zone := clock_timestamp();
	state_reason text := 'MEMBERSHIP_' || NEW."status"::text;
BEGIN
	WITH revoked AS (
		UPDATE "support_elevations"
		SET
			"revoked_at" = greatest(changed_at, "created_at"),
			"revoke_reason" = state_reason
		WHERE "actor_membership_id" = NEW."id" AND "revoked_at" IS NULL
		RETURNING *
	)
	INSERT INTO "authentication_audit_events" (
		"scope", "client_organization_id", "user_id", "session_id", "membership_id",
		"support_elevation_id", "event_type", "outcome", "reason_code", "correlation_id", "metadata"
	)
	SELECT
		'CLIENT', revoked."client_organization_id", revoked."actor_user_id",
		revoked."actor_session_id", revoked."actor_membership_id", revoked."id",
		'SUPPORT_ELEVATION_REVOKED', 'SUCCESS', state_reason,
		'membership-state:' || NEW."id"::text,
		jsonb_build_object('reason', state_reason, 'status', NEW."status"::text)
	FROM revoked;

	WITH revoked AS (
		UPDATE "refresh_sessions"
		SET "revoked_at" = changed_at, "revoked_reason" = state_reason
		WHERE "current_membership_id" = NEW."id" AND "revoked_at" IS NULL
		RETURNING *
	)
	INSERT INTO "authentication_audit_events" (
		"scope", "client_organization_id", "user_id", "session_id", "membership_id",
		"event_type", "outcome", "reason_code", "correlation_id", "metadata"
	)
	SELECT
		CASE WHEN NEW."client_organization_id" IS NULL THEN 'PLATFORM'::"event_scope" ELSE 'CLIENT'::"event_scope" END,
		NEW."client_organization_id", revoked."user_id", revoked."id", NEW."id",
		'ACCESS_DENIED', 'DENIED', state_reason, 'membership-state:' || NEW."id"::text,
		jsonb_build_object('reason', state_reason, 'status', NEW."status"::text)
	FROM revoked;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "memberships_inactive_revoke_auth"
AFTER UPDATE OF "status" ON "memberships"
FOR EACH ROW
WHEN (NEW."status" <> 'ACTIVE')
EXECUTE FUNCTION "public"."revoke_auth_for_membership_status"();--> statement-breakpoint
CREATE FUNCTION "public"."revoke_auth_for_client_status"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	changed_at timestamp with time zone := clock_timestamp();
	state_reason text := 'CLIENT_' || NEW."status"::text;
BEGIN
	WITH revoked AS (
		UPDATE "support_elevations"
		SET
			"revoked_at" = greatest(changed_at, "created_at"),
			"revoke_reason" = state_reason
		WHERE "client_organization_id" = NEW."id" AND "revoked_at" IS NULL
		RETURNING *
	)
	INSERT INTO "authentication_audit_events" (
		"scope", "client_organization_id", "user_id", "session_id", "membership_id",
		"support_elevation_id", "event_type", "outcome", "reason_code", "correlation_id", "metadata"
	)
	SELECT
		'CLIENT', NEW."id", revoked."actor_user_id", revoked."actor_session_id",
		revoked."actor_membership_id", revoked."id", 'SUPPORT_ELEVATION_REVOKED',
		'SUCCESS', state_reason, 'client-state:' || NEW."id"::text,
		jsonb_build_object('reason', state_reason, 'status', NEW."status"::text)
	FROM revoked;

	WITH revoked AS (
		UPDATE "refresh_sessions" AS session
		SET "revoked_at" = changed_at, "revoked_reason" = state_reason
		FROM "memberships" AS membership
		WHERE session."current_membership_id" = membership."id"
			AND membership."client_organization_id" = NEW."id"
			AND session."revoked_at" IS NULL
		RETURNING session.*
	)
	INSERT INTO "authentication_audit_events" (
		"scope", "client_organization_id", "user_id", "session_id", "membership_id",
		"event_type", "outcome", "reason_code", "correlation_id", "metadata"
	)
	SELECT
		'CLIENT', NEW."id", revoked."user_id", revoked."id", revoked."current_membership_id",
		'ACCESS_DENIED', 'DENIED', state_reason, 'client-state:' || NEW."id"::text,
		jsonb_build_object('reason', state_reason, 'status', NEW."status"::text)
	FROM revoked;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "client_organizations_inactive_revoke_auth"
AFTER UPDATE OF "status" ON "client_organizations"
FOR EACH ROW
WHEN (NEW."status" <> 'ACTIVE')
EXECUTE FUNCTION "public"."revoke_auth_for_client_status"();--> statement-breakpoint
CREATE FUNCTION "public"."revoke_auth_for_agency_status"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
	changed_at timestamp with time zone := clock_timestamp();
	state_reason text := 'AGENCY_' || NEW."status"::text;
BEGIN
	WITH revoked AS (
		UPDATE "support_elevations" AS elevation
		SET
			"revoked_at" = greatest(changed_at, elevation."created_at"),
			"revoke_reason" = state_reason
		FROM "memberships" AS membership
		WHERE elevation."actor_membership_id" = membership."id"
			AND membership."agency_id" = NEW."id"
			AND elevation."revoked_at" IS NULL
		RETURNING elevation.*
	)
	INSERT INTO "authentication_audit_events" (
		"scope", "client_organization_id", "user_id", "session_id", "membership_id",
		"support_elevation_id", "event_type", "outcome", "reason_code", "correlation_id", "metadata"
	)
	SELECT
		'CLIENT', revoked."client_organization_id", revoked."actor_user_id",
		revoked."actor_session_id", revoked."actor_membership_id", revoked."id",
		'SUPPORT_ELEVATION_REVOKED', 'SUCCESS', state_reason,
		'agency-state:' || NEW."id"::text,
		jsonb_build_object('reason', state_reason, 'status', NEW."status"::text)
	FROM revoked;

	WITH revoked AS (
		UPDATE "refresh_sessions" AS session
		SET "revoked_at" = changed_at, "revoked_reason" = state_reason
		FROM "memberships" AS membership
		WHERE session."current_membership_id" = membership."id"
			AND membership."agency_id" = NEW."id"
			AND session."revoked_at" IS NULL
		RETURNING session.*
	)
	INSERT INTO "authentication_audit_events" (
		"scope", "user_id", "session_id", "membership_id", "event_type", "outcome",
		"reason_code", "correlation_id", "metadata"
	)
	SELECT
		'PLATFORM', revoked."user_id", revoked."id", revoked."current_membership_id",
		'ACCOUNT_STATUS_BLOCKED', 'DENIED', state_reason, 'agency-state:' || NEW."id"::text,
		jsonb_build_object('reason', state_reason, 'status', NEW."status"::text)
	FROM revoked;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "agencies_inactive_revoke_auth"
AFTER UPDATE OF "status" ON "agencies"
FOR EACH ROW
WHEN (NEW."status" <> 'ACTIVE')
EXECUTE FUNCTION "public"."revoke_auth_for_agency_status"();--> statement-breakpoint
-- Reconcile a database that briefly ran Phase 1 before this hardening
-- migration; the triggers are deliberately fired for already-inactive rows.
UPDATE "users" SET "status" = "status" WHERE "status" <> 'ACTIVE';--> statement-breakpoint
UPDATE "authentication_identities" SET "status" = "status" WHERE "status" <> 'ACTIVE';--> statement-breakpoint
UPDATE "memberships" SET "status" = "status" WHERE "status" <> 'ACTIVE';--> statement-breakpoint
UPDATE "client_organizations" SET "status" = "status" WHERE "status" <> 'ACTIVE';--> statement-breakpoint
UPDATE "agencies" SET "status" = "status" WHERE "status" <> 'ACTIVE';
