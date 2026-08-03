export const GOOGLE_IDENTITY_PROVIDER = Symbol('GOOGLE_IDENTITY_PROVIDER');

export interface VerifiedGoogleIdentity {
  email: string;
  providerSubject: string;
}

export interface GoogleIdentityProviderPort {
  verifyIdToken(input: {
    expectedNonceHash: string;
    idToken: string;
  }): Promise<VerifiedGoogleIdentity>;
}

/**
 * MFA remains an explicit adapter boundary until enrollment and recovery
 * policy is approved. No password-only route claims that Agency Admin MFA is
 * production-ready.
 */
export interface MultiFactorProviderPort {
  verifyChallenge(input: { challenge: string; userId: string }): Promise<boolean>;
}
