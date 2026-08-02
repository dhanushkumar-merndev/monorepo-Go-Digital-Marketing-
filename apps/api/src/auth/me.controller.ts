import { Controller, Get, Header, Inject } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { MeResponse } from '@gdm/contracts';
import {
  CurrentAuthorization,
  RequirePermissions,
} from '../authorization/authorization.decorators.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';
import { ApiErrorEnvelopeDto } from '../common/errors/api-error.dto.js';
import { AuthenticationService } from './authentication.service.js';
import { MeResponseDto } from './auth.dto.js';

@ApiTags('profile')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ type: ApiErrorEnvelopeDto })
@ApiForbiddenResponse({ type: ApiErrorEnvelopeDto })
@Controller('me')
export class MeController {
  constructor(
    @Inject(AuthenticationService) private readonly authentication: AuthenticationService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('account.profile.read')
  @ApiOperation({ summary: 'Return the live user, membership, permission, and support context' })
  @ApiOkResponse({ type: MeResponseDto })
  async me(@CurrentAuthorization() authorization: AuthorizationContext): Promise<MeResponse> {
    return this.authentication.me(authorization);
  }
}
