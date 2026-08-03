/* Administrative command methods are intentionally small transaction boundaries. */
/* eslint-disable @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-non-null-assertion */
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateBranchRequest,
  CreateClientRequest,
  CreateTeamRequest,
  InviteUserRequest,
  SetAgencyDefaultsRequest,
  SetClientSettingsRequest,
  SetClientStatusRequest,
  SetMembershipStatusRequest,
  SetModuleFlagRequest,
  SetWorkingHoursRequest,
  UpdateBranchRequest,
  UpdateClientRequest,
  UpdateMembershipRequest,
  UpdateTeamRequest,
} from '@gdm/contracts';
import { type DatabaseConnection, schema } from '@gdm/database';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../infrastructure/database/database.tokens.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';

const modules = [
  'LEADS',
  'TELEPHONY',
  'INBOX',
  'TEST_RIDES',
  'INVENTORY',
  'BOOKING_BILLING',
  'DELIVERY_RC',
  'POST_SALE',
  'INTEGRATIONS',
] as const;
const integrations = [
  'WHATSAPP',
  'TELEPHONY',
  'META_LEADS',
  'GOOGLE_BUSINESS',
  'GOOGLE_ADS',
  'EMAIL',
  'SMS',
] as const;
type Tx = Parameters<Parameters<DatabaseConnection['db']['transaction']>[0]>[0];

function clientId(context: AuthorizationContext): string {
  if (!context.clientOrganizationId)
    throw new ForbiddenException({
      code: 'SUPPORT_ELEVATION_REQUIRED',
      details: [],
      message: 'An active client context is required.',
      retryable: false,
    });
  return context.clientOrganizationId;
}
function notFound(message: string): NotFoundException {
  return new NotFoundException({ code: 'NOT_FOUND', details: [], message, retryable: false });
}
function conflict(message: string): ConflictException {
  return new ConflictException({ code: 'CONFLICT', details: [], message, retryable: false });
}

@Injectable()
export class AdministrationService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly connection: DatabaseConnection) {}

  private async audit(
    tx: Tx,
    context: AuthorizationContext,
    action: string,
    entityType: string,
    entityId: string,
    oldSummary: Record<string, unknown> | null,
    newSummary: Record<string, unknown> | null,
    reason?: string,
  ): Promise<void> {
    await tx.insert(schema.auditEvents).values({
      scope: context.clientOrganizationId ? 'CLIENT' : 'PLATFORM',
      ...(context.clientOrganizationId
        ? { clientOrganizationId: context.clientOrganizationId }
        : {}),
      actorId: context.userId,
      actorType: 'USER',
      effectiveRole: context.roleCode,
      action,
      entityType,
      entityId,
      outcome: 'SUCCESS',
      oldSummary,
      newSummary,
      ...(reason ? { reason } : {}),
      correlationId: context.sessionId,
    });
  }

  async createClient(context: AuthorizationContext, body: CreateClientRequest) {
    if (!context.agencyId)
      throw new ForbiddenException({
        code: 'SCOPE_DENIED',
        details: [],
        message: 'An agency membership is required.',
        retryable: false,
      });
    return this.connection.db.transaction(async (tx) => {
      const [defaults] = await tx
        .select()
        .from(schema.agencyDefaults)
        .where(eq(schema.agencyDefaults.agencyId, context.agencyId!))
        .limit(1);
      const [client] = await tx
        .insert(schema.clientOrganizations)
        .values({
          agencyId: context.agencyId!,
          code: body.code,
          displayName: body.display_name,
          legalName: body.legal_name,
          timezone: body.timezone,
          status: 'PENDING',
        })
        .returning();
      if (!client) throw new Error('Client organization creation did not return a row.');
      await tx
        .insert(schema.clientAdministrationSettings)
        .values({ clientOrganizationId: client.id });
      await tx
        .insert(schema.clientIntegrationReadiness)
        .values(
          integrations.map((integration) => ({ clientOrganizationId: client.id, integration })),
        );
      await tx.insert(schema.clientModuleFlags).values(
        modules.map((module) => ({
          clientOrganizationId: client.id,
          module,
          enabled: defaults?.defaultFeatureFlags[module] === true,
          reason:
            defaults?.defaultFeatureFlags[module] === true
              ? 'Enabled by safe agency default'
              : 'Not enabled during onboarding',
        })),
      );
      await this.audit(tx, context, 'CLIENT_CREATED', 'client_organization', client.id, null, {
        code: client.code,
        status: client.status,
      });
      return {
        client_organization: {
          id: client.id,
          agency_id: client.agencyId,
          legal_name: client.legalName,
          display_name: client.displayName,
          status: client.status,
          timezone: client.timezone,
        },
      };
    });
  }

  async clientDetail(context: AuthorizationContext, id: string) {
    if (!context.agencyId)
      throw new ForbiddenException({
        code: 'SCOPE_DENIED',
        details: [],
        message: 'An agency membership is required.',
        retryable: false,
      });
    const [client] = await this.connection.db
      .select()
      .from(schema.clientOrganizations)
      .where(
        and(
          eq(schema.clientOrganizations.id, id),
          eq(schema.clientOrganizations.agencyId, context.agencyId),
        ),
      )
      .limit(1);
    if (!client) throw notFound('The client organization was not found.');
    const [branchCount, teamCount, userCount] = await Promise.all([
      this.connection.db
        .select({ value: count() })
        .from(schema.branches)
        .where(eq(schema.branches.clientOrganizationId, id)),
      this.connection.db
        .select({ value: count() })
        .from(schema.teams)
        .where(eq(schema.teams.clientOrganizationId, id)),
      this.connection.db
        .select({ value: count() })
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.clientOrganizationId, id),
            eq(schema.memberships.status, 'ACTIVE'),
          ),
        ),
    ]);
    return {
      client_organization: {
        id: client.id,
        agency_id: client.agencyId,
        legal_name: client.legalName,
        display_name: client.displayName,
        status: client.status,
        timezone: client.timezone,
      },
      usage: {
        branches: branchCount[0]?.value ?? 0,
        teams: teamCount[0]?.value ?? 0,
        active_users: userCount[0]?.value ?? 0,
      },
    };
  }

  async setClientStatus(context: AuthorizationContext, id: string, body: SetClientStatusRequest) {
    if (!context.agencyId)
      throw new ForbiddenException({
        code: 'SCOPE_DENIED',
        details: [],
        message: 'An agency membership is required.',
        retryable: false,
      });
    return this.connection.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(schema.clientOrganizations)
        .where(
          and(
            eq(schema.clientOrganizations.id, id),
            eq(schema.clientOrganizations.agencyId, context.agencyId!),
          ),
        )
        .for('update')
        .limit(1);
      if (!before) throw notFound('The client organization was not found.');
      const [client] = await tx
        .update(schema.clientOrganizations)
        .set({ status: body.status, updatedAt: new Date() })
        .where(eq(schema.clientOrganizations.id, id))
        .returning();
      if (body.status === 'SUSPENDED')
        await tx
          .update(schema.refreshSessions)
          .set({ revokedAt: new Date(), revokedReason: 'CLIENT_SUSPENDED' })
          .where(
            and(
              eq(
                schema.refreshSessions.currentMembershipId,
                sql`any(select id from memberships where client_organization_id = ${id})`,
              ),
              isNull(schema.refreshSessions.revokedAt),
            ),
          );
      await this.audit(
        tx,
        context,
        body.status === 'SUSPENDED' ? 'CLIENT_SUSPENDED' : 'CLIENT_REACTIVATED',
        'client_organization',
        id,
        { status: before.status },
        { status: body.status },
        body.reason,
      );
      return {
        client_organization: {
          id: client!.id,
          agency_id: client!.agencyId,
          legal_name: client!.legalName,
          display_name: client!.displayName,
          status: client!.status,
          timezone: client!.timezone,
        },
      };
    });
  }

  async updateClient(context: AuthorizationContext, body: UpdateClientRequest) {
    const id = clientId(context);
    const [before] = await this.connection.db
      .select()
      .from(schema.clientOrganizations)
      .where(eq(schema.clientOrganizations.id, id))
      .limit(1);
    if (!before) throw notFound('The client organization was not found.');
    const [updated] = await this.connection.db
      .update(schema.clientOrganizations)
      .set({
        displayName: body.display_name,
        legalName: body.legal_name,
        timezone: body.timezone,
        settingsVersion: before.settingsVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(schema.clientOrganizations.id, id))
      .returning();
    await this.connection.db.transaction((tx) =>
      this.audit(
        tx,
        context,
        'CLIENT_PROFILE_UPDATED',
        'client_organization',
        id,
        {
          display_name: before.displayName,
          legal_name: before.legalName,
          timezone: before.timezone,
        },
        { ...body },
      ),
    );
    return {
      client_organization: {
        id: updated!.id,
        agency_id: updated!.agencyId,
        legal_name: updated!.legalName,
        display_name: updated!.displayName,
        status: updated!.status,
        timezone: updated!.timezone,
      },
    };
  }

  async createBranch(context: AuthorizationContext, body: CreateBranchRequest) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.branches)
        .values({
          clientOrganizationId: cid,
          code: body.code,
          name: body.name,
          timezone: body.timezone,
        })
        .returning();
      await this.audit(tx, context, 'BRANCH_CREATED', 'branch', row!.id, null, {
        code: row!.code,
        name: row!.name,
      });
      return { branch: this.branch(row!) };
    });
  }
  async updateBranch(context: AuthorizationContext, id: string, body: UpdateBranchRequest) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(schema.branches)
        .where(and(eq(schema.branches.id, id), eq(schema.branches.clientOrganizationId, cid)))
        .for('update')
        .limit(1);
      if (!before) throw notFound('The branch was not found.');
      const [row] = await tx
        .update(schema.branches)
        .set({
          ...{ code: body.code, name: body.name, timezone: body.timezone, active: body.active },
          updatedAt: new Date(),
        })
        .where(eq(schema.branches.id, id))
        .returning();
      await this.audit(
        tx,
        context,
        'BRANCH_UPDATED',
        'branch',
        id,
        this.branch(before),
        this.branch(row!),
      );
      return { branch: this.branch(row!) };
    });
  }
  async createTeam(context: AuthorizationContext, body: CreateTeamRequest) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const [branch] = await tx
        .select()
        .from(schema.branches)
        .where(
          and(
            eq(schema.branches.id, body.branch_id),
            eq(schema.branches.clientOrganizationId, cid),
          ),
        )
        .limit(1);
      if (!branch) throw notFound('The branch was not found.');
      const [row] = await tx
        .insert(schema.teams)
        .values({
          clientOrganizationId: cid,
          branchId: body.branch_id,
          code: body.code,
          name: body.name,
        })
        .returning();
      await this.audit(tx, context, 'TEAM_CREATED', 'team', row!.id, null, this.team(row!));
      return { team: this.team(row!) };
    });
  }
  async updateTeam(context: AuthorizationContext, id: string, body: UpdateTeamRequest) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(schema.teams)
        .where(and(eq(schema.teams.id, id), eq(schema.teams.clientOrganizationId, cid)))
        .for('update')
        .limit(1);
      if (!before) throw notFound('The team was not found.');
      const [row] = await tx
        .update(schema.teams)
        .set({ code: body.code, name: body.name, active: body.active, updatedAt: new Date() })
        .where(eq(schema.teams.id, id))
        .returning();
      await this.audit(tx, context, 'TEAM_UPDATED', 'team', id, this.team(before), this.team(row!));
      return { team: this.team(row!) };
    });
  }

  async setWorkingHours(
    context: AuthorizationContext,
    branchId: string,
    body: SetWorkingHoursRequest,
  ) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const [branch] = await tx
        .select()
        .from(schema.branches)
        .where(and(eq(schema.branches.id, branchId), eq(schema.branches.clientOrganizationId, cid)))
        .limit(1);
      if (!branch) throw notFound('The branch was not found.');
      const existing = await tx
        .select()
        .from(schema.branchWorkingHours)
        .where(eq(schema.branchWorkingHours.branchId, branchId));
      await tx
        .delete(schema.branchWorkingHours)
        .where(eq(schema.branchWorkingHours.branchId, branchId));
      await tx.insert(schema.branchWorkingHours).values(
        body.hours.map((entry) => ({
          clientOrganizationId: cid,
          branchId,
          dayOfWeek: entry.day_of_week,
          isClosed: entry.is_closed,
          opensAt: entry.opens_at,
          closesAt: entry.closes_at,
          version: (existing[0]?.version ?? 0) + 1,
        })),
      );
      await this.audit(
        tx,
        context,
        'BRANCH_WORKING_HOURS_UPDATED',
        'branch',
        branchId,
        { hours: existing },
        { hours: body.hours },
      );
      return { branch_id: branchId, hours: body.hours, version: (existing[0]?.version ?? 0) + 1 };
    });
  }

  async inviteUser(context: AuthorizationContext, body: InviteUserRequest) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const [role] = await tx
        .select()
        .from(schema.roles)
        .where(
          and(
            eq(schema.roles.code, body.role_code),
            eq(schema.roles.contextType, 'CLIENT'),
            eq(schema.roles.active, true),
          ),
        )
        .limit(1);
      if (!role) throw conflict('The selected role is unavailable.');
      const [user] = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.primaryEmailNormalized, body.email))
        .limit(1);
      const target =
        user ??
        (
          await tx
            .insert(schema.users)
            .values({
              displayName: body.display_name,
              primaryEmailNormalized: body.email,
              status: 'INVITED',
            })
            .returning()
        )[0];
      if (!target) throw new Error('User invitation creation did not return a row.');
      const [existing] = await tx
        .select({ id: schema.memberships.id })
        .from(schema.memberships)
        .where(
          and(
            eq(schema.memberships.userId, target.id),
            eq(schema.memberships.clientOrganizationId, cid),
            inArray(schema.memberships.status, ['ACTIVE', 'INVITED', 'SUSPENDED']),
          ),
        )
        .limit(1);
      if (existing)
        throw conflict('This employee already has a current membership for the client.');
      await this.assertScopes(tx, cid, body.branch_ids, body.team_ids);
      const [membership] = await tx
        .insert(schema.memberships)
        .values({
          userId: target.id,
          contextType: 'CLIENT',
          clientOrganizationId: cid,
          roleId: role.id,
          status: 'INVITED',
          branchScopeMode: body.branch_scope_mode,
          teamScopeMode: body.team_scope_mode,
          assignmentScope: body.assignment_scope,
        })
        .returning();
      await this.insertScopes(tx, cid, membership!.id, body.branch_ids, body.team_ids);
      await this.audit(tx, context, 'USER_INVITED', 'membership', membership!.id, null, {
        email: target.primaryEmailNormalized,
        role_code: body.role_code,
        branch_ids: body.branch_ids,
        team_ids: body.team_ids,
      });
      return {
        user: {
          user_id: target.id,
          display_name: target.displayName,
          email: target.primaryEmailNormalized,
          user_status: target.status,
          membership_id: membership!.id,
          membership_status: membership!.status,
          role_code: body.role_code,
          branch_scope_mode: body.branch_scope_mode,
          branch_ids: body.branch_ids,
          team_scope_mode: body.team_scope_mode,
          team_ids: body.team_ids,
          assignment_scope: body.assignment_scope,
        },
        invitation_delivery: 'UNAVAILABLE' as const,
      };
    });
  }

  async updateMembership(
    context: AuthorizationContext,
    membershipId: string,
    body: UpdateMembershipRequest,
  ) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const before = await this.membershipForUpdate(tx, cid, membershipId);
      const [role] = await tx
        .select()
        .from(schema.roles)
        .where(
          and(
            eq(schema.roles.code, body.role_code),
            eq(schema.roles.contextType, 'CLIENT'),
            eq(schema.roles.active, true),
          ),
        )
        .limit(1);
      if (!role) throw conflict('The selected role is unavailable.');
      await this.assertScopes(tx, cid, body.branch_ids, body.team_ids);
      await this.ensureClientAdmin(tx, cid, before.roleCode, body.role_code, before.status);
      const [updated] = await tx
        .update(schema.memberships)
        .set({
          roleId: role.id,
          branchScopeMode: body.branch_scope_mode,
          teamScopeMode: body.team_scope_mode,
          assignmentScope: body.assignment_scope,
          updatedAt: new Date(),
        })
        .where(eq(schema.memberships.id, membershipId))
        .returning();
      await tx
        .delete(schema.membershipBranchScopes)
        .where(eq(schema.membershipBranchScopes.membershipId, membershipId));
      await tx
        .delete(schema.membershipTeamScopes)
        .where(eq(schema.membershipTeamScopes.membershipId, membershipId));
      await this.insertScopes(tx, cid, membershipId, body.branch_ids, body.team_ids);
      await tx
        .update(schema.refreshSessions)
        .set({ revokedAt: new Date(), revokedReason: 'ROLE_OR_SCOPE_CHANGED' })
        .where(
          and(
            eq(schema.refreshSessions.currentMembershipId, membershipId),
            isNull(schema.refreshSessions.revokedAt),
          ),
        );
      await this.audit(
        tx,
        context,
        'MEMBERSHIP_ROLE_OR_SCOPE_UPDATED',
        'membership',
        membershipId,
        before,
        {
          role_code: body.role_code,
          branch_ids: body.branch_ids,
          team_ids: body.team_ids,
          assignment_scope: body.assignment_scope,
        },
      );
      return this.presentMembership(updated!, before.user);
    });
  }
  async setMembershipStatus(
    context: AuthorizationContext,
    membershipId: string,
    body: SetMembershipStatusRequest,
  ) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const before = await this.membershipForUpdate(tx, cid, membershipId);
      await this.ensureClientAdmin(tx, cid, before.roleCode, before.roleCode, body.status);
      const [updated] = await tx
        .update(schema.memberships)
        .set({
          status: body.status,
          updatedAt: new Date(),
          ...(body.status === 'ENDED' ? { effectiveUntil: new Date() } : {}),
        })
        .where(eq(schema.memberships.id, membershipId))
        .returning();
      await tx
        .update(schema.refreshSessions)
        .set({ revokedAt: new Date(), revokedReason: `MEMBERSHIP_${body.status}` })
        .where(
          and(
            eq(schema.refreshSessions.currentMembershipId, membershipId),
            isNull(schema.refreshSessions.revokedAt),
          ),
        );
      await this.audit(
        tx,
        context,
        'MEMBERSHIP_STATUS_UPDATED',
        'membership',
        membershipId,
        { status: before.status },
        { status: body.status },
        body.reason,
      );
      return this.presentMembership(updated!, before.user);
    });
  }

  async settings(context: AuthorizationContext) {
    const cid = clientId(context);
    const [settings] = await this.connection.db
      .select()
      .from(schema.clientAdministrationSettings)
      .where(eq(schema.clientAdministrationSettings.clientOrganizationId, cid))
      .limit(1);
    return {
      lead_assignment_ready: settings?.leadAssignmentReady ?? false,
      retention_policy: settings?.retentionPolicy ?? {},
      version: settings?.version ?? 1,
    };
  }
  async setSettings(context: AuthorizationContext, body: SetClientSettingsRequest) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(schema.clientAdministrationSettings)
        .where(eq(schema.clientAdministrationSettings.clientOrganizationId, cid))
        .limit(1);
      const value = {
        leadAssignmentReady: body.lead_assignment_ready,
        retentionPolicy: body.retention_policy,
        version: (before?.version ?? 0) + 1,
        updatedAt: new Date(),
      };
      await tx
        .insert(schema.clientAdministrationSettings)
        .values({ clientOrganizationId: cid, ...value })
        .onConflictDoUpdate({
          target: schema.clientAdministrationSettings.clientOrganizationId,
          set: value,
        });
      await this.audit(
        tx,
        context,
        'CLIENT_SETTINGS_UPDATED',
        'client_administration_settings',
        cid,
        before
          ? {
              lead_assignment_ready: before.leadAssignmentReady,
              retention_policy: before.retentionPolicy,
            }
          : null,
        body,
      );
      return {
        lead_assignment_ready: value.leadAssignmentReady,
        retention_policy: value.retentionPolicy,
        version: value.version,
      };
    });
  }
  async flags(context: AuthorizationContext) {
    const rows = await this.connection.db
      .select()
      .from(schema.clientModuleFlags)
      .where(eq(schema.clientModuleFlags.clientOrganizationId, clientId(context)))
      .orderBy(asc(schema.clientModuleFlags.module));
    return {
      flags: rows.map((row) => ({
        module: row.module as (typeof modules)[number],
        enabled: row.enabled,
        reason: row.reason ?? null,
      })),
    };
  }
  async setFlag(
    context: AuthorizationContext,
    module: (typeof modules)[number],
    body: SetModuleFlagRequest,
  ) {
    const cid = clientId(context);
    return this.connection.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(schema.clientModuleFlags)
        .where(
          and(
            eq(schema.clientModuleFlags.clientOrganizationId, cid),
            eq(schema.clientModuleFlags.module, module),
          ),
        )
        .limit(1);
      await tx
        .insert(schema.clientModuleFlags)
        .values({
          clientOrganizationId: cid,
          module,
          enabled: body.enabled,
          reason: body.reason ?? undefined,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [schema.clientModuleFlags.clientOrganizationId, schema.clientModuleFlags.module],
          set: { enabled: body.enabled, reason: body.reason ?? undefined, updatedAt: new Date() },
        });
      await this.audit(
        tx,
        context,
        'CLIENT_MODULE_FLAG_UPDATED',
        'client_module_flag',
        `${cid}:${module}`,
        before ? { enabled: before.enabled, reason: before.reason } : null,
        { enabled: body.enabled, reason: body.reason },
      );
      return this.flags(context);
    });
  }
  async integrations(context: AuthorizationContext) {
    const rows = await this.connection.db
      .select()
      .from(schema.clientIntegrationReadiness)
      .where(eq(schema.clientIntegrationReadiness.clientOrganizationId, clientId(context)))
      .orderBy(asc(schema.clientIntegrationReadiness.integration));
    return {
      integrations: rows.map((row) => ({
        integration: row.integration,
        status: row.status as 'NOT_CONNECTED',
        detail: row.detail ?? null,
      })),
    };
  }
  async defaults(context: AuthorizationContext) {
    if (!context.agencyId)
      throw new ForbiddenException({
        code: 'SCOPE_DENIED',
        details: [],
        message: 'An agency membership is required.',
        retryable: false,
      });
    const [row] = await this.connection.db
      .select()
      .from(schema.agencyDefaults)
      .where(eq(schema.agencyDefaults.agencyId, context.agencyId))
      .limit(1);
    return {
      default_timezone: row?.defaultTimezone ?? 'Asia/Kolkata',
      default_feature_flags: row?.defaultFeatureFlags ?? {},
    };
  }
  async setDefaults(context: AuthorizationContext, body: SetAgencyDefaultsRequest) {
    if (!context.agencyId)
      throw new ForbiddenException({
        code: 'SCOPE_DENIED',
        details: [],
        message: 'An agency membership is required.',
        retryable: false,
      });
    return this.connection.db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(schema.agencyDefaults)
        .where(eq(schema.agencyDefaults.agencyId, context.agencyId!))
        .limit(1);
      await tx
        .insert(schema.agencyDefaults)
        .values({
          agencyId: context.agencyId!,
          defaultTimezone: body.default_timezone,
          defaultFeatureFlags: body.default_feature_flags,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: schema.agencyDefaults.agencyId,
          set: {
            defaultTimezone: body.default_timezone,
            defaultFeatureFlags: body.default_feature_flags,
            updatedAt: new Date(),
          },
        });
      await this.audit(
        tx,
        context,
        'AGENCY_DEFAULTS_UPDATED',
        'agency_defaults',
        context.agencyId!,
        before
          ? {
              default_timezone: before.defaultTimezone,
              default_feature_flags: before.defaultFeatureFlags,
            }
          : null,
        body,
      );
      return {
        default_timezone: body.default_timezone,
        default_feature_flags: body.default_feature_flags,
      };
    });
  }
  async auditTimeline(context: AuthorizationContext) {
    const cid = clientId(context);
    const rows = await this.connection.db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.clientOrganizationId, cid))
      .orderBy(desc(schema.auditEvents.createdAt))
      .limit(100);
    return {
      events: rows.map((row) => ({
        action: row.action,
        actor_id: row.actorId ?? null,
        created_at: row.createdAt.toISOString(),
        entity_id: row.entityId,
        entity_type: row.entityType,
        old_summary: row.oldSummary,
        new_summary: row.newSummary,
        reason: row.reason ?? null,
      })),
    };
  }

  private branch(row: typeof schema.branches.$inferSelect) {
    return {
      id: row.id,
      client_organization_id: row.clientOrganizationId,
      code: row.code,
      name: row.name,
      timezone: row.timezone,
      active: row.active,
    };
  }
  private team(row: typeof schema.teams.$inferSelect) {
    return {
      id: row.id,
      client_organization_id: row.clientOrganizationId,
      branch_id: row.branchId,
      code: row.code,
      name: row.name,
      active: row.active,
    };
  }
  private async assertScopes(
    tx: Tx,
    cid: string,
    branchIds: string[],
    teamIds: string[],
  ): Promise<void> {
    if (branchIds.length) {
      const rows = await tx
        .select({ id: schema.branches.id })
        .from(schema.branches)
        .where(
          and(
            eq(schema.branches.clientOrganizationId, cid),
            inArray(schema.branches.id, branchIds),
          ),
        );
      if (rows.length !== new Set(branchIds).size)
        throw conflict('One or more branch scopes are outside the client.');
    }
    if (teamIds.length) {
      const rows = await tx
        .select({ id: schema.teams.id })
        .from(schema.teams)
        .where(and(eq(schema.teams.clientOrganizationId, cid), inArray(schema.teams.id, teamIds)));
      if (rows.length !== new Set(teamIds).size)
        throw conflict('One or more team scopes are outside the client.');
    }
  }
  private async insertScopes(
    tx: Tx,
    cid: string,
    membershipId: string,
    branchIds: string[],
    teamIds: string[],
  ): Promise<void> {
    if (branchIds.length)
      await tx
        .insert(schema.membershipBranchScopes)
        .values(
          branchIds.map((branchId) => ({ clientOrganizationId: cid, membershipId, branchId })),
        );
    if (teamIds.length) {
      const rows = await tx
        .select({ branchId: schema.teams.branchId, id: schema.teams.id })
        .from(schema.teams)
        .where(inArray(schema.teams.id, teamIds));
      await tx.insert(schema.membershipTeamScopes).values(
        rows.map((team) => ({
          clientOrganizationId: cid,
          membershipId,
          branchId: team.branchId,
          teamId: team.id,
        })),
      );
    }
  }
  private async membershipForUpdate(tx: Tx, cid: string, membershipId: string) {
    const [row] = await tx
      .select({ membership: schema.memberships, user: schema.users, roleCode: schema.roles.code })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.memberships.userId, schema.users.id))
      .innerJoin(schema.roles, eq(schema.memberships.roleId, schema.roles.id))
      .where(
        and(
          eq(schema.memberships.id, membershipId),
          eq(schema.memberships.clientOrganizationId, cid),
        ),
      )
      .for('update')
      .limit(1);
    if (!row) throw notFound('The client membership was not found.');
    return { ...row.membership, roleCode: row.roleCode, user: row.user };
  }
  private async ensureClientAdmin(
    tx: Tx,
    cid: string,
    oldRole: string,
    newRole: string,
    newStatus: string,
  ) {
    if (oldRole !== 'CLIENT_ADMIN' || (newRole === 'CLIENT_ADMIN' && newStatus === 'ACTIVE'))
      return;
    const rows = await tx
      .select({ id: schema.memberships.id })
      .from(schema.memberships)
      .innerJoin(schema.roles, eq(schema.memberships.roleId, schema.roles.id))
      .where(
        and(
          eq(schema.memberships.clientOrganizationId, cid),
          eq(schema.memberships.status, 'ACTIVE'),
          eq(schema.roles.code, 'CLIENT_ADMIN'),
        ),
      )
      .for('update');
    if (rows.length <= 1)
      throw conflict('At least one active Client Admin must remain for an active client.');
  }
  private presentMembership(
    membership: typeof schema.memberships.$inferSelect,
    user: typeof schema.users.$inferSelect,
  ) {
    return {
      user: {
        user_id: user.id,
        display_name: user.displayName,
        email: user.primaryEmailNormalized,
        user_status: user.status,
        membership_id: membership.id,
        membership_status: membership.status,
        role_code: 'CLIENT_ADMIN',
        branch_scope_mode: membership.branchScopeMode,
        branch_ids: [],
        team_scope_mode: membership.teamScopeMode,
        team_ids: [],
        assignment_scope: membership.assignmentScope,
      },
      invitation_delivery: 'UNAVAILABLE' as const,
    };
  }
}
