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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  createDealershipCustomerVehicleRequestSchema,
  createExternalCustomerVehicleRequestSchema,
  customerVehicleListQuerySchema,
  updateCustomerVehicleCoverageRequestSchema,
  type CreateDealershipCustomerVehicleRequest,
  type CreateExternalCustomerVehicleRequest,
  type CustomerVehicleListQuery,
  type UpdateCustomerVehicleCoverageRequest,
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
import { RegistrationService } from './registration.service.js';

@ApiTags('customer-vehicles')
@ApiBearerAuth()
@Controller('customer-vehicles')
@RequireClientContext()
@RequireClientModule('DELIVERY_RC')
export class CustomerVehiclesController {
  constructor(@Inject(RegistrationService) private readonly registration: RegistrationService) {}

  @Get()
  @RequirePermissions('customer_vehicles.read')
  list(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query(new ZodSchemaValidationPipe(customerVehicleListQuerySchema))
    query: CustomerVehicleListQuery,
  ) {
    return this.registration.listVehicles(context, query);
  }

  @Get(':vehicleId')
  @RequirePermissions('customer_vehicles.read')
  detail(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('vehicleId', new ParseUUIDPipe()) vehicleId: string,
  ) {
    return this.registration.vehicleDetail(context, vehicleId);
  }

  @Post('dealership')
  @RequirePermissions('customer_vehicles.manage')
  dealership(
    @CurrentAuthorization() context: AuthorizationContext,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createDealershipCustomerVehicleRequestSchema))
    body: CreateDealershipCustomerVehicleRequest,
  ) {
    return this.registration.createDealershipVehicle(
      context,
      body,
      key,
      resolveCorrelationId(request),
    );
  }

  @Post('external')
  @RequirePermissions('customer_vehicles.manage')
  external(
    @CurrentAuthorization() context: AuthorizationContext,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createExternalCustomerVehicleRequestSchema))
    body: CreateExternalCustomerVehicleRequest,
  ) {
    return this.registration.createExternalVehicle(
      context,
      body,
      key,
      resolveCorrelationId(request),
    );
  }

  @Post(':vehicleId/coverage')
  @RequirePermissions('customer_vehicles.manage')
  coverage(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('vehicleId', new ParseUUIDPipe()) vehicleId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(updateCustomerVehicleCoverageRequestSchema))
    body: UpdateCustomerVehicleCoverageRequest,
  ) {
    return this.registration.updateVehicleCoverage(
      context,
      vehicleId,
      body,
      key,
      resolveCorrelationId(request),
    );
  }
}
