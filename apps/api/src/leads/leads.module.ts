import { Module } from '@nestjs/common';
import { parseLeadEnvironment } from '@gdm/config';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseInfrastructureModule } from '../infrastructure/database/database.module.js';
import { BOT_PROTECTION, UnavailableBotProtectionAdapter } from './bot-protection.port.js';
import { LeadsController, PublicLeadFormsController } from './leads.controller.js';
import { LeadSlaMonitorService } from './lead-sla-monitor.service.js';
import { LEADS_RUNTIME_CONFIG, type LeadsRuntimeConfig } from './leads-runtime-config.js';
import { LeadsService } from './leads.service.js';

@Module({
  imports: [AuthModule, DatabaseInfrastructureModule],
  controllers: [LeadsController, PublicLeadFormsController],
  providers: [
    {
      provide: LEADS_RUNTIME_CONFIG,
      useFactory: (): LeadsRuntimeConfig => parseLeadEnvironment(process.env),
    },
    UnavailableBotProtectionAdapter,
    { provide: BOT_PROTECTION, useExisting: UnavailableBotProtectionAdapter },
    LeadsService,
    LeadSlaMonitorService,
  ],
  exports: [LeadsService],
})
export class LeadsModule {}
