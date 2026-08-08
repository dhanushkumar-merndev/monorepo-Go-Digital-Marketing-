import { Module } from '@nestjs/common';
import { parseTestRideEnvironment } from '@gdm/config';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseInfrastructureModule } from '../infrastructure/database/database.module.js';
import { TestRidesController } from './test-rides.controller.js';
import {
  TEST_RIDES_RUNTIME_CONFIG,
  type TestRidesRuntimeConfig,
} from './test-rides-runtime-config.js';
import { TestRidesService } from './test-rides.service.js';

@Module({
  imports: [AuthModule, DatabaseInfrastructureModule],
  controllers: [TestRidesController],
  providers: [
    {
      provide: TEST_RIDES_RUNTIME_CONFIG,
      useFactory: (): TestRidesRuntimeConfig => parseTestRideEnvironment(process.env),
    },
    TestRidesService,
  ],
  exports: [TestRidesService],
})
export class TestRidesModule {}
