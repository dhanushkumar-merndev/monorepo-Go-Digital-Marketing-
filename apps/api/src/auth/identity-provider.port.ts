/**
 * Boundary for a future OAuth/OIDC identity provider. Phase 1 deliberately
 * ships only the password provider; provider tokens never enter domain code.
 */
export interface ExternalIdentityProfile {
  email: string;
  provider: string;
  providerSubject: string;
}

export interface ExternalIdentityProviderPort {
  exchangeAuthorizationCode(input: {
    authorizationCode: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<ExternalIdentityProfile>;
}

/**
 * MFA remains an explicit adapter boundary until enrollment and recovery
 * policy is approved. No password-only route claims that Agency Admin MFA is
 * production-ready.
 */
export interface MultiFactorProviderPort {
  verifyChallenge(input: { challenge: string; userId: string }): Promise<boolean>;
}
