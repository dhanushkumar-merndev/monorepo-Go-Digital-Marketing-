import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import * as schema from './schema/index.js';

export interface DatabaseConnectionOptions {
  url: string;
  maxConnections?: number;
  connectTimeoutSeconds?: number;
  idleTimeoutSeconds?: number;
}

export interface DatabasePingResult {
  latencyMs: number;
}

export class DatabaseConnection {
  readonly db: PostgresJsDatabase<typeof schema>;
  private readonly client: Sql;

  constructor(options: DatabaseConnectionOptions) {
    this.client = postgres(options.url, {
      max: options.maxConnections ?? 10,
      connect_timeout: options.connectTimeoutSeconds ?? 5,
      idle_timeout: options.idleTimeoutSeconds ?? 20,
      prepare: false,
    });
    this.db = drizzle(this.client, { schema });
  }

  async ping(): Promise<DatabasePingResult> {
    const startedAt = performance.now();
    await this.client`select 1 as healthy`;
    return { latencyMs: Math.max(0, Math.round(performance.now() - startedAt)) };
  }

  async close(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}

export const createDatabaseConnection = (options: DatabaseConnectionOptions): DatabaseConnection =>
  new DatabaseConnection(options);
