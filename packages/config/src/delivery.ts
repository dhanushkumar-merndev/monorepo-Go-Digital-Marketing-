import { z } from 'zod';

export const deliveryEnvironmentSchema = z
  .object({
    DELIVERY_OTP_PEPPER: z.string().trim().min(32).default('local-delivery-otp-pepper-change-me'),
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  })
  .superRefine((environment, context) => {
    if (
      (environment.NODE_ENV === 'staging' || environment.NODE_ENV === 'production') &&
      environment.DELIVERY_OTP_PEPPER === 'local-delivery-otp-pepper-change-me'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'DELIVERY_OTP_PEPPER must be set outside local development.',
        path: ['DELIVERY_OTP_PEPPER'],
      });
    }
  })
  .transform((environment) => ({ otpPepper: environment.DELIVERY_OTP_PEPPER }));

export type DeliveryEnvironment = z.output<typeof deliveryEnvironmentSchema>;

export const parseDeliveryEnvironment = (
  environment: NodeJS.ProcessEnv = process.env,
): DeliveryEnvironment => deliveryEnvironmentSchema.parse(environment);
