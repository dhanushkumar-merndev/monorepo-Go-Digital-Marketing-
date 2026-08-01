import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { DatabaseConnection } from '@gdm/database';
import { DATABASE_CONNECTION } from './database.tokens.js';

@Injectable()
export class DatabaseLifecycleService implements OnApplicationShutdown {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.connection.close();
  }
}
