import { Inject, Injectable } from '@nestjs/common';
import { DevelopmentTelephonyProvider } from './development-telephony.provider.js';
import type { TelephonyProvider, TelephonyProviderRegistry } from './telephony-provider.port.js';

@Injectable()
export class DefaultTelephonyProviderRegistry implements TelephonyProviderRegistry {
  private readonly providers: ReadonlyMap<string, TelephonyProvider>;

  constructor(@Inject(DevelopmentTelephonyProvider) development: DevelopmentTelephonyProvider) {
    this.providers = new Map([[development.provider, development]]);
  }

  provider(code: string): TelephonyProvider | undefined {
    return this.providers.get(code.trim().toUpperCase());
  }
}
