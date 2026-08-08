import { z } from 'zod';

export const testRideEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    TEST_RIDE_ACTIVE_TIMEOUT_MINUTES: z.coerce.number().int().min(30).max(480).default(180),
    TEST_RIDE_LOCATION_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
    TEST_RIDE_LOCATION_STALE_SECONDS: z.coerce.number().int().min(60).max(900).default(120),
    TEST_RIDE_OTP_PEPPER: z.string().trim().min(32).default('local-test-ride-otp-pepper-change-me'),
  })
  .superRefine((environment, context) => {
    if (
      (environment.NODE_ENV === 'staging' || environment.NODE_ENV === 'production') &&
      environment.TEST_RIDE_OTP_PEPPER === 'local-test-ride-otp-pepper-change-me'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'TEST_RIDE_OTP_PEPPER must be set outside local development.',
        path: ['TEST_RIDE_OTP_PEPPER'],
      });
    }
  })
  .transform((environment) => ({
    activeTimeoutMinutes: environment.TEST_RIDE_ACTIVE_TIMEOUT_MINUTES,
    locationRetentionDays: environment.TEST_RIDE_LOCATION_RETENTION_DAYS,
    locationStaleSeconds: environment.TEST_RIDE_LOCATION_STALE_SECONDS,
    otpPepper: environment.TEST_RIDE_OTP_PEPPER,
  }));

export type TestRideEnvironment = z.output<typeof testRideEnvironmentSchema>;

export const parseTestRideEnvironment = (
  environment: NodeJS.ProcessEnv = process.env,
): TestRideEnvironment => testRideEnvironmentSchema.parse(environment);
