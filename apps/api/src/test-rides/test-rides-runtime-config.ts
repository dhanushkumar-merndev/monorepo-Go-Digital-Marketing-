import type { TestRideEnvironment } from '@gdm/config';

export const TEST_RIDES_RUNTIME_CONFIG = Symbol('TEST_RIDES_RUNTIME_CONFIG');
export type TestRidesRuntimeConfig = TestRideEnvironment;
