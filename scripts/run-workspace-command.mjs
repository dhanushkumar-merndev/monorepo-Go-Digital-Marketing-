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
