import type { MessagingEnvironment } from '@gdm/config';

export const MESSAGING_RUNTIME_CONFIG = Symbol('MESSAGING_RUNTIME_CONFIG');
export type MessagingRuntimeConfig = MessagingEnvironment;
