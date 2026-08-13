import { Controller, Get, Header, Inject, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  analyticsQuerySchema,
  type AnalyticsOverviewResponse,
  type AnalyticsPlatformResponse,
  type AnalyticsQuery,
} from '@gdm/contracts';
import {
  CurrentAuthorization,
  RequireClientContext,
  RequirePermissions,
} from '../authorization/authorization.decorators.js';
import type { AuthorizationContext } from '../authorization/authorization.types.js';
import { ZodSchemaValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { AnalyticsService } from './analytics.service.js';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(@Inject(AnalyticsService) private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @Header('Cache-Control', 'private, max-age=30')
  @RequireClientContext()
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Read role- and scope-aware tenant analytics' })
  overview(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query(new ZodSchemaValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ): Promise<AnalyticsOverviewResponse> {
    return this.analytics.overview(context, query);
  }

  @Get('platform')
  @Header('Cache-Control', 'private, max-age=30')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Read aggregate-only agency platform analytics without customer PII' })
  platform(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query(new ZodSchemaValidationPipe(analyticsQuerySchema)) query: AnalyticsQuery,
  ): Promise<AnalyticsPlatformResponse> {
    return this.analytics.platform(context, query);
  }
}
