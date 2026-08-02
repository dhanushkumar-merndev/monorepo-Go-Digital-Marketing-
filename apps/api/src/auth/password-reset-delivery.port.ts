import { Injectable } from '@nestjs/common';

export const PASSWORD_RESET_DELIVERY = Symbol('PASSWORD_RESET_DELIVERY');

export interface PasswordResetDeliveryPort {
  deliver(input: { email: string; expiresAt: Date; token: string }): Promise<void>;
}

/**
 * Production-safe unavailable adapter. It intentionally does not log or retain
 * reset tokens. Configure a reviewed provider adapter before enabling delivery.
 */
@Injectable()
export class UnavailablePasswordResetDelivery implements PasswordResetDeliveryPort {
  async deliver(_input: { email: string; expiresAt: Date; token: string }): Promise<void> {
    return Promise.resolve();
  }
}
