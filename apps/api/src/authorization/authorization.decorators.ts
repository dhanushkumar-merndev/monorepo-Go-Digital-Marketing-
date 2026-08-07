import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { PermissionCode } from '@gdm/contracts';
import type { AuthenticatedRequest, AuthorizationContext } from './authorization.types.js';
import type { ClientModule } from './client-module-access.service.js';

export const PUBLIC_ROUTE_KEY = 'gdm:public-route';
export const REQUIRED_PERMISSIONS_KEY = 'gdm:required-permissions';
export const BRANCH_PARAMETER_KEY = 'gdm:branch-parameter';
export const TEAM_PARAMETER_KEY = 'gdm:team-parameter';
export const CLIENT_CONTEXT_REQUIRED_KEY = 'gdm:client-context-required';
export const CLIENT_MODULE_REQUIRED_KEY = 'gdm:client-module-required';

export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(PUBLIC_ROUTE_KEY, true);

export const RequirePermissions = (
  ...permissions: PermissionCode[]
): MethodDecorator & ClassDecorator => SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

export const RequireBranchParameter = (parameter = 'branchId'): MethodDecorator & ClassDecorator =>
  SetMetadata(BRANCH_PARAMETER_KEY, parameter);

export const RequireTeamParameter = (parameter = 'teamId'): MethodDecorator & ClassDecorator =>
  SetMetadata(TEAM_PARAMETER_KEY, parameter);

export const RequireClientContext = (): MethodDecorator & ClassDecorator =>
  SetMetadata(CLIENT_CONTEXT_REQUIRED_KEY, true);

export const RequireClientModule = (module: ClientModule): MethodDecorator & ClassDecorator =>
  SetMetadata(CLIENT_MODULE_REQUIRED_KEY, module);

export const CurrentAuthorization = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthorizationContext => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.authorization) {
      throw new Error('Authorization context is unavailable on a protected route.');
    }

    return request.authorization;
  },
) as () => ParameterDecorator;
