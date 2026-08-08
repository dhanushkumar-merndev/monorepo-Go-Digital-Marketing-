import type { SQLiteDatabase } from 'expo-sqlite';

import { enqueueOfflineLeadCommand, replayLeadOutbox } from './lead-outbox';

export interface OfflineMessageCommand {
  clientOrganizationId: string;
  conversationId: string;
  payload:
    | { content_type: 'TEXT'; text: string }
    | { content_type: 'TEMPLATE'; template_id: string; variables: Record<string, string> };
}

export function enqueueOfflineMessage(
  database: SQLiteDatabase,
  command: OfflineMessageCommand,
): Promise<string> {
  return enqueueOfflineLeadCommand(database, {
    clientOrganizationId: command.clientOrganizationId,
    path: `/messaging/conversations/${command.conversationId}/messages`,
    payload: command.payload,
  });
}

export const replayMessagingOutbox = replayLeadOutbox;
