import { Module } from '@nestjs/common';
import { DatabaseInfrastructureModule } from '../infrastructure/database/database.module.js';
import { RedisInfrastructureModule } from '../infrastructure/redis/redis.module.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  imports: [DatabaseInfrastructureModule, RedisInfrastructureModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
