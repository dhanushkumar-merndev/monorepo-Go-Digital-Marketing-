import { enqueueOfflineMessage } from '../data/messaging-outbox';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'message-operation-1' }));

describe('messaging offline outbox', () => {
  it('queues a tenant-bound send with a stable idempotency key', async () => {
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const database = { runAsync } as never;

    await enqueueOfflineMessage(database, {
      clientOrganizationId: 'tenant-a',
      conversationId: 'conversation-1',
      payload: { content_type: 'TEXT', text: 'Queued reply' },
    });

    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO mobile_outbox'),
      'message-operation-1',
      'tenant-a',
      '/v1/messaging/conversations/conversation-1/messages',
      JSON.stringify({ content_type: 'TEXT', text: 'Queued reply' }),
      'message-operation-1',
      null,
      expect.any(String),
    );
  });
});
