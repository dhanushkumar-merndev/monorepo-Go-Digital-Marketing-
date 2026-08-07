import { enqueueOfflineLeadCommand, replayLeadOutbox } from '../data/lead-outbox';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'operation-1' }));

describe('lead offline outbox', () => {
  it('queues commands with tenant, version and idempotency evidence', async () => {
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const database = { runAsync } as never;
    await enqueueOfflineLeadCommand(database, {
      baseVersion: 3,
      clientOrganizationId: 'tenant-a',
      path: '/leads/lead-1/notes',
      payload: { note: 'Called customer' },
    });
    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO mobile_outbox'),
      'operation-1',
      'tenant-a',
      '/v1/leads/lead-1/notes',
      JSON.stringify({ note: 'Called customer' }),
      'operation-1',
      3,
      expect.any(String),
    );
  });

  it('retains a replay conflict instead of overwriting server state', async () => {
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const database = {
      getAllAsync: jest.fn().mockResolvedValue([
        {
          command_path: '/v1/leads/lead-1/transitions',
          idempotency_key: 'key-1',
          operation_id: 'operation-1',
          payload_json: '{}',
        },
      ]),
      runAsync,
    } as never;
    const result = await replayLeadOutbox(
      database,
      jest.fn().mockResolvedValue(new Response(null, { status: 409 })),
      'tenant-a',
    );
    expect(result).toEqual({ conflicts: 1, replayed: 0 });
    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining("state = 'CONFLICT'"),
      'operation-1',
    );
  });
});
