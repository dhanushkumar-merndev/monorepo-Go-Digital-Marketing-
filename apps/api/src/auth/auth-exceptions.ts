import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

export function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'INVALID_CREDENTIALS',
    details: [],
    message: 'The email or password is incorrect.',
    retryable: false,
  });
}

export function authenticationFailure(
  code:
    | 'ACCOUNT_DISABLED'
    | 'ACCOUNT_SUSPENDED'
    | 'CLIENT_INACTIVE'
    | 'MEMBERSHIP_INACTIVE'
    | 'MEMBERSHIP_REQUIRED'
    | 'MFA_CHALLENGE_INVALID'
    | 'PASSWORD_RESET_TOKEN_INVALID'
    | 'REFRESH_TOKEN_INVALID'
    | 'REFRESH_TOKEN_REUSED'
    | 'SESSION_EXPIRED'
    | 'SESSION_REVOKED',
  message: string,
): UnauthorizedException | ForbiddenException {
  const body = { code, details: [], message, retryable: false };

  return code === 'ACCOUNT_DISABLED' ||
    code === 'ACCOUNT_SUSPENDED' ||
    code === 'CLIENT_INACTIVE' ||
    code === 'MEMBERSHIP_INACTIVE' ||
    code === 'MEMBERSHIP_REQUIRED'
    ? new ForbiddenException(body)
    : new UnauthorizedException(body);
}
