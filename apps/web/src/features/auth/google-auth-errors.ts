import { ApiClientError } from './auth-api-client';

export interface AuthenticationErrorMessage {
  description: string;
  title: string;
}

export function googleLoginErrorMessage(error: unknown): AuthenticationErrorMessage {
  const code = error instanceof ApiClientError ? error.code : undefined;

  switch (code) {
    case 'GOOGLE_ACCOUNT_NOT_INVITED':
      return {
        description:
          'This Google account does not have a CRM invitation. Ask your administrator to invite it before trying again.',
        title: 'Account not invited',
      };
    case 'GOOGLE_ACCOUNT_LINKING_REQUIRED':
      return {
        description:
          'An account with this email already exists. Sign in with its password, then connect Google from your profile.',
        title: 'Account linking required',
      };
    case 'ACCOUNT_DISABLED':
    case 'ACCOUNT_INACTIVE':
    case 'ACCOUNT_SUSPENDED':
    case 'CLIENT_INACTIVE':
    case 'MEMBERSHIP_INACTIVE':
      return {
        description:
          'This account, membership, or client workspace is disabled. Contact your administrator.',
        title: 'Account access disabled',
      };
    case 'GOOGLE_EMAIL_UNVERIFIED':
      return {
        description: 'Google has not verified this email address, so it cannot be used to sign in.',
        title: 'Email not verified',
      };
    case 'GOOGLE_TOKEN_INVALID':
      return {
        description: 'Google sign-in could not be verified. Start again and choose your account.',
        title: 'Google verification failed',
      };
    case 'NETWORK_ERROR':
    case 'PROVIDER_UNAVAILABLE':
      return {
        description:
          'Google sign-in is temporarily unavailable. Check your connection and try again.',
        title: 'Google sign-in unavailable',
      };
    default:
      return {
        description: 'Google sign-in could not be completed. Try again.',
        title: 'Google sign-in failed',
      };
  }
}

export function googleLinkErrorMessage(error: unknown): AuthenticationErrorMessage {
  const code = error instanceof ApiClientError ? error.code : undefined;

  switch (code) {
    case 'GOOGLE_IDENTITY_CONFLICT':
      return {
        description: 'This Google identity is already connected to another CRM account.',
        title: 'Google account already connected',
      };
    case 'GOOGLE_EMAIL_UNVERIFIED':
      return {
        description: 'Google has not verified this email address, so it cannot be connected.',
        title: 'Email not verified',
      };
    case 'GOOGLE_TOKEN_INVALID':
      return {
        description:
          'The Google identity response could not be verified. Start the connection again.',
        title: 'Google verification failed',
      };
    case 'NETWORK_ERROR':
    case 'PROVIDER_UNAVAILABLE':
      return {
        description: 'Google is temporarily unavailable. Check your connection and try again.',
        title: 'Google connection unavailable',
      };
    default:
      return {
        description: 'Google could not be connected to this account. Try again.',
        title: 'Connection failed',
      };
  }
}

export function googleUnlinkErrorMessage(error: unknown): AuthenticationErrorMessage {
  const code = error instanceof ApiClientError ? error.code : undefined;

  if (code === 'LAST_LOGIN_METHOD') {
    return {
      description: 'Google cannot be removed until another valid sign-in method is connected.',
      title: 'Another sign-in method is required',
    };
  }

  return {
    description:
      'Google could not be disconnected. Your existing sign-in method remains unchanged.',
    title: 'Disconnection failed',
  };
}
