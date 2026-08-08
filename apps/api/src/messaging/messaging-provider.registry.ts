import { Inject, Injectable } from '@nestjs/common';
import { DevelopmentMessagingProvider } from './development-messaging.provider.js';
import type { MessagingProvider, MessagingProviderRegistry } from './messaging-provider.port.js';
import { WhatsAppCloudProvider } from './whatsapp-cloud.provider.js';

@Injectable()
export class DefaultMessagingProviderRegistry implements MessagingProviderRegistry {
  private readonly providers: ReadonlyMap<string, MessagingProvider>;

  constructor(
    @Inject(DevelopmentMessagingProvider) development: DevelopmentMessagingProvider,
    @Inject(WhatsAppCloudProvider) whatsappCloud: WhatsAppCloudProvider,
  ) {
    this.providers = new Map<string, MessagingProvider>([
      [development.provider, development],
      [whatsappCloud.provider, whatsappCloud],
    ]);
  }

  provider(code: string): MessagingProvider | undefined {
    return this.providers.get(code.toUpperCase());
  }
}
