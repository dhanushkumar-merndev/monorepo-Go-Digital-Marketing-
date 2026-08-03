import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { config as loadEnvironment } from 'dotenv';

const environmentPath = fileURLToPath(new URL('../.env', import.meta.url));
const commandArguments = process.argv.slice(2);
const nodeEnvironmentArgument = commandArguments.find((argument) =>
  argument.startsWith('--node-env='),
);
const workerModeArgument = commandArguments.find((argument) =>
  argument.startsWith('--worker-mode='),
);
const forwardedArguments = commandArguments.filter(
  (argument) => argument !== nodeEnvironmentArgument && argument !== workerModeArgument,
);
const targetsClientWorkspace = forwardedArguments.some(
  (argument) => argument === '@gdm/web' || argument === '@gdm/mobile',
);

const BACKEND_ENVIRONMENT_VARIABLES = [
  'API_HOST',
  'API_PORT',
  'AUTH_ACCESS_TOKEN_SECRET',
  'AUTH_ACCESS_TOKEN_TTL_SECONDS',
  'AUTH_AUDIENCE',
  'AUTH_ISSUER',
  'AUTH_LOGIN_LOCKOUT_SECONDS',
  'AUTH_LOGIN_MAX_ATTEMPTS',
  'AUTH_PASSWORD_PEPPER',
  'AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS',
  'AUTH_REFRESH_COOKIE_DOMAIN',
  'AUTH_REFRESH_COOKIE_NAME',
  'AUTH_REFRESH_COOKIE_SAME_SITE',
  'AUTH_REFRESH_COOKIE_SECURE',
  'AUTH_REFRESH_TOKEN_PEPPER',
  'AUTH_REFRESH_TOKEN_TTL_SECONDS',
  'AUTH_SUPPORT_ELEVATION_TTL_SECONDS',
  'CORS_ORIGINS',
  'DATABASE_POOL_MAX',
  'DATABASE_URL',
  'DIRECT_DATABASE_URL',
  'GOOGLE_AUTH_ANDROID_CLIENT_ID',
  'GOOGLE_AUTH_CHALLENGE_TTL_SECONDS',
  'GOOGLE_AUTH_IOS_CLIENT_ID',
  'GOOGLE_AUTH_WEB_CLIENT_ID',
  'GOOGLE_AUTH_CLIENT_SECRET',
  'GOOGLE_AUTH_WEB_CLIENT_SECRET',
  'GOOGLE_AUTH_WEB_REDIRECT_URI',
  'LOG_LEVEL',
  'PORT',
  'REDIS_CONNECT_TIMEOUT_MS',
  'REDIS_URL',
  'S3_ACCESS_KEY_ID',
  'S3_BUCKET',
  'S3_ENDPOINT',
  'S3_FORCE_PATH_STYLE',
  'S3_REGION',
  'S3_SECRET_ACCESS_KEY',
  'SENTRY_DSN',
  'SEED_DEVELOPMENT_PASSWORD',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_URL',
  'TIGRIS_ACCESS_KEY_ID',
  'TIGRIS_BUCKET',
  'TIGRIS_ENDPOINT',
  'TIGRIS_SECRET_ACCESS_KEY',
  'WORKER_MODE',
];

if (forwardedArguments.length === 0) {
  throw new Error('A pnpm workspace command is required.');
}

const loaded = loadEnvironment({
  path: environmentPath,
  override: false,
  quiet: true,
});

if (loaded.error && 'code' in loaded.error && loaded.error.code !== 'ENOENT') {
  throw loaded.error;
}

if (nodeEnvironmentArgument) {
  const nodeEnvironment = nodeEnvironmentArgument.slice('--node-env='.length);

  if (!['development', 'test', 'staging', 'production'].includes(nodeEnvironment)) {
    throw new Error(`Unsupported NODE_ENV value: ${nodeEnvironment}`);
  }

  process.env.NODE_ENV = nodeEnvironment;
}

if (workerModeArgument) {
  const workerMode = workerModeArgument.slice('--worker-mode='.length);

  if (!['disabled', 'embedded', 'standalone'].includes(workerMode)) {
    throw new Error(`Unsupported WORKER_MODE value: ${workerMode}`);
  }

  process.env.WORKER_MODE = workerMode;
}

if (targetsClientWorkspace) {
  for (const name of BACKEND_ENVIRONMENT_VARIABLES) {
    delete process.env[name];
  }
}

const pnpmCli = process.env.npm_execpath;

if (!pnpmCli) {
  throw new Error('Run this command through a root pnpm script.');
}

const child = spawn(process.execPath, [pnpmCli, ...forwardedArguments], {
  env: process.env,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    if (!child.killed) {
      child.kill(signal);
    }
  });
}

child.once('error', (error) => {
  throw error;
});

child.once('exit', (code, signal) => {
  process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
});
