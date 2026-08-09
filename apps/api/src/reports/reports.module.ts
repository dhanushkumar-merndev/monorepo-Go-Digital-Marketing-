import { Module } from '@nestjs/common';
import { BackgroundJobProcessorRegistry } from '../background/background-job-processor.registry.js';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseInfrastructureModule } from '../infrastructure/database/database.module.js';
import { StorageInfrastructureModule } from '../infrastructure/storage/storage.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

const REPORT_BACKGROUND_REGISTRATION = Symbol('REPORT_BACKGROUND_REGISTRATION');
@Module({
  imports: [AuthModule, DatabaseInfrastructureModule, StorageInfrastructureModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    {
      provide: REPORT_BACKGROUND_REGISTRATION,
      inject: [BackgroundJobProcessorRegistry, ReportsService],
      useFactory: (processors: BackgroundJobProcessorRegistry, reports: ReportsService): true => {
        processors.register('reports.export', async (job) => {
          const id = (job.data as { exportJobId?: unknown }).exportJobId;
          if (typeof id !== 'string') throw new Error('Report export job is invalid.');
          return reports.processExport(id);
        });
        return true;
      },
    },
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
