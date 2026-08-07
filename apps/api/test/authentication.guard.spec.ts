import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import type { ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CANONICAL_ROLE_CODES, type CanonicalRoleCode, type PermissionCode } from '@gdm/contracts';
import { AccessTokenService } from '../src/auth/access-token.service.js';
import type { SessionAccessRecord } from '../src/auth/auth-store.js';
import { AuthenticationGuard } from '../src/authorization/authentication.guard.js';
import { AuthorizationPolicy } from '../src/authorization/authorization-policy.js';
import type { ClientModuleAccessService } from '../src/authorization/client-module-access.service.js';
import {
  BRANCH_PARAMETER_KEY,
  REQUIRED_PERMISSIONS_KEY,
} from '../src/authorization/authorization.decorators.js';
import type { AuthorizationContext } from '../src/authorization/authorization.types.js';
import { authStoreStub, TEST_AUTH_CONFIG } from './auth-test-fixtures.js';

function exceptionCode(error: unknown): string | undefined {
  if (!(error instanceof HttpException)) return undefined;
  const response = error.getResponse();
  return typeof response === 'object' && response !== null && 'code' in response
    ? String(response.code)
    : undefined;
}

function accessContext(
  roleCode: CanonicalRoleCode,
  permissionCodes: readonly PermissionCode[],
): AuthorizationContext {
  return {
    assignmentScope: 'ASSIGNED',
    branchIds: new Set(['11111111-1111-4111-8111-111111111111']),
    branchScopeMode: 'SELECTED',
    departmentIds: new Set(['22222222-2222-4222-8222-222222222223']),
    departmentScopeMode: 'SELECTED',
    clientOrganizationId: '22222222-2222-4222-8222-222222222222',
    membershipId: randomUUID(),
    managedTeamIds: new Set<string>(),
    permissionCodes: new Set(permissionCodes),
    roleCode,
    sessionId: randomUUID(),
    teamIds: new Set(['33333333-3333-4333-8333-333333333333']),
    teamScopeMode: 'SELECTED',
    userId: randomUUID(),
  };
}

function activeSession(context: AuthorizationContext): SessionAccessRecord {
  const now = new Date();
  return {
    context,
    membership: {
      assignmentScope: context.assignmentScope,
      branchIds: [...context.branchIds],
      branchScopeMode: context.branchScopeMode,
      departmentIds: [...context.departmentIds],
      departmentScopeMode: context.departmentScopeMode,
      clientAgencyId: randomUUID(),
      clientDisplayName: 'Tenant Alpha',
      clientLegalName: 'Tenant Alpha Private Limited',
      ...(context.clientOrganizationId
        ? { clientOrganizationId: context.clientOrganizationId }
        : {}),
      clientStatus: 'ACTIVE',
      clientTimezone: 'Asia/Kolkata',
      contextType: 'CLIENT',
      effectiveFrom: now,
      id: context.membershipId,
      managedTeamIds: [...context.managedTeamIds],
      organizationDisplayName: 'Tenant Alpha',
      permissionCodes: [...context.permissionCodes],
      roleApplication: ['SALESPERSON', 'TEST_RIDE_EXECUTIVE', 'DELIVERY_EXECUTIVE'].includes(
        context.roleCode,
      )
        ? 'MOBILE'
        : 'WEB',
      roleCode: context.roleCode as CanonicalRoleCode,
      roleDisplayName: context.roleCode,
      roleId: randomUUID(),
      status: 'ACTIVE',
      teamIds: [...context.teamIds],
      teamScopeMode: context.teamScopeMode,
      userId: context.userId,
    },
    session: {
      clientType: 'web',
      createdAt: now,
      current: true,
      expiresAt: new Date(now.getTime() + 86_400_000),
      id: context.sessionId,
      lastSeenAt: now,
      platform: 'web',
    },
    sessionExpiresAt: new Date(now.getTime() + 86_400_000),
    userDisplayName: 'Role Test User',
    userEmail: 'role-test@example.com',
    userStatus: 'ACTIVE',
  };
}

function executionContext(request: object, handler: () => void): ExecutionContext {
  class TestController {
    readonly controllerName = 'TestController';
  }

  return {
    getClass: () => TestController,
    getHandler: () => handler,
    getType: () => 'http',
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToHttp: () => ({
      getNext: () => undefined,
      getRequest: () => request,
      getResponse: () => ({}),
    }),
    switchToRpc: () => ({ getContext: () => undefined, getData: () => undefined }),
    switchToWs: () => ({
      getClient: () => undefined,
      getData: () => undefined,
      getPattern: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

describe('AuthenticationGuard role and scope enforcement', () => {
  it('covers every role family and denies organization-user reads outside mapped roles', async () => {
    const permittedRoles = new Set<CanonicalRoleCode>([
      'AGENCY_ADMIN',
      'CLIENT_ADMIN',
      'MANAGER',
      'SALES_MANAGER',
    ]);
    const tokens = new AccessTokenService(TEST_AUTH_CONFIG);

    for (const roleCode of CANONICAL_ROLE_CODES) {
      const permissions: PermissionCode[] = permittedRoles.has(roleCode)
        ? ['organization.users.read']
        : ['account.profile.read'];
      const authorization = accessContext(roleCode, permissions);
      const store = authStoreStub({
        resolveSession: () =>
          Promise.resolve({ kind: 'active', value: activeSession(authorization) }),
      });
      const guard = new AuthenticationGuard(
        new Reflector(),
        tokens,
        store,
        new AuthorizationPolicy(),
        { assertEnabled: () => Promise.resolve() } as unknown as ClientModuleAccessService,
      );
      const handler = (): undefined => undefined;
      Reflect.defineMetadata(REQUIRED_PERMISSIONS_KEY, ['organization.users.read'], handler);
      const access = await tokens.issue({
        membershipId: authorization.membershipId,
        sessionId: authorization.sessionId,
        userId: authorization.userId,
      });
      const request = {
        headers: { authorization: `Bearer ${access.token}` },
        method: 'GET',
        params: {},
        url: '/v1/users',
      };

      if (permittedRoles.has(roleCode)) {
        assert.equal(await guard.canActivate(executionContext(request, handler)), true);
      } else {
        await assert.rejects(
          guard.canActivate(executionContext(request, handler)),
          (error: unknown) => exceptionCode(error) === 'FORBIDDEN',
          roleCode,
        );
      }
    }
  });

  it('denies and audits a branch identifier outside the live membership scope', async () => {
    const authorization = accessContext('SALESPERSON', ['organization.branches.read']);
    let audited = false;
    const store = authStoreStub({
      recordAuthenticationAudit: () => {
        audited = true;
        return Promise.resolve();
      },
      resolveSession: () =>
        Promise.resolve({ kind: 'active', value: activeSession(authorization) }),
    });
    const tokens = new AccessTokenService(TEST_AUTH_CONFIG);
    const guard = new AuthenticationGuard(
      new Reflector(),
      tokens,
      store,
      new AuthorizationPolicy(),
      { assertEnabled: () => Promise.resolve() } as unknown as ClientModuleAccessService,
    );
    const handler = (): undefined => undefined;
    Reflect.defineMetadata(REQUIRED_PERMISSIONS_KEY, ['organization.branches.read'], handler);
    Reflect.defineMetadata(BRANCH_PARAMETER_KEY, 'branchId', handler);
    const access = await tokens.issue({
      membershipId: authorization.membershipId,
      sessionId: authorization.sessionId,
      userId: authorization.userId,
    });
    const request = {
      headers: { authorization: `Bearer ${access.token}` },
      method: 'GET',
      params: { branchId: '44444444-4444-4444-8444-444444444444' },
      url: '/v1/branches/44444444-4444-4444-8444-444444444444',
    };

    await assert.rejects(
      guard.canActivate(executionContext(request, handler)),
      (error: unknown) => exceptionCode(error) === 'SCOPE_DENIED',
    );
    assert.equal(audited, true);
  });
});
