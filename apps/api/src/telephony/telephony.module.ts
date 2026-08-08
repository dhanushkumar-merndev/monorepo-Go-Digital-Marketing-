import { Module } from '@nestjs/common';
import { parseTelephonyEnvironment } from '@gdm/config';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseInfrastructureModule } from '../infrastructure/database/database.module.js';
import { StorageInfrastructureModule } from '../infrastructure/storage/storage.module.js';
import { DevelopmentTelephonyProvider } from './development-telephony.provider.js';
import {
  LeadCallsController,
  TelephonyController,
  TelephonyWebhooksController,
} from './telephony.controller.js';
import { TELEPHONY_PROVIDER_REGISTRY } from './telephony-provider.port.js';
import { DefaultTelephonyProviderRegistry } from './telephony-provider.registry.js';
import {
  TELEPHONY_RUNTIME_CONFIG,
  type TelephonyRuntimeConfig,
} from './telephony-runtime-config.js';
import { TelephonyService } from './telephony.service.js';

@Module({
  imports: [AuthModule, DatabaseInfrastructureModule, StorageInfrastructureModule],
  controllers: [TelephonyController, TelephonyWebhooksController, LeadCallsController],
  providers: [
    {
      provide: TELEPHONY_RUNTIME_CONFIG,
      useFactory: (): TelephonyRuntimeConfig => parseTelephonyEnvironment(process.env),
    },
    DevelopmentTelephonyProvider,
    DefaultTelephonyProviderRegistry,
    { provide: TELEPHONY_PROVIDER_REGISTRY, useExisting: DefaultTelephonyProviderRegistry },
    TelephonyService,
  ],
  exports: [DevelopmentTelephonyProvider, TelephonyService],
})
export class TelephonyModule {}
