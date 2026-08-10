import { spawn } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const target = process.argv[2];
const rootDirectory = fileURLToPath(new URL('../', import.meta.url));
const workspaceRunner = fileURLToPath(new URL('./run-workspace-command.mjs', import.meta.url));

const targets = {
  api: {
    cacheDirectories: ['apps/api/dist'],
    command: ['--filter', '@gdm/api', 'dev'],
  },
  mobile: {
    cacheDirectories: [],
    command: ['--filter', '@gdm/mobile', 'dev', '--', '--clear'],
  },
  web: {
    cacheDirectories: ['apps/web/.next'],
    command: ['--filter', '@gdm/web', 'dev'],
  },
};

if (!(target in targets)) {
  throw new Error('Choose one fresh development target: web, api, or mobile.');
}

const selectedTarget = targets[target];
await Promise.all(
  selectedTarget.cacheDirectories.map((directory) =>
    rm(new URL(`../${directory}`, import.meta.url), { force: true, recursive: true }),
  ),
);

const child = spawn(process.execPath, [workspaceRunner, ...selectedTarget.command], {
  cwd: rootDirectory,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.once('error', (error) => {
  throw error;
});

child.once('exit', (code, signal) => {
  process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1);
});
