import type { WorkerMode } from '@gdm/config';
import type { BackgroundProcessing } from '@gdm/contracts';

export type BackgroundRuntimeRole = 'api' | 'worker';

export function assertStandaloneWorkerMode(mode: WorkerMode): void {
  if (mode !== 'standalone') {
    throw new Error(
      `The standalone worker entrypoint requires WORKER_MODE=standalone; received ${mode}.`,
    );
  }
}

export function shouldStartLocalWorker(role: BackgroundRuntimeRole, mode: WorkerMode): boolean {
  if (role === 'worker') {
    assertStandaloneWorkerMode(mode);
    return true;
  }

  return mode === 'embedded';
}

export function processingHealthForMode(mode: WorkerMode): BackgroundProcessing {
  switch (mode) {
    case 'disabled':
      return { mode, location: 'disabled', local_workers: 0 };
    case 'embedded':
      return { mode, location: 'local', local_workers: 1 };
    case 'standalone':
      return { mode, location: 'external', local_workers: 0 };
  }
}
