import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseInfrastructureModule } from '../infrastructure/database/database.module.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryReservationMonitorService } from './inventory-reservation-monitor.service.js';
import { InventoryService } from './inventory.service.js';

@Module({
  imports: [AuthModule, DatabaseInfrastructureModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryReservationMonitorService],
  exports: [InventoryService],
})
export class InventoryModule {}
