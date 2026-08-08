import { Module } from '@nestjs/common';
import { parseMessagingEnvironment } from '@gdm/config';
import { AuthModule } from '../auth/auth.module.js';
import { BackgroundJobProcessorRegistry } from '../background/background-job-processor.registry.js';
import { DatabaseInfrastructureModule } from '../infrastructure/database/database.module.js';
import { StorageInfrastructureModule } from '../infrastructure/storage/storage.module.js';
import { LeadsModule } from '../leads/leads.module.js';
import { DevelopmentMessagingProvider } from './development-messaging.provider.js';
import { MessagingController, MessagingWebhooksController } from './messaging.controller.js';
import { MESSAGING_PROVIDER_REGISTRY } from './messaging-provider.port.js';
import { DefaultMessagingProviderRegistry } from './messaging-provider.registry.js';
import {
  MESSAGING_RUNTIME_CONFIG,
  type MessagingRuntimeConfig,
} from './messaging-runtime-config.js';
import { MessagingService } from './messaging.service.js';
import { WhatsAppCloudProvider } from './whatsapp-cloud.provider.js';

const MESSAGING_BACKGROUND_REGISTRATION = Symbol('MESSAGING_BACKGROUND_REGISTRATION');

@Module({
  imports: [AuthModule, DatabaseInfrastructureModule, StorageInfrastructureModule, LeadsModule],
  controllers: [MessagingController, MessagingWebhooksController],
  providers: [
    {
      provide: MESSAGING_RUNTIME_CONFIG,
      useFactory: (): MessagingRuntimeConfig => parseMessagingEnvironment(process.env),
    },
    DevelopmentMessagingProvider,
    WhatsAppCloudProvider,
    DefaultMessagingProviderRegistry,
    { provide: MESSAGING_PROVIDER_REGISTRY, useExisting: DefaultMessagingProviderRegistry },
    MessagingService,
    {
      provide: MESSAGING_BACKGROUND_REGISTRATION,
      inject: [BackgroundJobProcessorRegistry, MessagingService],
      useFactory: (
        processors: BackgroundJobProcessorRegistry,
        messaging: MessagingService,
      ): true => {
        processors.register('messaging.webhook.process', async (job) => {
          const webhookEventId = (job.data as { webhookEventId?: unknown }).webhookEventId;
          if (typeof webhookEventId !== 'string')
            throw new Error('Messaging webhook job is invalid.');
          return messaging.processWebhookJob(webhookEventId);
        });
        processors.register('messaging.outbound.process', async (job) => {
          const data = job.data as {
            clientOrganizationId?: unknown;
            correlationId?: unknown;
            messageId?: unknown;
          };
          if (
            typeof data.clientOrganizationId !== 'string' ||
            typeof data.correlationId !== 'string' ||
            typeof data.messageId !== 'string'
          ) {
            throw new Error('Messaging outbound job is invalid.');
          }
          return messaging.processOutboundJob({
            clientOrganizationId: data.clientOrganizationId,
            correlationId: data.correlationId,
            messageId: data.messageId,
          });
        });
        return true;
      },
    },
  ],
  exports: [MessagingService],
})
export class MessagingModule {}
