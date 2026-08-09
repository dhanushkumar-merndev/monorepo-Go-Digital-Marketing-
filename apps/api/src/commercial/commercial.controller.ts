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
  cancelBookingRequestSchema,
  commercialBookingListQuerySchema,
  completeCommercialDocumentUploadRequestSchema,
  createBookingRequestSchema,
  createExchangeCaseRequestSchema,
  createFinanceCaseRequestSchema,
  createInsuranceCaseRequestSchema,
  createInvoiceRequestSchema,
  createPaymentEntryRequestSchema,
  createQuotationRequestSchema,
  decideDiscountApprovalRequestSchema,
  decideExchangeCaseRequestSchema,
  decideFinanceCaseRequestSchema,
  disburseFinanceCaseRequestSchema,
  initiateCommercialDocumentUploadRequestSchema,
  reversePaymentEntryRequestSchema,
  reviseQuotationRequestSchema,
  verifyCommercialDocumentRequestSchema,
  verifyPaymentEntryRequestSchema,
  type CancelBookingRequest,
  type CommercialBookingListQuery,
  type CompleteCommercialDocumentUploadRequest,
  type CreateBookingRequest,
  type CreateExchangeCaseRequest,
  type CreateFinanceCaseRequest,
  type CreateInsuranceCaseRequest,
  type CreateInvoiceRequest,
  type CreatePaymentEntryRequest,
  type CreateQuotationRequest,
  type DecideDiscountApprovalRequest,
  type DecideExchangeCaseRequest,
  type DecideFinanceCaseRequest,
  type DisburseFinanceCaseRequest,
  type InitiateCommercialDocumentUploadRequest,
  type ReversePaymentEntryRequest,
  type ReviseQuotationRequest,
  type VerifyCommercialDocumentRequest,
  type VerifyPaymentEntryRequest,
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
import { CommercialService } from './commercial.service.js';

function correlation(request: AuthenticatedRequest): string {
  return resolveCorrelationId(request);
}

@ApiTags('commercial')
@ApiBearerAuth()
@Controller('commercial')
@RequireClientContext()
@RequireClientModule('BOOKING_BILLING')
export class CommercialController {
  constructor(@Inject(CommercialService) private readonly commercial: CommercialService) {}

  @Get('bookings')
  @RequirePermissions('commercial.bookings.read')
  list(
    @CurrentAuthorization() context: AuthorizationContext,
    @Query(new ZodSchemaValidationPipe(commercialBookingListQuerySchema))
    query: CommercialBookingListQuery,
  ) {
    return this.commercial.listBookings(context, query);
  }

  @Get('bookings/:bookingId')
  @RequirePermissions('commercial.bookings.read')
  detail(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
  ) {
    return this.commercial.bookingDetail(context, bookingId);
  }

  @Post('quotations')
  @RequirePermissions('commercial.quotations.manage')
  @ApiOperation({ summary: 'Create an immutable, versioned quotation' })
  createQuotation(
    @CurrentAuthorization() context: AuthorizationContext,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createQuotationRequestSchema)) body: CreateQuotationRequest,
  ) {
    return this.commercial.createQuotation(context, body, key, correlation(request));
  }

  @Post('quotations/:quotationId/revisions')
  @RequirePermissions('commercial.quotations.manage')
  reviseQuotation(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('quotationId', new ParseUUIDPipe()) quotationId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(reviseQuotationRequestSchema)) body: ReviseQuotationRequest,
  ) {
    return this.commercial.reviseQuotation(context, quotationId, body, key, correlation(request));
  }

  @Post('quotations/:quotationId/discount-decision')
  @RequirePermissions('commercial.discounts.approve')
  decideDiscount(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('quotationId', new ParseUUIDPipe()) quotationId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(decideDiscountApprovalRequestSchema))
    body: DecideDiscountApprovalRequest,
  ) {
    return this.commercial.decideDiscount(context, quotationId, body, key, correlation(request));
  }

  @Post('bookings')
  @RequirePermissions('commercial.bookings.manage')
  createBooking(
    @CurrentAuthorization() context: AuthorizationContext,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createBookingRequestSchema)) body: CreateBookingRequest,
  ) {
    return this.commercial.createBooking(context, body, key, correlation(request));
  }

  @Post('bookings/:bookingId/cancel')
  @RequirePermissions('commercial.bookings.cancel')
  cancelBooking(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(cancelBookingRequestSchema)) body: CancelBookingRequest,
  ) {
    return this.commercial.cancelBooking(context, bookingId, body, key, correlation(request));
  }

  @Post('bookings/:bookingId/payments')
  @RequirePermissions('commercial.payments.record')
  createPayment(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createPaymentEntryRequestSchema))
    body: CreatePaymentEntryRequest,
  ) {
    return this.commercial.createPayment(context, bookingId, body, key, correlation(request));
  }

  @Post('payments/:paymentId/verify')
  @RequirePermissions('commercial.payments.verify')
  verifyPayment(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(verifyPaymentEntryRequestSchema))
    body: VerifyPaymentEntryRequest,
  ) {
    return this.commercial.verifyPayment(context, paymentId, body, key, correlation(request));
  }

  @Post('payments/:paymentId/reverse')
  @RequirePermissions('commercial.payments.correct')
  reversePayment(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('paymentId', new ParseUUIDPipe()) paymentId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(reversePaymentEntryRequestSchema))
    body: ReversePaymentEntryRequest,
  ) {
    return this.commercial.reversePayment(context, paymentId, body, key, correlation(request));
  }

  @Post('bookings/:bookingId/finance')
  @RequirePermissions('commercial.finance.manage')
  createFinance(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createFinanceCaseRequestSchema))
    body: CreateFinanceCaseRequest,
  ) {
    return this.commercial.createFinance(context, bookingId, body, key, correlation(request));
  }

  @Post('finance/:financeCaseId/decision')
  @RequirePermissions('commercial.finance.manage')
  decideFinance(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('financeCaseId', new ParseUUIDPipe()) financeCaseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(decideFinanceCaseRequestSchema))
    body: DecideFinanceCaseRequest,
  ) {
    return this.commercial.decideFinance(context, financeCaseId, body, key, correlation(request));
  }

  @Post('finance/:financeCaseId/disburse')
  @RequirePermissions('commercial.finance.manage')
  disburseFinance(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('financeCaseId', new ParseUUIDPipe()) financeCaseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(disburseFinanceCaseRequestSchema))
    body: DisburseFinanceCaseRequest,
  ) {
    return this.commercial.disburseFinance(context, financeCaseId, body, key, correlation(request));
  }

  @Post('bookings/:bookingId/insurance')
  @RequirePermissions('commercial.insurance.manage')
  createInsurance(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createInsuranceCaseRequestSchema))
    body: CreateInsuranceCaseRequest,
  ) {
    return this.commercial.createInsurance(context, bookingId, body, key, correlation(request));
  }

  @Post('bookings/:bookingId/invoices')
  @RequirePermissions('commercial.invoices.manage')
  createInvoice(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createInvoiceRequestSchema)) body: CreateInvoiceRequest,
  ) {
    return this.commercial.createInvoice(context, bookingId, body, key, correlation(request));
  }

  @Post('bookings/:bookingId/exchange')
  @RequirePermissions('commercial.exchange.manage')
  createExchange(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(createExchangeCaseRequestSchema))
    body: CreateExchangeCaseRequest,
  ) {
    return this.commercial.createExchange(context, bookingId, body, key, correlation(request));
  }

  @Post('exchange/:exchangeCaseId/decision')
  @RequirePermissions('commercial.exchange.approve')
  decideExchange(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('exchangeCaseId', new ParseUUIDPipe()) exchangeCaseId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(decideExchangeCaseRequestSchema))
    body: DecideExchangeCaseRequest,
  ) {
    return this.commercial.decideExchange(context, exchangeCaseId, body, key, correlation(request));
  }

  @Post('documents/uploads')
  @RequirePermissions('commercial.documents.upload')
  initiateDocument(
    @CurrentAuthorization() context: AuthorizationContext,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(initiateCommercialDocumentUploadRequestSchema))
    body: InitiateCommercialDocumentUploadRequest,
  ) {
    return this.commercial.initiateDocument(context, body, key, correlation(request));
  }

  @Post('documents/:documentId/complete')
  @RequirePermissions('commercial.documents.upload')
  completeDocument(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(completeCommercialDocumentUploadRequestSchema))
    body: CompleteCommercialDocumentUploadRequest,
  ) {
    return this.commercial.completeDocument(context, documentId, body, key, correlation(request));
  }

  @Post('documents/:documentId/verify')
  @RequirePermissions('commercial.documents.verify')
  verifyDocument(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Body(new ZodSchemaValidationPipe(verifyCommercialDocumentRequestSchema))
    body: VerifyCommercialDocumentRequest,
  ) {
    return this.commercial.verifyDocument(context, documentId, body, key, correlation(request));
  }

  @Get('documents/:documentId/download')
  @RequirePermissions('commercial.documents.read')
  downloadDocument(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commercial.downloadDocument(context, documentId, correlation(request));
  }

  @Post('bookings/:bookingId/readiness/evaluate')
  @RequirePermissions('commercial.readiness.read')
  evaluateReadiness(
    @CurrentAuthorization() context: AuthorizationContext,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commercial.evaluateReadiness(context, bookingId, correlation(request));
  }
}
