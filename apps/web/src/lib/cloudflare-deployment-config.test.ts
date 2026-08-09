import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

  it('runs Cloudflare and Docker packaging in Linux CI with non-production public OAuth IDs', () => {
    const workflow = readWebFile('../../.github/workflows/ci.yml');

    expect(workflow).toContain('runs-on: ubuntu-latest');
    expect(workflow).toContain(
      'NEXT_PUBLIC_GOOGLE_CLIENT_ID: 123456789-ci.apps.googleusercontent.com',
    );
    expect(workflow).toContain('run: pnpm build:web:cloudflare');
    expect(workflow).toMatch(
      /docker build[\s\S]*--file apps\/api\/Dockerfile[\s\S]*--tag gdm-api:ci[\s\S]*\n\s*\./u,
    );
    expect(workflow).not.toMatch(/GOOGLE_(?:AUTH_)?(?:CLIENT_SECRET|WEB_CLIENT_SECRET):/u);
  });

  it('fails deployment preflight unless API and Google browser configuration are valid', () => {
    const preflight = resolve(process.cwd(), '../../scripts/validate-web-deployment.mjs');
    const runPreflight = (apiUrl?: string, googleClientId?: string) =>
      spawnSync(process.execPath, [preflight], {
        env: {
          ...process.env,
          NEXT_PUBLIC_API_URL: apiUrl,
          NEXT_PUBLIC_GOOGLE_CLIENT_ID: googleClientId,
        },
        encoding: 'utf8',
      });

    expect(runPreflight().status).not.toBe(0);
    expect(
      runPreflight('http://localhost:4000/v1', '123456789-web.apps.googleusercontent.com').status,
    ).not.toBe(0);
    expect(runPreflight('https://api.example.com/v1').status).not.toBe(0);
    expect(
      runPreflight('https://api.example.com/v1', '123456789-web.apps.googleusercontent.com').status,
    ).toBe(0);
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
    expect(rootTurboConfig.globalEnv).toContain('NEXT_PUBLIC_GOOGLE_CLIENT_ID');

    const workspaceWrapper = readWebFile('../../scripts/run-workspace-command.mjs');
    expect(workspaceWrapper).toContain('if (targetsClientWorkspace)');
    expect(workspaceWrapper).toContain('delete process.env[name]');
    for (const backendOnlyName of [
      'DATABASE_URL',
      'GOOGLE_AUTH_WEB_CLIENT_SECRET',
      'SUPABASE_SERVICE_ROLE_KEY',
    ]) {
      expect(workspaceWrapper).toContain(`'${backendOnlyName}'`);
    }
  });

  it('keeps standalone output scoped to the adapter build', () => {
    expect(readWebFile('next.config.ts')).not.toMatch(/output\s*:\s*['"]standalone['"]/u);
  });

  it('keeps popup authentication communication available without weakening framing policy', () => {
    const nextConfig = readWebFile('next.config.ts');
    const securityHeaders = readWebFile('src/lib/security-headers.ts');
    expect(nextConfig).toContain('buildWebSecurityHeaders');
    expect(securityHeaders).toContain('Cross-Origin-Opener-Policy');
    expect(securityHeaders).toContain('same-origin-allow-popups');
    expect(securityHeaders).toContain("{ key: 'X-Frame-Options', value: 'DENY' }");
  });
});
