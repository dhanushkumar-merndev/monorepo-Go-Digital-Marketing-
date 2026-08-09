import { Controller, Get, HttpStatus, Inject, Req, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  type OpenAPIObject,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../authorization/authorization.decorators.js';
import {
  resolveCorrelationId,
  type CorrelatedRequest,
} from '../common/correlation/correlation-id.js';
import { HealthService } from './health.service.js';
import type { LivenessReport, ReadinessReport } from './health.types.js';

type SwaggerSchema = Exclude<
  NonNullable<NonNullable<OpenAPIObject['components']>['schemas']>[string],
  { $ref: string }
>;

const DEPENDENCY_CHECK_SCHEMA = {
  type: 'object',
  required: ['status', 'latency_ms'],
  properties: {
    status: { type: 'string', enum: ['up', 'down'] },
    latency_ms: { type: 'number', minimum: 0 },
  },
} satisfies SwaggerSchema;

const BACKGROUND_PROCESSING_SCHEMA = {
  type: 'object',
  required: ['mode', 'location', 'local_workers'],
  properties: {
    mode: { type: 'string', enum: ['disabled', 'embedded', 'standalone'] },
    location: { type: 'string', enum: ['disabled', 'local', 'external'] },
    local_workers: { type: 'integer', minimum: 0 },
  },
} satisfies SwaggerSchema;

const LIVENESS_SCHEMA = {
  type: 'object',
  required: [
    'status',
    'service',
    'version',
    'release_id',
    'environment',
    'timestamp',
    'uptime_seconds',
    'correlation_id',
    'processing',
  ],
  properties: {
    status: { type: 'string', enum: ['ok'] },
    service: { type: 'string' },
    version: { type: 'string' },
    release_id: { type: 'string' },
    environment: {
      type: 'string',
      enum: ['development', 'test', 'staging', 'production'],
    },
    timestamp: { type: 'string', format: 'date-time' },
    uptime_seconds: { type: 'number', minimum: 0 },
    correlation_id: { type: 'string' },
    processing: BACKGROUND_PROCESSING_SCHEMA,
  },
} satisfies SwaggerSchema;

const READINESS_SCHEMA = {
  ...LIVENESS_SCHEMA,
  properties: {
    ...LIVENESS_SCHEMA.properties,
    status: { type: 'string', enum: ['ok', 'degraded', 'down'] },
    checks: {
      type: 'object',
      required: ['database', 'redis'],
      properties: {
        database: DEPENDENCY_CHECK_SCHEMA,
        redis: DEPENDENCY_CHECK_SCHEMA,
      },
    },
  },
  required: [...LIVENESS_SCHEMA.required, 'checks'],
} satisfies SwaggerSchema;

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Report API and dependency health' })
  @ApiOkResponse({ description: 'All required dependencies are ready', schema: READINESS_SCHEMA })
  @ApiServiceUnavailableResponse({
    description: 'At least one required dependency is unavailable',
    schema: READINESS_SCHEMA,
  })
  async healthReport(
    @Req() request: CorrelatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessReport> {
    return this.reportReadiness(request, response);
  }

  @Get('live')
  @ApiOperation({ summary: 'Report whether the API process is alive' })
  @ApiOkResponse({ description: 'The API process is alive', schema: LIVENESS_SCHEMA })
  liveness(
    @Req() request: CorrelatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): LivenessReport {
    response.setHeader('cache-control', 'no-store');
    return this.health.liveness(resolveCorrelationId(request));
  }

  @Get('ready')
  @ApiOperation({ summary: 'Report database and Redis readiness' })
  @ApiOkResponse({ description: 'All required dependencies are ready', schema: READINESS_SCHEMA })
  @ApiServiceUnavailableResponse({
    description: 'At least one required dependency is unavailable',
    schema: READINESS_SCHEMA,
  })
  async readiness(
    @Req() request: CorrelatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadinessReport> {
    return this.reportReadiness(request, response);
  }

  private async reportReadiness(
    request: CorrelatedRequest,
    response: Response,
  ): Promise<ReadinessReport> {
    response.setHeader('cache-control', 'no-store');
    const report = await this.health.readiness(resolveCorrelationId(request));

    response.status(report.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return report;
  }
}
