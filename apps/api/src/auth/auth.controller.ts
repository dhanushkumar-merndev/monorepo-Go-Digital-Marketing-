import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type {
  ForgotPasswordResponse,
  LoginResponse,
  LogoutAllResponse,
  LogoutResponse,
  RefreshResponse,
  ResetPasswordResponse,
  RevokeSessionResponse,
  SessionListResponse,
  SwitchMembershipResponse,
} from '@gdm/contracts';
import type { ApiEnvironment } from '@gdm/config';
import type { Request, Response } from 'express';
import {
  CurrentAuthorization,
  Public,
  RequirePermissions,
} from '../authorization/authorization.decorators.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';
import { ZodSchemaValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { ApiErrorEnvelopeDto } from '../common/errors/api-error.dto.js';
import { API_ENVIRONMENT } from '../config/api-config.module.js';
import {
  BooleanSuccessResponseDto,
  ForgotPasswordDto,
  LoggedOutResponseDto,
  LoginDto,
  LoginResponseDto,
  LogoutAllResponseDto,
  LogoutDto,
  PasswordResetResponseDto,
  RefreshDto,
  RefreshResponseDto,
  ResetPasswordDto,
  RevokedResponseDto,
  SessionListResponseDto,
  SwitchMembershipDto,
  SwitchMembershipResponseDto,
} from './auth.dto.js';
import { AuthenticationService } from './authentication.service.js';
import { AuthenticationRateLimiter } from './authentication-rate-limiter.js';
import { AUTH_RUNTIME_CONFIG, type AuthRuntimeConfig } from './auth-runtime-config.js';
import { authenticationRequestMetadata, authenticationSourceIp } from './request-metadata.js';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-cookie.js';
import { assertTrustedBrowserOrigin } from './browser-origin.js';

const NO_STORE = 'no-store';

function assertUnambiguousRefreshTransport(
  bodyToken: string | undefined,
  cookieToken: string | undefined,
): void {
  if (bodyToken !== undefined && cookieToken !== undefined) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      details: [
        {
          field: 'refresh_token',
          reason:
            'Send a refresh token in either the request body or the refresh cookie, not both.',
        },
      ],
      message: 'The refresh-token transport is ambiguous.',
      retryable: false,
    });
  }
}

@ApiTags('authentication')
@ApiBadRequestResponse({ type: ApiErrorEnvelopeDto })
@ApiUnauthorizedResponse({ type: ApiErrorEnvelopeDto })
@ApiForbiddenResponse({ type: ApiErrorEnvelopeDto })
@ApiTooManyRequestsResponse({ type: ApiErrorEnvelopeDto })
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthenticationService) private readonly authentication: AuthenticationService,
    @Inject(AuthenticationRateLimiter)
    private readonly rateLimiter: AuthenticationRateLimiter,
    @Inject(AUTH_RUNTIME_CONFIG) private readonly config: AuthRuntimeConfig,
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', NO_STORE)
  @ApiOperation({ summary: 'Authenticate with an email and password' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Session created', type: LoginResponseDto })
  async login(
    @Body(new ZodSchemaValidationPipe(LoginDto.schema)) body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LoginResponse> {
    if (body.client_type === 'web') {
      assertTrustedBrowserOrigin(request, this.environment);
    }

    const sourceIp = authenticationSourceIp(request) ?? 'unresolved';
    await this.rateLimiter.assertAllowed('login-ip', sourceIp, 30, 15 * 60_000);
    await this.rateLimiter.assertAllowed(
      'login-account',
      `${sourceIp}|${body.email}`,
      10,
      15 * 60_000,
    );

    const result = await this.authentication.login(body, authenticationRequestMetadata(request));

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

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', NO_STORE)
  @ApiOperation({ summary: 'Rotate a refresh token and issue a new access token' })
  @ApiBody({ type: RefreshDto })
  @ApiCookieAuth('refreshCookie')
  @ApiOkResponse({ description: 'Refresh token rotated', type: RefreshResponseDto })
  async refresh(
    @Body(new ZodSchemaValidationPipe(RefreshDto.schema)) body: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RefreshResponse> {
    const cookieToken = readRefreshCookie(request, this.config);
    assertUnambiguousRefreshTransport(body.refresh_token, cookieToken);
    const usingCookie = body.refresh_token === undefined && cookieToken !== undefined;

    if (usingCookie) {
      assertTrustedBrowserOrigin(request, this.environment);
    }

    await this.rateLimiter.assertAllowed(
      'refresh-ip',
      authenticationSourceIp(request) ?? 'unresolved',
      240,
      15 * 60_000,
    );

    let result: Awaited<ReturnType<AuthenticationService['refresh']>>;
    try {
      result = await this.authentication.refresh(
        body.refresh_token ?? cookieToken,
        authenticationRequestMetadata(request),
      );
    } catch (error) {
      if (usingCookie) {
        clearRefreshCookie(response, this.config);
      }
      throw error;
    }

    if (usingCookie) {
      setRefreshCookie(
        response,
        this.config,
        result.refreshToken,
        result.payload.refresh_token_expires_at,
      );
      const { refresh_token: ignoredRefreshToken, ...cookiePayload } = result.payload;
      void ignoredRefreshToken;
      return cookiePayload;
    }

    if (body.refresh_token !== undefined) {
      return { ...result.payload, refresh_token: result.refreshToken };
    }

    return result.payload;
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Header('Cache-Control', NO_STORE)
  @ApiOperation({ summary: 'Request a non-enumerating password-reset delivery' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiAcceptedResponse({ type: BooleanSuccessResponseDto })
  async forgotPassword(
    @Body(new ZodSchemaValidationPipe(ForgotPasswordDto.schema)) body: ForgotPasswordDto,
    @Req() request: Request,
  ): Promise<ForgotPasswordResponse> {
    await this.rateLimiter.assertAllowed(
      'forgot-password-ip',
      authenticationSourceIp(request) ?? 'unresolved',
      10,
      60 * 60_000,
    );
    return this.authentication.forgotPassword(body.email, authenticationRequestMetadata(request));
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', NO_STORE)
  @ApiOperation({ summary: 'Consume a single-use password-reset token' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiOkResponse({ type: PasswordResetResponseDto })
  async resetPassword(
    @Body(new ZodSchemaValidationPipe(ResetPasswordDto.schema)) body: ResetPasswordDto,
    @Req() request: Request,
  ): Promise<ResetPasswordResponse> {
    await this.rateLimiter.assertAllowed(
      'reset-password-ip',
      authenticationSourceIp(request) ?? 'unresolved',
      10,
      60 * 60_000,
    );
    return this.authentication.resetPassword(
      body.token,
      body.new_password,
      authenticationRequestMetadata(request),
    );
  }

  @Post('switch-membership')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', NO_STORE)
  @ApiBearerAuth()
  @RequirePermissions('account.tenant.select')
  @ApiOperation({ summary: 'Select one of the authenticated user memberships' })
  @ApiBody({ type: SwitchMembershipDto })
  @ApiOkResponse({ type: SwitchMembershipResponseDto })
  async switchMembership(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Body(new ZodSchemaValidationPipe(SwitchMembershipDto.schema)) body: SwitchMembershipDto,
    @Req() request: Request,
  ): Promise<SwitchMembershipResponse> {
    return this.authentication.switchMembership(
      authorization,
      body.membership_id,
      authenticationRequestMetadata(request),
    );
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', NO_STORE)
  @ApiOperation({ summary: 'Revoke the refresh-token session and clear the browser cookie' })
  @ApiBody({ type: LogoutDto })
  @ApiCookieAuth('refreshCookie')
  @ApiOkResponse({ type: LoggedOutResponseDto })
  async logout(
    @Body(new ZodSchemaValidationPipe(LogoutDto.schema)) body: LogoutDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LogoutResponse> {
    const cookieToken = readRefreshCookie(request, this.config);
    assertUnambiguousRefreshTransport(body.refresh_token, cookieToken);
    const usingCookie = body.refresh_token === undefined && cookieToken !== undefined;

    if (usingCookie) {
      assertTrustedBrowserOrigin(request, this.environment);
    }

    await this.rateLimiter.assertAllowed(
      'logout-ip',
      authenticationSourceIp(request) ?? 'unresolved',
      120,
      15 * 60_000,
    );

    if (usingCookie) {
      clearRefreshCookie(response, this.config);
    }

    const result = await this.authentication.logout(
      body.refresh_token ?? cookieToken,
      authenticationRequestMetadata(request),
    );
    return result;
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', NO_STORE)
  @ApiBearerAuth()
  @RequirePermissions('account.sessions.revoke')
  @ApiOperation({ summary: 'Revoke every active session for the current user' })
  @ApiOkResponse({ type: LogoutAllResponseDto })
  async logoutAll(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<LogoutAllResponse> {
    const result = await this.authentication.logoutAll(
      authorization,
      authenticationRequestMetadata(request),
    );
    clearRefreshCookie(response, this.config);
    return result;
  }

  @Get('sessions')
  @Header('Cache-Control', NO_STORE)
  @ApiBearerAuth()
  @RequirePermissions('account.sessions.read')
  @ApiOperation({ summary: 'List active and recently revoked device sessions' })
  @ApiOkResponse({ type: SessionListResponseDto })
  async sessions(
    @CurrentAuthorization() authorization: AuthorizationContext,
  ): Promise<SessionListResponse> {
    return this.authentication.listSessions(authorization);
  }

  @Delete('sessions/:sessionId')
  @Header('Cache-Control', NO_STORE)
  @ApiBearerAuth()
  @RequirePermissions('account.sessions.revoke')
  @ApiOperation({ summary: 'Revoke one device session owned by the current user' })
  @ApiOkResponse({ type: RevokedResponseDto })
  async revokeSession(
    @CurrentAuthorization() authorization: AuthorizationContext,
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<RevokeSessionResponse> {
    const result = await this.authentication.revokeSession(
      authorization,
      sessionId,
      authenticationRequestMetadata(request),
    );

    if (sessionId === authorization.sessionId) {
      clearRefreshCookie(response, this.config);
    }

    return result;
  }
}
