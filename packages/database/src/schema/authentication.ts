import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  foreignKey,
  index,
  inet,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { membershipContextTypeEnum, memberships } from './authorization.js';
import { clientOrganizations } from './organizations.js';
import { auditOutcomeEnum, eventScopeEnum } from './platform.js';
import { users } from './users.js';

export const authenticationProviderEnum = pgEnum('authentication_provider', ['PASSWORD', 'OAUTH']);
export const authenticationIdentityStatusEnum = pgEnum('authentication_identity_status', [
  'ACTIVE',
  'SUSPENDED',
  'DISABLED',
]);
export const authClientTypeEnum = pgEnum('auth_client_type', ['WEB', 'MOBILE']);
export const devicePlatformEnum = pgEnum('device_platform', ['WEB', 'ANDROID', 'IOS', 'UNKNOWN']);
export const authenticationAuditEventTypeEnum = pgEnum('authentication_audit_event_type', [
  'LOGIN_SUCCEEDED',
  'LOGIN_FAILED',
  'REFRESH_SUCCEEDED',
  'REFRESH_FAILED',
  'REFRESH_REUSE_DETECTED',
  'LOGOUT',
  'LOGOUT_ALL',
  'SESSION_REVOKED',
  'PASSWORD_RESET_REQUESTED',
  'PASSWORD_RESET_SUCCEEDED',
  'PASSWORD_RESET_FAILED',
  'MEMBERSHIP_SWITCHED',
  'SUPPORT_ELEVATION_STARTED',
  'SUPPORT_ELEVATION_REVOKED',
  'SUPPORT_ELEVATION_EXPIRED',
  'ACCESS_DENIED',
  'ACCOUNT_STATUS_BLOCKED',
]);

export const authenticationIdentities = pgTable(
  'authentication_identities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    provider: authenticationProviderEnum('provider').notNull(),
    providerKey: varchar('provider_key', { length: 64 }).notNull(),
    subjectNormalized: varchar('subject_normalized', { length: 320 }).notNull(),
    status: authenticationIdentityStatusEnum('status').default('ACTIVE').notNull(),
    passwordDigest: varchar('password_digest', { length: 128 }),
    passwordSalt: varchar('password_salt', { length: 128 }),
    passwordScryptN: integer('password_scrypt_n'),
    passwordScryptR: integer('password_scrypt_r'),
    passwordScryptP: integer('password_scrypt_p'),
    passwordKeyLength: integer('password_key_length'),
    failedAttemptCount: integer('failed_attempt_count').default(0).notNull(),
    lockedUntil: timestamp('locked_until', { withTimezone: true, mode: 'date' }),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'date' }),
    lastAuthenticatedAt: timestamp('last_authenticated_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'authentication_identities_user_fk',
    }).onDelete('restrict'),
    uniqueIndex('authentication_identities_provider_subject_uidx').on(
      table.provider,
      table.providerKey,
      table.subjectNormalized,
    ),
    unique('authentication_identities_user_id_unique').on(table.userId, table.id),
    index('authentication_identities_user_status_idx').on(table.userId, table.status),
    index('authentication_identities_lockout_idx').on(table.status, table.lockedUntil),
    check(
      'authentication_identities_failed_attempt_count_check',
      sql`${table.failedAttemptCount} >= 0`,
    ),
    check(
      'authentication_identities_credentials_check',
      sql`(
        ${table.provider} = 'PASSWORD'
        AND ${table.providerKey} = 'LOCAL'
        AND ${table.passwordDigest} IS NOT NULL
        AND ${table.passwordSalt} IS NOT NULL
        AND ${table.passwordScryptN} >= 16384
        AND ${table.passwordScryptR} >= 8
        AND ${table.passwordScryptP} >= 1
        AND ${table.passwordKeyLength} >= 32
      ) OR (
        ${table.provider} = 'OAUTH'
        AND ${table.passwordDigest} IS NULL
        AND ${table.passwordSalt} IS NULL
        AND ${table.passwordScryptN} IS NULL
        AND ${table.passwordScryptR} IS NULL
        AND ${table.passwordScryptP} IS NULL
        AND ${table.passwordKeyLength} IS NULL
      )`,
    ),
  ],
);

export const refreshSessions = pgTable(
  'refresh_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    authenticationIdentityId: uuid('authentication_identity_id').notNull(),
    currentMembershipId: uuid('current_membership_id'),
    clientType: authClientTypeEnum('client_type').notNull(),
    deviceId: varchar('device_id', { length: 128 }),
    deviceName: varchar('device_name', { length: 120 }),
    devicePlatform: devicePlatformEnum('device_platform').default('UNKNOWN').notNull(),
    refreshTokenVersion: integer('refresh_token_version').default(1).notNull(),
    sourceIp: inet('source_ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    revokedReason: varchar('revoked_reason', { length: 160 }),
    compromisedAt: timestamp('compromised_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    foreignKey({
      columns: [table.userId, table.authenticationIdentityId],
      foreignColumns: [authenticationIdentities.userId, authenticationIdentities.id],
      name: 'refresh_sessions_user_identity_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.userId, table.currentMembershipId],
      foreignColumns: [memberships.userId, memberships.id],
      name: 'refresh_sessions_user_membership_fk',
    }).onDelete('restrict'),
    unique('refresh_sessions_user_id_unique').on(table.userId, table.id),
    index('refresh_sessions_user_active_idx').on(table.userId, table.revokedAt, table.expiresAt),
    index('refresh_sessions_membership_idx').on(table.currentMembershipId),
    check('refresh_sessions_token_version_check', sql`${table.refreshTokenVersion} >= 1`),
    check('refresh_sessions_expiry_check', sql`${table.expiresAt} > ${table.createdAt}`),
    check(
      'refresh_sessions_revocation_check',
      sql`(${table.revokedAt} IS NULL AND ${table.revokedReason} IS NULL) OR ${table.revokedAt} IS NOT NULL`,
    ),
  ],
);

/**
 * One immutable issuance row is appended for each refresh-token rotation. The
 * owning session's refresh_token_version points at the only currently valid
 * sequence, so replay is detectable without rewriting token history.
 */
export const refreshTokenRotations = pgTable(
  'refresh_token_rotations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: uuid('session_id').notNull(),
    sequence: integer('sequence').notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    parentRotationId: uuid('parent_rotation_id').references(
      (): AnyPgColumn => refreshTokenRotations.id,
      { onDelete: 'restrict' },
    ),
    issuedAt: timestamp('issued_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.sessionId],
      foreignColumns: [refreshSessions.id],
      name: 'refresh_token_rotations_session_fk',
    }).onDelete('restrict'),
    uniqueIndex('refresh_token_rotations_token_hash_uidx').on(table.tokenHash),
    uniqueIndex('refresh_token_rotations_session_sequence_uidx').on(
      table.sessionId,
      table.sequence,
    ),
    index('refresh_token_rotations_session_issued_idx').on(table.sessionId, table.issuedAt),
    check('refresh_token_rotations_sequence_check', sql`${table.sequence} >= 1`),
    check('refresh_token_rotations_expiry_check', sql`${table.expiresAt} > ${table.issuedAt}`),
    check(
      'refresh_token_rotations_hash_check',
      sql`char_length(${table.tokenHash}) = 64 AND ${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').notNull(),
    authenticationIdentityId: uuid('authentication_identity_id').notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    requestedAt: timestamp('requested_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    requestCorrelationId: varchar('request_correlation_id', { length: 128 }).notNull(),
    sourceIp: inet('source_ip'),
    userAgent: text('user_agent'),
  },
  (table) => [
    foreignKey({
      columns: [table.userId, table.authenticationIdentityId],
      foreignColumns: [authenticationIdentities.userId, authenticationIdentities.id],
      name: 'password_reset_tokens_user_identity_fk',
    }).onDelete('restrict'),
    uniqueIndex('password_reset_tokens_token_hash_uidx').on(table.tokenHash),
    uniqueIndex('password_reset_tokens_user_unconsumed_uidx')
      .on(table.userId)
      .where(sql`${table.usedAt} IS NULL AND ${table.revokedAt} IS NULL`),
    index('password_reset_tokens_user_requested_idx').on(table.userId, table.requestedAt),
    index('password_reset_tokens_expiry_idx').on(table.expiresAt),
    check('password_reset_tokens_expiry_check', sql`${table.expiresAt} > ${table.requestedAt}`),
    check(
      'password_reset_tokens_terminal_state_check',
      sql`${table.usedAt} IS NULL OR ${table.revokedAt} IS NULL`,
    ),
    check(
      'password_reset_tokens_hash_check',
      sql`char_length(${table.tokenHash}) = 64 AND ${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const supportElevations = pgTable(
  'support_elevations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientOrganizationId: uuid('client_organization_id').notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorMembershipContext: membershipContextTypeEnum('actor_membership_context')
      .default('AGENCY')
      .notNull(),
    actorSessionId: uuid('actor_session_id').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    revokedByUserId: uuid('revoked_by_user_id'),
    revokeReason: text('revoke_reason'),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'support_elevations_client_organization_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.actorUserId, table.actorMembershipId],
      foreignColumns: [memberships.userId, memberships.id],
      name: 'support_elevations_actor_membership_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.actorMembershipId, table.actorMembershipContext],
      foreignColumns: [memberships.id, memberships.contextType],
      name: 'support_elevations_actor_context_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.actorUserId, table.actorSessionId],
      foreignColumns: [refreshSessions.userId, refreshSessions.id],
      name: 'support_elevations_actor_session_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.revokedByUserId],
      foreignColumns: [users.id],
      name: 'support_elevations_revoked_by_user_fk',
    }).onDelete('restrict'),
    index('support_elevations_client_expiry_idx').on(table.clientOrganizationId, table.expiresAt),
    index('support_elevations_actor_active_idx').on(
      table.actorUserId,
      table.revokedAt,
      table.expiresAt,
    ),
    uniqueIndex('support_elevations_actor_session_unrevoked_uidx')
      .on(table.actorSessionId)
      .where(sql`${table.revokedAt} IS NULL`),
    check(
      'support_elevations_actor_context_check',
      sql`${table.actorMembershipContext} = 'AGENCY'`,
    ),
    check('support_elevations_reason_check', sql`char_length(trim(${table.reason})) >= 10`),
    check(
      'support_elevations_expiry_check',
      sql`${table.expiresAt} > ${table.createdAt} AND ${table.expiresAt} <= ${table.createdAt} + interval '60 minutes'`,
    ),
    check(
      'support_elevations_revocation_check',
      sql`(
        ${table.revokedAt} IS NULL
        AND ${table.revokedByUserId} IS NULL
        AND ${table.revokeReason} IS NULL
      ) OR (
        ${table.revokedAt} IS NOT NULL
        AND ${table.revokeReason} IS NOT NULL
        AND ${table.revokedAt} >= ${table.createdAt}
      )`,
    ),
  ],
);

export const authenticationAuditEvents = pgTable(
  'authentication_audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    scope: eventScopeEnum('scope').notNull(),
    clientOrganizationId: uuid('client_organization_id'),
    userId: uuid('user_id'),
    sessionId: uuid('session_id'),
    membershipId: uuid('membership_id'),
    supportElevationId: uuid('support_elevation_id'),
    eventType: authenticationAuditEventTypeEnum('event_type').notNull(),
    outcome: auditOutcomeEnum('outcome').notNull(),
    identifierHash: varchar('identifier_hash', { length: 64 }),
    reasonCode: varchar('reason_code', { length: 160 }),
    correlationId: varchar('correlation_id', { length: 128 }).notNull(),
    sourceIp: inet('source_ip'),
    userAgent: text('user_agent'),
    deviceId: varchar('device_id', { length: 128 }),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.clientOrganizationId],
      foreignColumns: [clientOrganizations.id],
      name: 'authentication_audit_events_client_organization_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'authentication_audit_events_user_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.sessionId],
      foreignColumns: [refreshSessions.id],
      name: 'authentication_audit_events_session_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.membershipId],
      foreignColumns: [memberships.id],
      name: 'authentication_audit_events_membership_fk',
    }).onDelete('restrict'),
    foreignKey({
      columns: [table.supportElevationId],
      foreignColumns: [supportElevations.id],
      name: 'authentication_audit_events_support_elevation_fk',
    }).onDelete('restrict'),
    index('authentication_audit_events_client_created_idx').on(
      table.clientOrganizationId,
      table.createdAt,
    ),
    index('authentication_audit_events_user_created_idx').on(table.userId, table.createdAt),
    index('authentication_audit_events_session_created_idx').on(table.sessionId, table.createdAt),
    index('authentication_audit_events_correlation_idx').on(table.correlationId),
    check(
      'authentication_audit_events_scope_client_check',
      sql`(${table.scope} = 'PLATFORM' AND ${table.clientOrganizationId} IS NULL) OR (${table.scope} = 'CLIENT' AND ${table.clientOrganizationId} IS NOT NULL)`,
    ),
    check(
      'authentication_audit_events_identifier_hash_check',
      sql`${table.identifierHash} IS NULL OR (char_length(${table.identifierHash}) = 64 AND ${table.identifierHash} ~ '^[0-9a-f]{64}$')`,
    ),
  ],
);
