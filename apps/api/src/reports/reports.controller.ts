/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  auditEventQuerySchema,
  createExportRequestSchema,
  exportListQuerySchema,
  reportRangeSchema,
  type AuditEventQuery,
  type CreateExportRequest,
  type ExportListQuery,
  type ReportRange,
} from '@gdm/contracts';
import {
  CurrentAuthorization,
  RequireClientContext,
  RequirePermissions,
} from '../authorization/authorization.decorators.js';
import type {
  AuthenticatedRequest,
  AuthorizationContext,
} from '../authorization/authorization.types.js';
import { resolveCorrelationId } from '../common/correlation/correlation-id.js';
import { ZodSchemaValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { ReportsService } from './reports.service.js';

@ApiTags('reports-and-exports')
@ApiBearerAuth()
@Controller('reports')
@RequireClientContext()
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}
  @Get('dashboard')
  @RequirePermissions('reports.read')
  @ApiOperation({ summary: 'Read authoritative scoped operational KPIs' })
  dashboard(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query(new ZodSchemaValidationPipe(reportRangeSchema)) query: ReportRange,
  ) {
    return this.reports.dashboard(context, query);
  }
  @Get('audit-events') @RequirePermissions('audit.events.read') audit(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query(new ZodSchemaValidationPipe(auditEventQuerySchema)) query: AuditEventQuery,
  ) {
    return this.reports.auditEvents(context, query);
  }
  @Post('exports') @RequirePermissions('reports.export') create(
    @CurrentAuthorization() context: AuthorizationContext,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createExportRequestSchema)) body: CreateExportRequest,
  ) {
    return this.reports.createExport(context, body, resolveCorrelationId(request));
  }
  @Get('exports') @RequirePermissions('reports.export') list(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query(new ZodSchemaValidationPipe(exportListQuerySchema)) query: ExportListQuery,
  ) {
    return this.reports.listExports(context, query);
  }
  @Get('exports/:exportId/download') @RequirePermissions('reports.export') download(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('exportId', new ParseUUIDPipe()) id: string,
  ) {
    return this.reports.downloadExport(context, id);
  }
}
