import { describe, expect, it } from 'vitest';

import { ApiClientError } from './auth-api-client';
import { googleLoginErrorMessage } from './google-auth-errors';

describe('googleLoginErrorMessage', () => {
  it('explains how an unlinked Google account can get CRM access', () => {
    expect(
      googleLoginErrorMessage(
        new ApiClientError('Account is not linked.', 401, 'CRM_ACCOUNT_NOT_LINKED'),
      ),
    ).toEqual({
      description:
        'This Google account is not linked to a Go Digital CRM account. Contact your agency administrator to request access or link your account.',
      title: 'Google account not linked',
    });
  });
});
