/* Shared Zod contracts are the HTTP validation source of truth. */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  customerActivityRequestSchema,
  reminderListQuerySchema,
  reminderRuleRequestSchema,
  recordReminderConsentRequestSchema,
  rescheduleReminderRequestSchema,
  updateReminderPreferencesRequestSchema,
  updateVehicleReminderDetailsRequestSchema,
  type CustomerActivityRequest,
  type ReminderListQuery,
  type ReminderRuleRequest,
  type RecordReminderConsentRequest,
  type RescheduleReminderRequest,
  type UpdateReminderPreferencesRequest,
  type UpdateVehicleReminderDetailsRequest,
} from '@gdm/contracts';
import {
  CurrentAuthorization,
  RequireClientContext,
  RequireClientModule,
  RequirePermissions,
} from '../authorization/authorization.decorators.js';
import type {
  AuthenticatedRequest,
  AuthorizationContext,
} from '../authorization/authorization.types.js';
import { resolveCorrelationId } from '../common/correlation/correlation-id.js';
import { ZodSchemaValidationPipe } from '../common/validation/zod-validation.pipe.js';
import { RemindersService } from './reminders.service.js';

const correlation = (request: AuthenticatedRequest): string => resolveCorrelationId(request);

@ApiTags('post-sale-reminders')
@ApiBearerAuth()
@Controller('reminders')
@RequireClientContext()
@RequireClientModule('DELIVERY_RC')
export class RemindersController {
  constructor(@Inject(RemindersService) private readonly reminders: RemindersService) {}

  @Get('definitions')
  @RequirePermissions('reminders.read')
  definitions(@CurrentAuthorization() context: AuthorizationContext) {
    return this.reminders.definitions(context);
  }

  @Get('rules')
  @RequirePermissions('reminders.read')
  rules(@CurrentAuthorization() context: AuthorizationContext) {
    return this.reminders.rules(context);
  }

  @Post('rules')
  @RequirePermissions('reminders.rules.manage')
  @ApiOperation({ summary: 'Create a fixed tenant/model reminder rule using an approved template' })
  createRule(
    @CurrentAuthorization() context: AuthorizationContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(reminderRuleRequestSchema)) body: ReminderRuleRequest,
  ) {
    return this.reminders.createRule(context, body, idempotencyKey, correlation(request));
  }

  @Get('plans')
  @RequirePermissions('reminders.read')
  plans(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query(new ZodSchemaValidationPipe(reminderListQuerySchema)) query: ReminderListQuery,
  ) {
    return this.reminders.plans(context, query);
  }

  @Get('instances')
  @RequirePermissions('reminders.read')
  instances(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query(new ZodSchemaValidationPipe(reminderListQuerySchema)) query: ReminderListQuery,
  ) {
    return this.reminders.instances(context, query);
  }

  @Get('instances/:instanceId/history')
  @RequirePermissions('reminders.read')
  history(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('instanceId', new ParseUUIDPipe()) instanceId: string,
  ) {
    return this.reminders.history(context, instanceId);
  }

  @Post('vehicles/:vehicleId/generate')
  @RequirePermissions('reminders.generate')
  generate(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('vehicleId', new ParseUUIDPipe()) vehicleId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.reminders.generateForVehicle(
      context,
      vehicleId,
      idempotencyKey,
      correlation(request),
    );
  }

  @Post('vehicles/:vehicleId/details')
  @RequirePermissions('reminders.generate')
  updateVehicleDetails(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('vehicleId', new ParseUUIDPipe()) vehicleId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(updateVehicleReminderDetailsRequestSchema))
    body: UpdateVehicleReminderDetailsRequest,
  ) {
    return this.reminders.updateVehicleDetails(
      context,
      vehicleId,
      body,
      idempotencyKey,
      correlation(request),
    );
  }

  @Get('vehicles/:vehicleId/preferences')
  @RequirePermissions('reminders.read')
  preferences(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('vehicleId', new ParseUUIDPipe()) vehicleId: string,
  ) {
    return this.reminders.preferences(context, vehicleId);
  }

  @Post('vehicles/:vehicleId/preferences')
  @RequirePermissions('reminders.preferences.manage')
  updatePreferences(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('vehicleId', new ParseUUIDPipe()) vehicleId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(updateReminderPreferencesRequestSchema))
    body: UpdateReminderPreferencesRequest,
  ) {
    return this.reminders.updatePreferences(
      context,
      vehicleId,
      body,
      idempotencyKey,
      correlation(request),
    );
  }

  @Post('vehicles/:vehicleId/consent')
  @RequirePermissions('reminders.preferences.manage')
  recordConsent(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('vehicleId', new ParseUUIDPipe()) vehicleId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(recordReminderConsentRequestSchema))
    body: RecordReminderConsentRequest,
  ) {
    return this.reminders.recordConsent(
      context,
      vehicleId,
      body,
      idempotencyKey,
      correlation(request),
    );
  }

  @Post('instances/:instanceId/reschedule')
  @RequirePermissions('reminders.dispatch.manage')
  reschedule(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('instanceId', new ParseUUIDPipe()) instanceId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(rescheduleReminderRequestSchema))
    body: RescheduleReminderRequest,
  ) {
    return this.reminders.reschedule(
      context,
      instanceId,
      body,
      idempotencyKey,
      correlation(request),
    );
  }

  @Post('dispatch-due')
  @RequirePermissions('reminders.dispatch.manage')
  dispatchDue(
    @CurrentAuthorization() context: AuthorizationContext,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.reminders.queueDueForContext(context, correlation(request));
  }

  @Post('contacts/:contactId/activities')
  @RequirePermissions('customer_activities.create')
  activity(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('contactId', new ParseUUIDPipe()) contactId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(customerActivityRequestSchema)) body: CustomerActivityRequest,
  ) {
    return this.reminders.appendActivity(
      context,
      contactId,
      body,
      idempotencyKey,
      correlation(request),
    );
  }
}
