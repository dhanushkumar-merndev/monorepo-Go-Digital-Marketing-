import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

function readWebFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

function parseJsonc<T>(source: string): T {
  return JSON.parse(source.replace(/,\s*([}\]])/gu, '$1')) as T;
}

describe('Cloudflare deployment configuration', () => {
  it('targets the OpenNext Worker output with required compatibility settings', () => {
    const wranglerConfig = parseJsonc<{
      assets?: { binding?: string; directory?: string };
      compatibility_date?: string;
      compatibility_flags?: string[];
      main?: string;
      observability?: { enabled?: boolean };
    }>(readWebFile('wrangler.jsonc'));

    expect(wranglerConfig.main).toBe('.open-next/worker.js');
    expect(wranglerConfig.compatibility_date).toBe('2026-08-01');
    expect(wranglerConfig.compatibility_flags).toEqual(
      expect.arrayContaining(['nodejs_compat', 'global_fetch_strictly_public']),
    );
    expect(wranglerConfig.assets).toEqual({
      binding: 'ASSETS',
      directory: '.open-next/assets',
    });
    expect(wranglerConfig.observability?.enabled).toBe(true);
  });

  it('uses the adapter CLI for Cloudflare build, preview, and deployment', () => {
    const packageJson = JSON.parse(readWebFile('package.json')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.['build:cloudflare']).toBe('opennextjs-cloudflare build');
    expect(packageJson.scripts?.preview).toBe(
      'opennextjs-cloudflare build && opennextjs-cloudflare preview',
    );
    expect(packageJson.scripts?.deploy).toBe(
      'node ../../scripts/validate-web-deployment.mjs && opennextjs-cloudflare build && opennextjs-cloudflare deploy -- --keep-vars',
    );

    const rootPackageJson = JSON.parse(readWebFile('../../package.json')) as {
      scripts?: Record<string, string>;
    };
    expect(rootPackageJson.scripts?.['deploy:web']).toContain('--filter @gdm/web run deploy');
  });

  it('fails deployment preflight unless the versioned API URL uses HTTPS', () => {
    const preflight = resolve(process.cwd(), '../../scripts/validate-web-deployment.mjs');
    const runPreflight = (apiUrl?: string) =>
      spawnSync(process.execPath, [preflight], {
        env: {
          ...process.env,
          NEXT_PUBLIC_API_URL: apiUrl,
        },
        encoding: 'utf8',
      });

    expect(runPreflight().status).not.toBe(0);
    expect(runPreflight('http://localhost:4000/v1').status).not.toBe(0);
    expect(runPreflight('https://api.example.com/v1').status).toBe(0);
  });

  it('does not pass backend credentials into client workspace commands', () => {
    const rootTurboConfig = JSON.parse(readWebFile('../../turbo.json')) as {
      globalEnv?: string[];
    };
    expect(rootTurboConfig.globalEnv).not.toEqual(
      expect.arrayContaining([
        'DATABASE_URL',
        'REDIS_URL',
        'S3_SECRET_ACCESS_KEY',
        'SUPABASE_SERVICE_ROLE_KEY',
        'TIGRIS_SECRET_ACCESS_KEY',
      ]),
    );

    const workspaceWrapper = resolve(process.cwd(), '../../scripts/run-workspace-command.mjs');
    const result = spawnSync(
      process.execPath,
      [
        workspaceWrapper,
        '--filter',
        '@gdm/web',
        'exec',
        'node',
        '--input-type=module',
        '-e',
        'if (process.env.DATABASE_URL || process.env.SUPABASE_SERVICE_ROLE_KEY) process.exit(1)',
      ],
      {
        cwd: resolve(process.cwd(), '../..'),
        env: {
          ...process.env,
          DATABASE_URL: 'postgresql://backend-only',
          SUPABASE_SERVICE_ROLE_KEY: 'backend-only',
        },
        encoding: 'utf8',
      },
    );

    expect(result.status, result.stderr).toBe(0);
  });

  it('keeps standalone output scoped to the adapter build', () => {
    expect(readWebFile('next.config.ts')).not.toMatch(/output\s*:\s*['"]standalone['"]/u);
  });
});
