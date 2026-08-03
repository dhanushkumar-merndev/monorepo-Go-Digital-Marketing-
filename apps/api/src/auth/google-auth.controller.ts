import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type {
  AuthenticationMethodsResponse,
  GoogleAuthChallengeResponse,
  GoogleLinkResponse,
  GoogleLoginResponse,
  GoogleUnlinkResponse,
} from '@gdm/contracts';
import type { ApiEnvironment } from '@gdm/config';
import type { Request, Response } from 'express';
import {
  CurrentAuthorization,
  Public,
  RequirePermissions,
} from '../authorization/authorization.decorators.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';
import { ApiErrorEnvelopeDto } from '../common/errors/api-error.dto.js';
import { ZodSchemaValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { API_ENVIRONMENT } from '../config/api-config.module.js';
import { assertTrustedBrowserOrigin } from './browser-origin.js';
import {
  AuthenticationMethodsResponseDto,
  GoogleAuthChallengeDto,
  GoogleAuthChallengeResponseDto,
  GoogleLinkDto,
  GoogleLinkResponseDto,
  GoogleLoginDto,
  GoogleUnlinkResponseDto,
  LoginResponseDto,
} from './auth.dto.js';
import { AuthenticationRateLimiter } from './authentication-rate-limiter.js';
import { AUTH_RUNTIME_CONFIG, type AuthRuntimeConfig } from './auth-runtime-config.js';
import { GoogleAuthenticationService } from './google-authentication.service.js';
import { authenticationRequestMetadata, authenticationSourceIp } from './request-metadata.js';
import { clearRefreshCookie, setRefreshCookie } from './refresh-cookie.js';

const NO_STORE = 'no-store';

@ApiTags('authentication')
@ApiBadRequestResponse({ type: ApiErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ApiErrorEnvelopeDto })
@ApiForbiddenResponse({ type: ApiErrorEnvelopeDto })
@ApiTooManyRequestsResponse({ type: ApiErrorEnvelopeDto })
@Controller('auth')
export class GoogleAuthController {
  constructor(
    @Inject(GoogleAuthenticationService) private readonly google: GoogleAuthenticationService,
    @Inject(AuthenticationRateLimiter)
    private readonly rateLimiter: AuthenticationRateLimiter,
    @Inject(AUTH_RUNTIME_CONFIG) private readonly config: AuthRuntimeConfig,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  @Public()
  @Post('google/challenge')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', NO_STORE)
  @ApiOperation({ summary: 'Create a one-time Google login nonce' })
  @ApiBody({ type: GoogleAuthChallengeDto })
  @ApiOkResponse({ type: GoogleAuthChallengeResponseDto })
  async challenge(
    @Body(new ZodSchemaValidationPipe(GoogleAuthChallengeDto.schema))
    body: GoogleAuthChallengeDto,
    @Req() request: Request,
  ): Promise<GoogleAuthChallengeResponse> {
    if (body.client_type === 'web') assertTrustedBrowserOrigin(request, this.environment);
    await this.rateLimiter.assertAllowed(
      'google-challenge-ip',
      authenticationSourceIp(request) ?? 'unresolved',
      60,
      15 * 60_000,
    );
    return this.google.createLoginChallenge(body.client_type);
  }

  @Public()
  @Post('google/login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', NO_STORE)
  @ApiOperation({ summary: 'Authenticate an invited or Google-linked user' })
  @ApiBody({ type: GoogleLoginDto })
  @ApiOkResponse({ type: LoginResponseDto })
  async login(
    @Body(new ZodSchemaValidationPipe(GoogleLoginDto.schema)) body: GoogleLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<GoogleLoginResponse> {
    if (body.client_type === 'web') assertTrustedBrowserOrigin(request, this.environment);
    await this.rateLimiter.assertAllowed(
      'google-login-ip',
      authenticationSourceIp(request) ?? 'unresolved',
      30,
      15 * 60_000,
    );
    const result = await this.google.login(body, authenticationRequestMetadata(request));
    if (body.client_type === 'web') {
      setRefreshCookie(
        response,
        this.config,
        result.refreshToken,
        result.payload.refresh_token_expires_at,
      );
    }
    return result.payload;
  }

  @Post('google/link-challenge')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', NO_STORE)
  @ApiBearerAuth()
  @RequirePermissions('account.profile.update')
  @ApiOperation({ summary: 'Create a session-bound Google account-linking nonce' })
  @ApiOkResponse({ type: GoogleAuthChallengeResponseDto })
  async linkChallenge(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Req() request: Request,
  ): Promise<GoogleAuthChallengeResponse> {
    await this.rateLimiter.assertAllowed(
      'google-link-challenge-session',
      authorization.sessionId,
      20,
      15 * 60_000,
    );
    void request;
    return this.google.createLinkChallenge(authorization);
  }

  @Post('google/link')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', NO_STORE)
  @ApiBearerAuth()
  @RequirePermissions('account.profile.update')
  @ApiOperation({ summary: 'Link a verified Google identity to the current user' })
  @ApiBody({ type: GoogleLinkDto })
  @ApiOkResponse({ type: GoogleLinkResponseDto })
  async link(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Body(new ZodSchemaValidationPipe(GoogleLinkDto.schema)) body: GoogleLinkDto,
    @Req() request: Request,
  ): Promise<GoogleLinkResponse> {
    await this.rateLimiter.assertAllowed(
      'google-link-session',
      authorization.sessionId,
      10,
      15 * 60_000,
    );
    return this.google.link(authorization, body, authenticationRequestMetadata(request));
  }

  @Get('methods')
  @Header('Cache-Control', NO_STORE)
  @ApiBearerAuth()
  @RequirePermissions('account.profile.read')
  @ApiOperation({ summary: 'List connected authentication methods' })
  @ApiOkResponse({ type: AuthenticationMethodsResponseDto })
  methods(
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<AuthenticationMethodsResponse> {
    return this.google.methods(authorization);
  }

  @Delete('google')
  @Header('Cache-Control', NO_STORE)
  @ApiBearerAuth()
  @RequirePermissions('account.profile.update')
  @ApiOperation({ summary: 'Unlink Google when another login method remains' })
  @ApiOkResponse({ type: GoogleUnlinkResponseDto })
  async unlink(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<GoogleUnlinkResponse> {
    const result = await this.google.unlink(authorization, authenticationRequestMetadata(request));
    if (result.current_session_revoked) clearRefreshCookie(response, this.config);
    return result;
  }
}
