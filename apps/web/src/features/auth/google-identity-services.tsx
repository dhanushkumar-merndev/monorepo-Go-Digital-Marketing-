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
  const [sdkReady, setSdkReady] = useState(false);
  const [status, setStatus] = useState<ButtonStatus>('loading');
  const [setupError, setSetupError] = useState<string | null>(null);
  const [preparationAttempt, setPreparationAttempt] = useState(0);

  useEffect(() => {
    createChallengeRef.current = createChallenge;
    onCredentialRef.current = onCredential;
    onFailureRef.current = onFailure;
  }, [createChallenge, onCredential, onFailure]);

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
      const challenge = await createChallengeRef.current();
      if (sequence !== preparationSequence.current) return;

      const expiresAt = Date.parse(challenge.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        throw new Error('The Google sign-in challenge expired before it could be used.');
      }

      const container = containerRef.current;
      if (container === null) return;

      googleIdentity.initialize({
        auto_select: false,
        button_auto_select: false,
        callback: (response) => {
          const idToken = response.credential?.trim();
          if (!idToken) {
            const error = new Error('Google did not return a verifiable identity credential.');
            onFailureRef.current?.(error);
            setStatus('error');
            setSetupError('Google did not complete sign-in. Try again.');
            return;
          }

          setStatus('submitting');
          void onCredentialRef
            .current({ challengeId: challenge.challengeId, idToken })
            .then(() => setStatus('ready'))
            .catch((error: unknown) => {
              onFailureRef.current?.(error);
              setStatus('loading');
              setPreparationAttempt((attempt) => attempt + 1);
            });
        },
        client_id: clientId,
        nonce: challenge.nonce,
        use_fedcm_for_button: true,
        ux_mode: 'popup',
      });

      container.replaceChildren();
      googleIdentity.renderButton(container, {
        logo_alignment: 'left',
        shape: 'rectangular',
        size: 'large',
        text,
        theme: 'outline',
        type: 'standard',
        width: Math.min(400, Math.max(200, Math.floor(container.clientWidth || 320))),
      });
      setStatus('ready');
    } catch (error) {
      if (sequence !== preparationSequence.current) return;
      onFailureRef.current?.(error);
      setStatus('error');
      setSetupError('Google sign-in could not be prepared. Check your connection and try again.');
    }
  }, [clientId, disabled, text]);

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
