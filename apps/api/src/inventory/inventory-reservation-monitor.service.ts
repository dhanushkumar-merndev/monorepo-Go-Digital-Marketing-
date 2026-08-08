import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { InventoryService } from './inventory.service.js';

const RECONCILIATION_INTERVAL_MILLISECONDS = 60_000;

@Injectable()
export class InventoryReservationMonitorService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    @Inject(InventoryService) private readonly inventory: InventoryService,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(InventoryReservationMonitorService.name);
  }

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      const now = new Date();
      void this.inventory
        .reconcileAllReservations(now)
        .then((result) => {
          if (result.expired > 0)
            this.logger.info(result, 'Expired inventory reservations released');
        })
        .catch((error: unknown) => {
          this.logger.error(
            { error_type: error instanceof Error ? error.constructor.name : typeof error },
            'Inventory reservation reconciliation failed',
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
