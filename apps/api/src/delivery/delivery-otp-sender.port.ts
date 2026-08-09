import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export const DELIVERY_OTP_SENDER = Symbol('DELIVERY_OTP_SENDER');

export interface DeliveryOtpSender {
  send(input: {
    clientOrganizationId: string;
    code: string;
    deliveryJobId: string;
    phoneE164: string;
  }): Promise<void>;
}

@Injectable()
export class FailClosedDeliveryOtpSender implements DeliveryOtpSender {
  send(): Promise<void> {
    throw new ServiceUnavailableException({
      code: 'DELIVERY_OTP_PROVIDER_UNAVAILABLE',
      details: [],
      message: 'Delivery OTP delivery is not configured.',
      retryable: true,
    });
  }
}
