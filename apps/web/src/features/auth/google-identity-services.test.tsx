import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GoogleIdentityButton } from './google-identity-services';

vi.mock('next/script', () => ({
  default: ({ onError, onReady }: { onError?(): void; onReady?(): void }) => (
    <div>
      <button onClick={onReady} type="button">
        Load GIS test script
      </button>
      <button onClick={onError} type="button">
        Fail GIS test script
      </button>
    </div>
  ),
}));

interface CapturedConfiguration {
  auto_select?: boolean;
  button_auto_select?: boolean;
  callback(response: { credential?: string }): void;
  client_id: string;
  nonce: string;
  use_fedcm_for_button?: boolean;
  ux_mode?: string;
}

describe('GoogleIdentityButton', () => {
  let configuration: CapturedConfiguration | undefined;
  const initialize = vi.fn((value: CapturedConfiguration) => {
    configuration = value;
  });
  const renderButton = vi.fn();

  beforeEach(() => {
    configuration = undefined;
    initialize.mockClear();
    renderButton.mockClear();
    window.google = {
      accounts: {
        id: {
          cancel: vi.fn(),
          initialize,
          renderButton,
        },
      },
    };
  });

  afterEach(() => {
    cleanup();
    delete window.google;
  });

  it('uses an API nonce and sends only the returned credential with its challenge ID', async () => {
    const createChallenge = vi.fn(async () => ({
      challengeId: '11111111-1111-4111-8111-111111111111',
      expiresAt: '2099-08-03T13:00:00.000Z',
      nonce: 'server-issued-google-nonce',
    }));
    const onCredential = vi.fn(async () => undefined);
    render(
      <GoogleIdentityButton
        clientId="123456789-web.apps.googleusercontent.com"
        createChallenge={createChallenge}
        onCredential={onCredential}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Load GIS test script' }));

    await waitFor(() => expect(initialize).toHaveBeenCalledTimes(1));
    expect(configuration).toMatchObject({
      auto_select: false,
      button_auto_select: false,
      client_id: '123456789-web.apps.googleusercontent.com',
      nonce: 'server-issued-google-nonce',
      use_fedcm_for_button: true,
      ux_mode: 'popup',
    });
    expect(renderButton).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ text: 'signin_with', type: 'standard' }),
    );

    await act(async () => configuration?.callback({ credential: 'signed-google-id-token' }));

    expect(onCredential).toHaveBeenCalledWith({
      challengeId: '11111111-1111-4111-8111-111111111111',
      idToken: 'signed-google-id-token',
    });
  });

  it('fails closed when GIS returns no credential', async () => {
    const onFailure = vi.fn();
    render(
      <GoogleIdentityButton
        clientId="123456789-web.apps.googleusercontent.com"
        createChallenge={async () => ({
          challengeId: '11111111-1111-4111-8111-111111111111',
          expiresAt: '2099-08-03T13:00:00.000Z',
          nonce: 'server-issued-google-nonce',
        })}
        onCredential={async () => undefined}
        onFailure={onFailure}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Load GIS test script' }));
    await waitFor(() => expect(initialize).toHaveBeenCalled());

    act(() => configuration?.callback({}));

    expect(onFailure).toHaveBeenCalledWith(expect.any(Error));
    expect(await screen.findByText('Google sign-in unavailable')).toBeInTheDocument();
    expect(screen.getByText(/did not complete sign-in/)).toBeInTheDocument();
  });

  it('shows a recoverable error when the GIS script cannot load', async () => {
    render(
      <GoogleIdentityButton
        clientId="123456789-web.apps.googleusercontent.com"
        createChallenge={async () => ({
          challengeId: '11111111-1111-4111-8111-111111111111',
          expiresAt: '2099-08-03T13:00:00.000Z',
          nonce: 'server-issued-google-nonce',
        })}
        onCredential={async () => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Fail GIS test script' }));

    expect(await screen.findByText('Google sign-in unavailable')).toBeInTheDocument();
    expect(screen.getByText(/could not be loaded/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry Google sign-in' })).toBeInTheDocument();
  });
});
