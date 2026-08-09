import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryFile = (relativePath: string): string =>
  readFileSync(fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)), 'utf8');

describe('production deployment configuration', () => {
  it('keeps production promotion manual and migration-first', () => {
    const blueprint = repositoryFile('render.yaml');

    assert.equal(blueprint.match(/autoDeployTrigger: off/gu)?.length, 2);
    assert.match(
      blueprint,
      /preDeployCommand: node node_modules\/@gdm\/database\/dist\/migrate\.js/u,
    );
    assert.match(blueprint, /healthCheckPath: \/v1\/health\/ready/u);
  });

  it('declares every production startup secret for API and worker without values', () => {
    const blueprint = repositoryFile('render.yaml');
    const [api = '', worker = ''] = blueprint.split('  - type: worker');

    for (const key of [
      'AUTH_ACCESS_TOKEN_SECRET',
      'AUTH_PASSWORD_PEPPER',
      'AUTH_REFRESH_TOKEN_PEPPER',
      'DELIVERY_OTP_PEPPER',
      'DIRECT_DATABASE_URL',
      'GOOGLE_AUTH_WEB_CLIENT_ID',
      'LEAD_PHONE_LOOKUP_PEPPER',
      'MESSAGING_CREDENTIAL_ENCRYPTION_KEY',
      'SENTRY_DSN',
      'TEST_RIDE_OTP_PEPPER',
    ]) {
      assert.match(api, new RegExp(`- key: ${key}\\r?\\n\\s+sync: false`, 'u'));
    }

    for (const key of [
      'AUTH_ACCESS_TOKEN_SECRET',
      'AUTH_PASSWORD_PEPPER',
      'AUTH_REFRESH_TOKEN_PEPPER',
      'GOOGLE_AUTH_WEB_CLIENT_ID',
      'LEAD_PHONE_LOOKUP_PEPPER',
      'MESSAGING_CREDENTIAL_ENCRYPTION_KEY',
      'SENTRY_DSN',
    ]) {
      assert.match(worker, new RegExp(`- key: ${key}\\r?\\n\\s+sync: false`, 'u'));
    }
  });

  it('resolves migrations relative to the packaged database module', () => {
    const migrationEntrypoint = repositoryFile('packages/database/src/migrate.ts');

    assert.match(migrationEntrypoint, /new URL\('\.\.\/migrations\/', import\.meta\.url\)/u);
    assert.doesNotMatch(migrationEntrypoint, /migrationsFolder: 'migrations'/u);
  });
});
