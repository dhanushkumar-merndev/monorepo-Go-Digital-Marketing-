import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { LeadsService } from './leads.service.js';

const RECONCILIATION_INTERVAL_MILLISECONDS = 60_000;

@Injectable()
export class LeadSlaMonitorService implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    @Inject(LeadsService) private readonly leads: LeadsService,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LeadSlaMonitorService.name);
  }

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.leads
        .reconcileAllSla(new Date())
        .then((result) => {
          if (result.breached > 0 || result.warned > 0)
            this.logger.info(result, 'Lead SLA timers reconciled');
        })
        .catch((error: unknown) => {
          this.logger.error(
            { error_type: error instanceof Error ? error.constructor.name : typeof error },
            'Lead SLA reconciliation failed',
          );
        });
    }, RECONCILIATION_INTERVAL_MILLISECONDS);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
