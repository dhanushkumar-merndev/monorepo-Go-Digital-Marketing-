import { describe, expect, it } from 'vitest';

import {
  CANONICAL_ROLE_CODES,
  apiErrorEnvelopeSchema,
  createSupportElevationRequestSchema,
  googleAuthChallengeResponseSchema,
  googleLinkRequestSchema,
  googleLoginRequestSchema,
  loginAuthenticatedResponseSchema,
  loginMfaEnrollmentRequiredResponseSchema,
  loginMfaRequiredResponseSchema,
  loginRequestSchema,
  loginResponseSchema,
  membershipSummarySchema,
  mfaEnrollmentConfirmResponseSchema,
  mfaEnrollmentStartRequestSchema,
  mfaEnrollmentStartResponseSchema,
  mfaVerificationRequestSchema,
  setWorkingHoursRequestSchema,
} from '../index.js';

const id = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446761';
const otherId = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446762';
const timestamp = '2026-08-02T12:00:00.000Z';

describe('authentication and authorization contracts', () => {
  it('requires one working-hours entry for every weekday', () => {
    const openDay = (day: number) => ({
      closes_at: '18:00',
      day_of_week: day,
      is_closed: false,
      opens_at: '09:00',
    });
    expect(
      setWorkingHoursRequestSchema.safeParse({
        hours: [openDay(0), openDay(1), openDay(2), openDay(3), openDay(4), openDay(5), openDay(5)],
      }).success,
    ).toBe(false);
    expect(
      setWorkingHoursRequestSchema.safeParse({ hours: [0, 1, 2, 3, 4, 5, 6].map(openDay) }).success,
    ).toBe(true);
  });

  it('keeps all twelve role codes stable and distinct', () => {
    expect(CANONICAL_ROLE_CODES).toEqual([
      'AGENCY_ADMIN',
      'CLIENT_ADMIN',
      'MANAGER',
      'SALES_MANAGER',
      'TELECALLER',
      'SALESPERSON',
      'TEST_RIDE_EXECUTIVE',
      'INVENTORY_EXECUTIVE',
      'BILLING_DOCUMENTATION_EXECUTIVE',
      'DELIVERY_EXECUTIVE',
      'RC_REGISTRATION_EXECUTIVE',
      'TEAM_MANAGER',
    ]);
    expect(new Set(CANONICAL_ROLE_CODES).size).toBe(12);
  });

  it('normalizes login email while retaining a client-specific token transport', () => {
    expect(
      loginRequestSchema.parse({
        email: '  Admin@Example.COM ',
        password: 'not-validated-as-a-new-password',
        client_type: 'mobile',
        device: { platform: 'android', device_name: 'Pixel test device' },
      }),
    ).toEqual({
      email: 'admin@example.com',
      password: 'not-validated-as-a-new-password',
      client_type: 'mobile',
      device: { platform: 'android', device_name: 'Pixel test device' },
    });
  });

  it('discriminates authenticated, MFA verification and MFA enrollment login outcomes', () => {
    const challenge = {
      challenge_expires_at: timestamp,
      challenge_token: 'c'.repeat(48),
    };

    expect(
      loginResponseSchema.parse({
        ...challenge,
        methods: ['TOTP', 'RECOVERY_CODE'],
        status: 'MFA_REQUIRED',
      }),
    ).toMatchObject({ status: 'MFA_REQUIRED' });
    expect(
      loginResponseSchema.parse({
        ...challenge,
        status: 'MFA_ENROLLMENT_REQUIRED',
      }),
    ).toMatchObject({ status: 'MFA_ENROLLMENT_REQUIRED' });
    expect(
      loginMfaRequiredResponseSchema.safeParse({
        ...challenge,
        methods: [],
        status: 'MFA_REQUIRED',
      }).success,
    ).toBe(false);
    expect(
      loginMfaEnrollmentRequiredResponseSchema.safeParse({
        ...challenge,
        status: 'MFA_REQUIRED',
      }).success,
    ).toBe(false);
  });

  it('validates MFA enrollment and method-specific verification inputs', () => {
    const challengeToken = 'c'.repeat(48);
    expect(mfaEnrollmentStartRequestSchema.parse({ challenge_token: challengeToken })).toEqual({
      challenge_token: challengeToken,
    });
    expect(
      mfaEnrollmentStartResponseSchema.safeParse({
        authenticator_id: id,
        challenge_expires_at: timestamp,
        manual_secret: 'JBSWY3DPEHPK3PXP',
        otpauth_uri:
          'otpauth://totp/Go%20Digital%3Aadmin%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Go%20Digital',
        status: 'MFA_ENROLLMENT_REQUIRED',
      }).success,
    ).toBe(true);
    expect(
      mfaVerificationRequestSchema.safeParse({
        challenge_token: challengeToken,
        code: '012345',
        method: 'TOTP',
      }).success,
    ).toBe(true);
    expect(
      mfaVerificationRequestSchema.safeParse({
        challenge_token: challengeToken,
        code: 'ABCD-EFGH-IJKL-MNPQ',
        method: 'RECOVERY_CODE',
      }).success,
    ).toBe(true);
    expect(
      mfaVerificationRequestSchema.safeParse({
        challenge_token: challengeToken,
        code: 'ABCD-EFGH-IJKL-MNPQ',
        method: 'TOTP',
      }).success,
    ).toBe(false);
  });

  it('returns recovery codes only in the single-display enrollment completion response', () => {
    const authenticated = {
      access_token: 'a'.repeat(48),
      access_token_expires_at: timestamp,
      active_membership: null,
      memberships: [],
      permissions: [],
      refresh_token_expires_at: timestamp,
      requires_membership_selection: false,
      session: {
        client_type: 'web',
        created_at: timestamp,
        current: true,
        device_id: null,
        device_name: null,
        device_platform: 'web',
        expires_at: timestamp,
        id,
        last_seen_at: timestamp,
        revoked_at: null,
      },
      status: 'AUTHENTICATED',
      support_elevation: null,
      user: {
        display_name: 'Agency Admin',
        email: 'admin@example.com',
        id,
        status: 'ACTIVE',
      },
    } as const;

    expect(loginAuthenticatedResponseSchema.safeParse(authenticated).success).toBe(true);
    expect(
      mfaEnrollmentConfirmResponseSchema.safeParse({
        ...authenticated,
        recovery_codes: ['ABCD-EFGH-IJKL-MNPQ'],
        recovery_codes_displayed_once: true,
      }).success,
    ).toBe(true);
    expect(
      mfaEnrollmentConfirmResponseSchema.safeParse({
        ...authenticated,
        recovery_codes: [],
        recovery_codes_displayed_once: true,
      }).success,
    ).toBe(false);
  });

  it('requires membership organization context and selected-scope IDs to agree', () => {
    const baseMembership = {
      id,
      context_type: 'CLIENT',
      status: 'ACTIVE',
      agency: null,
      client_organization: {
        id,
        agency_id: otherId,
        legal_name: 'Example Motors Private Limited',
        display_name: 'Example Motors',
        status: 'ACTIVE',
        timezone: 'Asia/Kolkata',
      },
      role: {
        id,
        code: 'CLIENT_ADMIN',
        display_name: 'Client Admin',
        application: 'WEB',
      },
      branch_scope_mode: 'ALL',
      branch_ids: [],
      department_scope_mode: 'ALL',
      department_ids: [],
      job_title: 'CRM Admin',
      team_scope_mode: 'ALL',
      team_ids: [],
      assignment_scope: 'ALL',
      effective_from: timestamp,
      effective_until: null,
    } as const;

    expect(membershipSummarySchema.safeParse(baseMembership).success).toBe(true);
    expect(
      membershipSummarySchema.safeParse({
        ...baseMembership,
        branch_ids: [otherId],
      }).success,
    ).toBe(false);
    expect(
      membershipSummarySchema.safeParse({
        ...baseMembership,
        agency: {
          id: otherId,
          display_name: 'Go Digital Marketing',
          status: 'ACTIVE',
        },
      }).success,
    ).toBe(false);
  });

  it('accepts a machine-readable refresh reuse error in the standard envelope', () => {
    expect(
      apiErrorEnvelopeSchema.safeParse({
        error: {
          code: 'REFRESH_TOKEN_REUSED',
          message: 'The session is no longer valid.',
          correlation_id: 'auth-test-1',
          details: [],
          retryable: false,
        },
      }).success,
    ).toBe(true);
  });

  it('requires a meaningful support-elevation reason', () => {
    expect(
      createSupportElevationRequestSchema.safeParse({
        client_organization_id: id,
        reason: 'Investigate webhook delivery incident INC-1042',
        duration_minutes: 15,
      }).success,
    ).toBe(true);
    expect(
      createSupportElevationRequestSchema.safeParse({
        client_organization_id: id,
        reason: 'help',
      }).success,
    ).toBe(false);
  });

  it('accepts only bounded Google ID-token inputs and ignores unverified profile fields', () => {
    const parsed = googleLoginRequestSchema.parse({
      challenge_id: id,
      client_type: 'web',
      email: 'attacker-controlled@example.com',
      id_token: `header.${'a'.repeat(32)}.signature`,
      provider_subject: 'attacker-controlled-subject',
    });
    expect(parsed).toEqual({
      challenge_id: id,
      client_type: 'web',
      id_token: `header.${'a'.repeat(32)}.signature`,
    });
    expect(
      googleLinkRequestSchema.safeParse({
        challenge_id: id,
        id_token: 'x'.repeat(8_193),
      }).success,
    ).toBe(false);
  });

  it('requires a UUID challenge and a 32-byte hexadecimal Google nonce', () => {
    expect(
      googleAuthChallengeResponseSchema.safeParse({
        challenge_id: id,
        expires_at: timestamp,
        nonce: 'a'.repeat(64),
      }).success,
    ).toBe(true);
    expect(
      googleAuthChallengeResponseSchema.safeParse({
        challenge_id: id,
        expires_at: timestamp,
        nonce: 'not-a-provider-nonce',
      }).success,
    ).toBe(false);
  });
});
