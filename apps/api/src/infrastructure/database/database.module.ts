import { Module } from '@nestjs/common';
import type { ApiEnvironment } from '@gdm/config';
import { createDatabaseConnection, type DatabaseConnection } from '@gdm/database';
import { API_ENVIRONMENT, ApiConfigModule } from '../../config/api-config.module.js';
import { DatabaseLifecycleService } from './database-lifecycle.service.js';
import {
  DATABASE_CONNECTION,
  DATABASE_HEALTH_PROBE,
  type DatabaseHealthProbe,
} from './database.tokens.js';

@Module({
  imports: [ApiConfigModule],
  providers: [
    {
      provide: DATABASE_CONNECTION,
      inject: [API_ENVIRONMENT],
      useFactory: (environment: ApiEnvironment): DatabaseConnection =>
        createDatabaseConnection({
          url: environment.databaseUrl,
          maxConnections: environment.databasePoolMax,
        }),
    },
    {
      provide: DATABASE_HEALTH_PROBE,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection): DatabaseHealthProbe => ({
        ping: () => connection.ping(),
      }),
    },
    DatabaseLifecycleService,
  ],
  exports: [DATABASE_CONNECTION, DATABASE_HEALTH_PROBE],
})
export class DatabaseInfrastructureModule {}
