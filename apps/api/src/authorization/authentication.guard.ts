import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PermissionCode } from '@gdm/contracts';
import type { Request } from 'express';
import { AccessTokenService } from '../auth/access-token.service.js';
import { AUTH_STORE, type AuthStore, type SessionResolution } from '../auth/auth-store.js';
import { authenticationRequestMetadata } from '../auth/request-metadata.js';
import type { AuthenticatedRequest, AuthorizationContext } from './authorization.types.js';
import { AuthorizationPolicy } from './authorization-policy.js';
import {
  BRANCH_PARAMETER_KEY,
  CLIENT_CONTEXT_REQUIRED_KEY,
  CLIENT_MODULE_REQUIRED_KEY,
  PUBLIC_ROUTE_KEY,
  REQUIRED_PERMISSIONS_KEY,
  TEAM_PARAMETER_KEY,
} from './authorization.decorators.js';
import { ClientModuleAccessService, type ClientModule } from './client-module-access.service.js';

function bearerToken(request: Request): string | undefined {
  const header = request.headers.authorization;

  if (!header) {
    return undefined;
  }

  const [scheme, token, extra] = header.trim().split(/\s+/u);
  return scheme?.toLowerCase() === 'bearer' && token && !extra ? token : undefined;
}

function sessionException(result: Exclude<SessionResolution, { kind: 'active' }>): Error {
  switch (result.kind) {
    case 'user_inactive':
      return new ForbiddenException({
        code: 'ACCOUNT_SUSPENDED',
        details: [],
        message: 'This account is not active.',
        retryable: false,
      });
    case 'membership_inactive':
      return new ForbiddenException({
        code: 'MEMBERSHIP_INACTIVE',
        details: [],
        message: 'This membership is not active.',
        retryable: false,
      });
    case 'client_inactive':
      return new ForbiddenException({
        code: 'CLIENT_INACTIVE',
        details: [],
        message: 'This client organization is not active.',
        retryable: false,
      });
    case 'session_revoked':
      return new UnauthorizedException({
        code: 'SESSION_REVOKED',
        details: [],
        message: 'This session has been revoked.',
        retryable: false,
      });
    case 'session_expired':
      return new UnauthorizedException({
        code: 'SESSION_EXPIRED',
        details: [],
        message: 'This session has expired.',
        retryable: false,
      });
  }
}

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AccessTokenService) private readonly tokens: AccessTokenService,
    @Inject(AUTH_STORE) private readonly store: AuthStore,
    @Inject(AuthorizationPolicy) private readonly policy: AuthorizationPolicy,
    @Inject(ClientModuleAccessService) private readonly modules: ClientModuleAccessService,
  ) {}

  async canActivate(executionContext: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE_KEY, [
      executionContext.getHandler(),
      executionContext.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const requiredPermissions = this.reflector.getAllAndOverride<PermissionCode[]>(
      REQUIRED_PERMISSIONS_KEY,
      [executionContext.getHandler(), executionContext.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        details: [],
        message: 'This protected route has no authorization policy.',
        retryable: false,
      });
    }

    const request = executionContext.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(request);
    const claims = token ? await this.tokens.verify(token) : undefined;

    if (!claims) {
      throw new UnauthorizedException({
        code: 'SESSION_EXPIRED',
        details: [],
        message: 'A valid access token is required.',
        retryable: false,
      });
    }

    const resolution = await this.store.resolveSession(
      claims.sessionId,
      claims.membershipId,
      new Date(),
    );

    if (resolution.kind !== 'active') {
      throw sessionException(resolution);
    }

    const authorization = resolution.value.context;

    if (authorization.userId !== claims.userId) {
      throw new UnauthorizedException({
        code: 'SESSION_REVOKED',
        details: [],
        message: 'The access token no longer matches this session.',
        retryable: false,
      });
    }

    if (!this.policy.hasEveryPermission(authorization, requiredPermissions)) {
      await this.recordAccessDenied(request, authorization, 'PERMISSION_DENIED', {
        required_permissions: requiredPermissions,
      });
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        details: [],
        message: 'You do not have permission to perform this action.',
        retryable: false,
      });
    }

    const requiresClient = this.reflector.getAllAndOverride<boolean>(CLIENT_CONTEXT_REQUIRED_KEY, [
      executionContext.getHandler(),
      executionContext.getClass(),
    ]);

    if (requiresClient && !authorization.clientOrganizationId) {
      await this.recordAccessDenied(request, authorization, 'CLIENT_CONTEXT_REQUIRED');
      throw new ForbiddenException({
        code: 'SUPPORT_ELEVATION_REQUIRED',
        details: [],
        message: 'An active client membership or support elevation is required.',
        retryable: false,
      });
    }

    const requiredModule = this.reflector.getAllAndOverride<ClientModule>(
      CLIENT_MODULE_REQUIRED_KEY,
      [executionContext.getHandler(), executionContext.getClass()],
    );
    if (requiredModule) {
      if (!authorization.clientOrganizationId)
        throw new ForbiddenException({
          code: 'SUPPORT_ELEVATION_REQUIRED',
          details: [],
          message: 'An active client context is required.',
          retryable: false,
        });
      await this.modules.assertEnabled(authorization.clientOrganizationId, requiredModule);
    }

    const branchParameter = this.reflector.getAllAndOverride<string>(BRANCH_PARAMETER_KEY, [
      executionContext.getHandler(),
      executionContext.getClass(),
    ]);
    const teamParameter = this.reflector.getAllAndOverride<string>(TEAM_PARAMETER_KEY, [
      executionContext.getHandler(),
      executionContext.getClass(),
    ]);
    const parameters = request.params ?? {};

    const branchId = branchParameter ? parameters[branchParameter] : undefined;
    const teamId = teamParameter ? parameters[teamParameter] : undefined;

    if (
      branchParameter &&
      (typeof branchId !== 'string' || !this.policy.canAccessBranch(authorization, branchId))
    ) {
      await this.recordAccessDenied(request, authorization, 'BRANCH_SCOPE_DENIED', {
        requested_branch_id: branchId ?? null,
      });
      throw new ForbiddenException({
        code: 'SCOPE_DENIED',
        details: [],
        message: 'The requested branch is outside your assigned scope.',
        retryable: false,
      });
    }

    if (
      teamParameter &&
      (typeof teamId !== 'string' || !this.policy.canAccessTeam(authorization, teamId))
    ) {
      await this.recordAccessDenied(request, authorization, 'TEAM_SCOPE_DENIED', {
        requested_team_id: teamId ?? null,
      });
      throw new ForbiddenException({
        code: 'SCOPE_DENIED',
        details: [],
        message: 'The requested team is outside your assigned scope.',
        retryable: false,
      });
    }

    request.authorization = authorization;
    await this.store.touchSession(authorization.sessionId, new Date());
    return true;
  }

  private async recordAccessDenied(
    request: Request,
    authorization: AuthorizationContext,
    reason: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    await this.store.recordAuthenticationAudit({
      ...authenticationRequestMetadata(request),
      ...(authorization.clientOrganizationId
        ? { clientOrganizationId: authorization.clientOrganizationId }
        : {}),
      eventType: 'ACCESS_DENIED',
      membershipId: authorization.membershipId,
      metadata: { ...metadata, reason },
      outcome: 'DENIED',
      sessionId: authorization.sessionId,
      userId: authorization.userId,
    });
  }
}
