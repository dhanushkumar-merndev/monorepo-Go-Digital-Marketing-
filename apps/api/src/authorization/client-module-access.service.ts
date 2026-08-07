import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { schema, type DatabaseConnection } from '@gdm/database';
import { and, eq } from 'drizzle-orm';
import { DATABASE_CONNECTION } from '../infrastructure/database/database.tokens.js';

export type ClientModule =
  | 'LEADS'
  | 'TELEPHONY'
  | 'INBOX'
  | 'TEST_RIDES'
  | 'INVENTORY'
  | 'BOOKING_BILLING'
  | 'DELIVERY_RC'
  | 'POST_SALE'
  | 'INTEGRATIONS';

@Injectable()
export class ClientModuleAccessService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly connection: DatabaseConnection) {}

  async isEnabled(clientOrganizationId: string, module: ClientModule): Promise<boolean> {
    const [flag] = await this.connection.db
      .select({ enabled: schema.clientModuleFlags.enabled })
      .from(schema.clientModuleFlags)
      .where(
        and(
          eq(schema.clientModuleFlags.clientOrganizationId, clientOrganizationId),
          eq(schema.clientModuleFlags.module, module),
        ),
      )
      .limit(1);
    return flag?.enabled === true;
  }

  async assertEnabled(clientOrganizationId: string, module: ClientModule): Promise<void> {
    if (!(await this.isEnabled(clientOrganizationId, module)))
      throw new ForbiddenException({
        code: 'FEATURE_DISABLED',
        details: [{ field: 'module', reason: module }],
        message: 'This module is not enabled for the active client.',
        retryable: false,
      });
  }
}
