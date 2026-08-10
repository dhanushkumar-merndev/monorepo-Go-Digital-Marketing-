'use client';

import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Button } from '@gdm/ui/components/button';
import { Skeleton } from '@gdm/ui/components/skeleton';
import { LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react';
import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';

import { publicEnvironment } from '@/lib/env';

import type { GoogleAuthChallenge, GoogleCredentialInput } from './auth-types';

interface GoogleIdentityButtonProps {
  ariaLabel?: string;
  clientId?: string;
  createChallenge(): Promise<GoogleAuthChallenge>;
  disabled?: boolean;
  onCredential(input: GoogleCredentialInput): Promise<void>;
  onFailure?(error: unknown): void;
  text?: 'continue_with' | 'signin_with';
}

type ButtonStatus = 'error' | 'loading' | 'ready' | 'submitting';

const GIS_SCRIPT = 'https://accounts.google.com/gsi/client';

function challengeIsUsable(
  challenge: GoogleAuthChallenge | null,
): challenge is GoogleAuthChallenge {
  if (challenge === null) return false;
  const expiresAt = Date.parse(challenge.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

// Browsers without FedCM reject `navigator.credentials.get({ identity })`, which GIS
// reports as an uncaught NotSupportedError before falling back to the popup flow.
function fedcmIsSupported() {
  return typeof window !== 'undefined' && 'IdentityCredential' in window;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function GoogleIdentityButton({
  ariaLabel = 'Sign in with Google',
  clientId = publicEnvironment.googleClientId,
  createChallenge,
  disabled = false,
  onCredential,
  onFailure,
  text = 'signin_with',
}: GoogleIdentityButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const createChallengeRef = useRef(createChallenge);
  const onCredentialRef = useRef(onCredential);
  const onFailureRef = useRef(onFailure);
  const preparationSequence = useRef(0);
  const activeChallenge = useRef<GoogleAuthChallenge | null>(null);
  const pendingChallenge = useRef<Promise<GoogleAuthChallenge> | null>(null);
  const appliedConfiguration = useRef<string | null>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [status, setStatus] = useState<ButtonStatus>('loading');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [preparationAttempt, setPreparationAttempt] = useState(0);

  useEffect(() => {
    createChallengeRef.current = createChallenge;
    onCredentialRef.current = onCredential;
    onFailureRef.current = onFailure;
  }, [createChallenge, onCredential, onFailure]);

  // A consumed or rejected challenge cannot be replayed, so the next preparation has to
  // mint a replacement and register it with GIS.
  const discardChallenge = useCallback(() => {
    activeChallenge.current = null;
    appliedConfiguration.current = null;
  }, []);

  const prepareButton = useCallback(async () => {
    if (disabled) return;

    const googleIdentity = window.google?.accounts.id;
    if (!clientId) {
      setStatus('error');
      setSetupError('Google sign-in is not configured for this environment.');
      return;
    }
    if (!googleIdentity || containerRef.current === null) {
      return;
    }

    const sequence = ++preparationSequence.current;
    setStatus('loading');
    setSetupError(null);

    try {
      // A challenge is single-use but stays valid across re-preparations, so reuse the
      // live one instead of asking the API for a replacement on every effect run.
      const cached = activeChallenge.current;
      let challenge: GoogleAuthChallenge;
      if (challengeIsUsable(cached)) {
        challenge = cached;
      } else {
        pendingChallenge.current ??= createChallengeRef.current().finally(() => {
          pendingChallenge.current = null;
        });
        challenge = await pendingChallenge.current;
        if (sequence !== preparationSequence.current) return;
      }

      if (!challengeIsUsable(challenge)) {
        throw new Error('The Google sign-in challenge expired before it could be used.');
      }
      activeChallenge.current = challenge;
      const googleNonce = await sha256Hex(challenge.nonce);

      const container = containerRef.current;
      if (container === null) return;
      const buttonWidth = Math.min(
        400,
        Math.max(
          200,
          Math.floor(container.parentElement?.clientWidth || container.clientWidth || 320),
        ),
      );

      // GIS keeps only the last initialization, and warns about every extra call. Re-run
      // it solely when the identity it would register actually changed.
      const useFedcm = fedcmIsSupported();
      const configuration = `${clientId}|${challenge.challengeId}|${String(useFedcm)}`;
      if (appliedConfiguration.current !== configuration) {
        googleIdentity.initialize({
          auto_select: false,
          button_auto_select: false,
          callback: (response) => {
            const idToken = response.credential?.trim();
            if (!idToken) {
              const error = new Error('Google did not return a verifiable identity credential.');
              discardChallenge();
              onFailureRef.current?.(error);
              setStatus('error');
              setSetupError('Google did not complete sign-in. Try again.');
              return;
            }

            setStatus('submitting');
            discardChallenge();
            void onCredentialRef
              .current({ challengeId: challenge.challengeId, idToken, nonce: challenge.nonce })
              .then(() => setStatus('ready'))
              .catch((error: unknown) => {
                onFailureRef.current?.(error);
                setStatus('loading');
                setPreparationAttempt((attempt) => attempt + 1);
              });
          },
          client_id: clientId,
          nonce: googleNonce,
          use_fedcm_for_button: useFedcm,
          ux_mode: 'popup',
        });
        appliedConfiguration.current = configuration;
      }

      container.replaceChildren();
      googleIdentity.renderButton(container, {
        logo_alignment: 'left',
        shape: 'rectangular',
        size: 'large',
        text,
        theme: 'outline',
        type: 'standard',
        width: buttonWidth,
      });
      setStatus('ready');
    } catch (error) {
      if (sequence !== preparationSequence.current) return;
      onFailureRef.current?.(error);
      setStatus('error');
      setSetupError('Google sign-in could not be prepared. Check your connection and try again.');
    }
  }, [clientId, disabled, discardChallenge, text]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (sdkReady && !disabled) void prepareButton();
    }, 0);
    return () => {
      window.clearTimeout(timeout);
      preparationSequence.current += 1;
    };
  }, [disabled, preparationAttempt, prepareButton, sdkReady]);

  function retry() {
    setSetupError(null);
    setStatus('loading');
    discardChallenge();
    if (window.google?.accounts.id) {
      setSdkReady(true);
      setPreparationAttempt((attempt) => attempt + 1);
      return;
    }
    setSetupError('Google Identity Services is still unavailable. Check your connection.');
    setStatus('error');
  }

  return (
    <div className="space-y-3">
      <Script
        id="google-identity-services"
        onError={() => {
          setStatus('error');
          setSetupError('Google Identity Services could not be loaded. Check your connection.');
        }}
        onReady={() => setSdkReady(true)}
        src={GIS_SCRIPT}
        strategy="afterInteractive"
      />

      {setupError === null ? null : (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Google sign-in unavailable</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{setupError}</p>
            <Button onClick={retry} size="sm" type="button" variant="outline">
              <RefreshCw aria-hidden="true" data-icon="inline-start" />
              Retry Google sign-in
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {setupError === null && (status === 'loading' || disabled) ? (
        <Skeleton aria-label="Preparing Google sign-in" className="h-10 w-full" />
      ) : null}
      {status === 'submitting' ? (
        <div
          aria-live="polite"
          className="border-border text-muted-foreground flex h-10 items-center justify-center gap-2 rounded-md border text-sm"
        >
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Verifying Google account
        </div>
      ) : null}
      <div
        aria-label={ariaLabel}
        className={status === 'ready' && !disabled ? 'min-h-10 w-full overflow-hidden' : 'hidden'}
        ref={containerRef}
      />
    </div>
  );
}
