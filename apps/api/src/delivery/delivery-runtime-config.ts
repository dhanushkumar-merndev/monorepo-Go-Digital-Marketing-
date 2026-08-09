import type { DeliveryEnvironment } from '@gdm/config';

export const DELIVERY_RUNTIME_CONFIG = Symbol('DELIVERY_RUNTIME_CONFIG');
export type DeliveryRuntimeConfig = DeliveryEnvironment;
