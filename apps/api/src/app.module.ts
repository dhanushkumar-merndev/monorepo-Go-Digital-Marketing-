import { Module, RequestMethod } from '@nestjs/common';
import type { ApiEnvironment } from '@gdm/config';
import { LoggerModule } from 'nestjs-pino';
import { BackgroundProcessingModule } from './background/background-processing.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ApiExceptionFilter } from './common/errors/api-exception.filter.js';
import { ZodValidationPipe } from './common/validation/zod-validation.pipe.js';
import { API_ENVIRONMENT, ApiConfigModule } from './config/api-config.module.js';
import { HealthModule } from './health/health.module.js';
import { LeadsModule } from './leads/leads.module.js';
import { DatabaseInfrastructureModule } from './infrastructure/database/database.module.js';
import { RedisInfrastructureModule } from './infrastructure/redis/redis.module.js';
import { StorageInfrastructureModule } from './infrastructure/storage/storage.module.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { createPinoHttpOptions } from './observability/pino-options.js';
import { TelephonyModule } from './telephony/telephony.module.js';
import { MessagingModule } from './messaging/messaging.module.js';
import { TestRidesModule } from './test-rides/test-rides.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { CommercialModule } from './commercial/commercial.module.js';
import { DeliveryModule } from './delivery/delivery.module.js';
import { RegistrationModule } from './registration/registration.module.js';
import { RemindersModule } from './reminders/reminders.module.js';
import { ReportsModule } from './reports/reports.module.js';

@Module({
  imports: [
    ApiConfigModule,
    AuthModule,
    LoggerModule.forRootAsync({
      imports: [ApiConfigModule],
      inject: [API_ENVIRONMENT],
      useFactory: (environment: ApiEnvironment) => ({
        pinoHttp: createPinoHttpOptions(environment),
        forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }],
      }),
    }),
    DatabaseInfrastructureModule,
    RedisInfrastructureModule,
    BackgroundProcessingModule.forApi(),
    StorageInfrastructureModule,
    ObservabilityModule,
    HealthModule,
    LeadsModule,
    TelephonyModule,
    MessagingModule,
    TestRidesModule,
    InventoryModule,
    CommercialModule,
    DeliveryModule,
    RegistrationModule,
    RemindersModule,
    ReportsModule,
  ],
  providers: [ApiExceptionFilter, ZodValidationPipe],
})
export class AppModule {}
