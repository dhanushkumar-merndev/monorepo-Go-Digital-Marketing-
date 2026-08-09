import { Module } from '@nestjs/common';
import { BackgroundJobProcessorRegistry } from '../background/background-job-processor.registry.js';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseInfrastructureModule } from '../infrastructure/database/database.module.js';
import { MessagingModule } from '../messaging/messaging.module.js';
import { RemindersController } from './reminders.controller.js';
import { ReminderScheduler } from './reminder-scheduler.js';
import { RemindersService } from './reminders.service.js';

const REMINDER_BACKGROUND_REGISTRATION = Symbol('REMINDER_BACKGROUND_REGISTRATION');

@Module({
  imports: [AuthModule, DatabaseInfrastructureModule, MessagingModule],
  controllers: [RemindersController],
  providers: [
    RemindersService,
    {
      provide: REMINDER_BACKGROUND_REGISTRATION,
      inject: [BackgroundJobProcessorRegistry, RemindersService],
      useFactory: (
        processors: BackgroundJobProcessorRegistry,
        reminders: RemindersService,
      ): true => {
        processors.register('reminders.materialize', async (job) => {
          const data = job.data as { clientOrganizationId?: unknown; customerVehicleId?: unknown };
          if (
            typeof data.clientOrganizationId !== 'string' ||
            typeof data.customerVehicleId !== 'string'
          )
            throw new Error('Reminder materialization job is invalid.');
          return reminders.materializeVehicle(
            data.clientOrganizationId,
            data.customerVehicleId,
            'worker-materialize',
          );
        });
        processors.register('reminders.dispatch', async (job) => {
          const id = (job.data as { outboxId?: unknown }).outboxId;
          if (typeof id !== 'string') throw new Error('Reminder dispatch job is invalid.');
          return reminders.processDispatch(id);
        });
        processors.register('reminders.delivery.reconcile', async (job) => {
          const cid = (job.data as { clientOrganizationId?: unknown }).clientOrganizationId;
          if (typeof cid !== 'string') throw new Error('Reminder reconciliation job is invalid.');
          return reminders.reconcileDeliveryStatuses(cid);
        });
        processors.register('reminders.dispatch-due.all', async () =>
          reminders.queueDueAllTenants(),
        );
        return true;
      },
    },
    ReminderScheduler,
  ],
  exports: [RemindersService],
})
export class RemindersModule {}
