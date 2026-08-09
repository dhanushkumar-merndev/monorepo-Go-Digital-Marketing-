import {
  Body,
  Controller,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type {
  MfaEnrollmentConfirmResponse,
  MfaEnrollmentStartResponse,
  MfaVerificationResponse,
} from '@gdm/contracts';
import type { ApiEnvironment } from '@gdm/config';
import type { Request, Response } from 'express';
import { Public } from '../authorization/authorization.decorators.js';
import { ApiErrorEnvelopeDto } from '../common/errors/api-error.dto.js';
import { ZodSchemaValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { API_ENVIRONMENT } from '../config/api-config.module.js';
import {
  LoginResponseDto,
  MfaEnrollmentConfirmDto,
  MfaEnrollmentStartDto,
  MfaEnrollmentStartResponseDto,
  MfaVerificationDto,
} from './auth.dto.js';
import { AuthenticationRateLimiter } from './authentication-rate-limiter.js';
import { AUTH_RUNTIME_CONFIG, type AuthRuntimeConfig } from './auth-runtime-config.js';
import { assertTrustedBrowserOrigin } from './browser-origin.js';
import { MfaService } from './mfa.service.js';
import { authenticationRequestMetadata, authenticationSourceIp } from './request-metadata.js';
import { setRefreshCookie } from './refresh-cookie.js';

@ApiTags('authentication')
@ApiUnauthorizedResponse({ type: ApiErrorEnvelopeDto })
@ApiTooManyRequestsResponse({ type: ApiErrorEnvelopeDto })
@Controller('auth/mfa')
export class MfaController {
  constructor(
    @Inject(MfaService) private readonly mfa: MfaService,
    @Inject(AuthenticationRateLimiter) private readonly rateLimiter: AuthenticationRateLimiter,
    @Inject(AUTH_RUNTIME_CONFIG) private readonly config: AuthRuntimeConfig,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  @Public()
  @Post('enrollment/start')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Start or resume Agency Admin TOTP enrollment' })
  @ApiBody({ type: MfaEnrollmentStartDto })
  @ApiOkResponse({ type: MfaEnrollmentStartResponseDto })
  async startEnrollment(
    @Body(new ZodSchemaValidationPipe(MfaEnrollmentStartDto.schema)) body: MfaEnrollmentStartDto,
    @Req() request: Request,
  ): Promise<MfaEnrollmentStartResponse> {
    this.assertOrigin(request);
    await this.limit(request, 'mfa-enrollment-start');
    return this.mfa.startEnrollment(body.challenge_token, authenticationRequestMetadata(request));
  }

  @Public()
  @Post('enrollment/confirm')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Confirm Agency Admin TOTP enrollment and create a session' })
  @ApiBody({ type: MfaEnrollmentConfirmDto })
  @ApiOkResponse({ type: LoginResponseDto })
  async confirmEnrollment(
    @Body(new ZodSchemaValidationPipe(MfaEnrollmentConfirmDto.schema))
    body: MfaEnrollmentConfirmDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MfaEnrollmentConfirmResponse> {
    this.assertOrigin(request);
    await this.limit(request, 'mfa-enrollment-confirm');
    const result = await this.mfa.confirmEnrollment(
      body.challenge_token,
      body.code,
      authenticationRequestMetadata(request),
    );
    if (result.clientType === 'web') {
      setRefreshCookie(
        response,
        this.config,
        result.refreshToken,
        result.payload.refresh_token_expires_at,
      );
    }
    return result.payload;
  }

  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Verify an Agency Admin TOTP or recovery code and create a session' })
  @ApiBody({ type: MfaVerificationDto })
  @ApiOkResponse({ type: LoginResponseDto })
  async verify(
    @Body(new ZodSchemaValidationPipe(MfaVerificationDto.schema)) body: MfaVerificationDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MfaVerificationResponse> {
    this.assertOrigin(request);
    await this.limit(request, 'mfa-verify');
    const result = await this.mfa.verify(body, authenticationRequestMetadata(request));
    if (result.clientType === 'web') {
      setRefreshCookie(
        response,
        this.config,
        result.refreshToken,
        result.payload.refresh_token_expires_at,
      );
    }
    return result.payload;
  }

  private assertOrigin(request: Request): void {
    const origin = request.headers.origin;
    if (origin !== undefined) assertTrustedBrowserOrigin(request, this.environment);
  }

  private async limit(request: Request, bucket: string): Promise<void> {
    await this.rateLimiter.assertAllowed(
      bucket,
      authenticationSourceIp(request) ?? 'unresolved',
      20,
      15 * 60_000,
    );
  }
}
