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
      'opennextjs-cloudflare build && opennextjs-cloudflare deploy -- --keep-vars',
    );
  });

  it('keeps standalone output scoped to the adapter build', () => {
    expect(readWebFile('next.config.ts')).not.toMatch(/output\s*:\s*['"]standalone['"]/u);
  });
});
