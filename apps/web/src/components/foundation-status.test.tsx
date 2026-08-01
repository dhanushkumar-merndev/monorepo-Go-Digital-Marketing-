import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FoundationStatus } from '@/components/foundation-status';

function renderWithQueryClient(component: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{component}</QueryClientProvider>);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}

describe('FoundationStatus', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('announces the loading state while the health request is pending', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );

    renderWithQueryClient(<FoundationStatus />);

    expect(screen.getByLabelText('Checking API connectivity')).toHaveAttribute('aria-busy', 'true');
  });

  it('renders only normalized health fields from a successful response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          checks: {
            database: { status: 'up', connectionString: 'must-not-render' },
            redis: 'up',
          },
          status: 'ok',
          token: 'must-not-render',
        }),
      ),
    );

    renderWithQueryClient(<FoundationStatus />);

    expect(await screen.findByText('database')).toBeInTheDocument();
    expect(screen.getByText('redis')).toBeInTheDocument();
    expect(screen.getAllByText('up')).toHaveLength(2);
    expect(screen.getByText('ok')).toBeInTheDocument();
    expect(screen.queryByText('must-not-render')).not.toBeInTheDocument();
  });

  it('renders dependency truth from a valid unavailable readiness response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          {
            checks: {
              database: { latency_ms: 3, status: 'up' },
              redis: { latency_ms: 7, status: 'down' },
            },
            status: 'unavailable',
          },
          503,
        ),
      ),
    );

    renderWithQueryClient(<FoundationStatus />);

    expect(await screen.findByText('unavailable')).toBeInTheDocument();
    expect(screen.getByText('503')).toBeInTheDocument();
    expect(screen.getByText('database')).toBeInTheDocument();
    expect(screen.getByText('redis')).toBeInTheDocument();
    expect(screen.getByText('down')).toBeInTheDocument();
  });

  it('offers a retry without exposing the underlying network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('sensitive network detail'))),
    );

    renderWithQueryClient(<FoundationStatus />);

    expect(await screen.findByText('API unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry check' })).toBeEnabled();
    expect(screen.queryByText('sensitive network detail')).not.toBeInTheDocument();
  });

  it('treats an unsuccessful non-health JSON response as an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          {
            error: {
              code: 'NOT_FOUND',
              message: 'internal response detail',
            },
          },
          404,
        ),
      ),
    );

    renderWithQueryClient(<FoundationStatus />);

    expect(await screen.findByText('API unavailable')).toBeInTheDocument();
    expect(screen.queryByText('internal response detail')).not.toBeInTheDocument();
  });
});
