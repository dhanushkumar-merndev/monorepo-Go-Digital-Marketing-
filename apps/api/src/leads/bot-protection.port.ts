import { Injectable } from '@nestjs/common';

export const BOT_PROTECTION = Symbol('BOT_PROTECTION');

export interface BotProtectionPort {
  verify(token: string | null | undefined, requestIp: string | undefined): Promise<boolean>;
}

@Injectable()
export class UnavailableBotProtectionAdapter implements BotProtectionPort {
  async verify(): Promise<boolean> {
    return false;
  }
}
