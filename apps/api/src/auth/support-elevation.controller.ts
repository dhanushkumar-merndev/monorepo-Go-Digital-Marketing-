import {
  Body,
  Controller,
  Delete,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { SupportElevationResponse } from '@gdm/contracts';
import type { Request } from 'express';
import {
  CurrentAuthorization,
  RequirePermissions,
} from '../authorization/authorization.decorators.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';
import { ApiErrorEnvelopeDto } from '../common/errors/api-error.dto.js';
import { ZodSchemaValidationPipe } from '../common/validation/zod-validation.pipe.js';
import {
  CreateSupportElevationDto,
  RevokeSupportElevationDto,
  SupportElevationResponseDto,
} from './auth.dto.js';
import { AuthenticationService } from './authentication.service.js';
import { authenticationRequestMetadata } from './request-metadata.js';

@ApiTags('support elevation')
@ApiBearerAuth()
@ApiBadRequestResponse({ type: ApiErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ApiErrorEnvelopeDto })
@ApiForbiddenResponse({ type: ApiErrorEnvelopeDto })
@Controller('support-elevation')
export class SupportElevationController {
  constructor(
    @Inject(AuthenticationService) private readonly authentication: AuthenticationService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('platform.support_elevation.manage')
  @ApiOperation({ summary: 'Start short-lived, reasoned support access to one client' })
  @ApiBody({ type: CreateSupportElevationDto })
  @ApiOkResponse({ type: SupportElevationResponseDto })
  async create(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Body(new ZodSchemaValidationPipe(CreateSupportElevationDto.schema))
    body: CreateSupportElevationDto,
    @Req() request: Request,
  ): Promise<SupportElevationResponse> {
    return this.authentication.createSupportElevation(
      authorization,
      body,
      authenticationRequestMetadata(request),
    );
  }

  @Delete()
  @Header('Cache-Control', 'no-store')
  @RequirePermissions('platform.support_elevation.manage')
  @ApiOperation({ summary: 'Revoke the current support elevation' })
  @ApiBody({ type: RevokeSupportElevationDto })
  @ApiOkResponse({ type: SupportElevationResponseDto })
  async revoke(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Body(new ZodSchemaValidationPipe(RevokeSupportElevationDto.schema))
    body: RevokeSupportElevationDto,
    @Req() request: Request,
  ): Promise<SupportElevationResponse> {
    return this.authentication.revokeSupportElevation(
      authorization,
      body.reason,
      authenticationRequestMetadata(request),
    );
  }
}
