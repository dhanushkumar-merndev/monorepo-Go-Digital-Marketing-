import {
  enqueueDeliveryCommand,
  enqueueDeliveryLocationSample,
  replayDeliveryOfflineWork,
} from '../data/delivery-offline';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'offline-delivery-operation-1' }));

describe('delivery offline replay', () => {
  it('queues tenant-bound location and terminal work with a stable idempotency key', async () => {
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const database = { runAsync } as never;

    await enqueueDeliveryLocationSample(database, {
      accuracy: 8,
      capturedAt: '2026-09-16T05:30:00.000Z',
      clientOrganizationId: 'tenant-a',
      jobId: 'delivery-a',
      latitude: 18.52,
      longitude: 73.85,
    });
    await enqueueDeliveryCommand(database, {
      clientOrganizationId: 'tenant-a',
      operationId: 'completion-stable-after-lost-response',
      path: '/delivery/11111111-1111-4111-8111-111111111111/complete',
      payload: { expected_version: 7, received_by: 'Customer' },
    });

    expect(runAsync.mock.calls[0]).toEqual(
      expect.arrayContaining(['offline-delivery-operation-1', 'tenant-a', 'delivery-a']),
    );
    expect(runAsync.mock.calls[1]).toEqual(
      expect.arrayContaining([
        'completion-stable-after-lost-response',
        'tenant-a',
        '/v1/delivery/11111111-1111-4111-8111-111111111111/complete',
      ]),
    );
  });

  it('replays locations before completion and preserves the completion idempotency key', async () => {
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const getAllAsync = jest
      .fn()
      .mockResolvedValueOnce([
        {
          accuracy_m: 8,
          captured_at: '2026-09-16T05:30:00.000Z',
          delivery_job_id: 'delivery-a',
          latitude: 18.52,
          longitude: 73.85,
          sample_id: 'sample-1',
        },
      ])
      .mockResolvedValueOnce([
        {
          command_path: '/v1/delivery/delivery-a/complete',
          idempotency_key: 'completion-1',
          operation_id: 'completion-1',
          payload_json: '{"expected_version":7,"received_by":"Customer"}',
        },
      ]);
    const database = { getAllAsync, runAsync } as never;
    const request = jest.fn().mockResolvedValue(new Response('{}', { status: 200 }));

    const result = await replayDeliveryOfflineWork(database, request, 'tenant-a');

    expect(request.mock.calls.map((call) => call[0])).toEqual([
      '/delivery/delivery-a/location',
      '/delivery/delivery-a/complete',
    ]);
    expect(request.mock.calls[1]?.[1]?.headers).toMatchObject({
      'Idempotency-Key': 'completion-1',
    });
    expect(result).toEqual({ commandsReplayed: 1, conflicts: 0, locationsReplayed: 1 });
    expect(runAsync).toHaveBeenCalledWith(
      'DELETE FROM mobile_outbox WHERE operation_id = ?',
      'completion-1',
    );
  });

  it('rejects non-terminal commands from the offline delivery outbox', async () => {
    const database = { runAsync: jest.fn() } as never;
    await expect(
      enqueueDeliveryCommand(database, {
        clientOrganizationId: 'tenant-a',
        path: '/delivery/11111111-1111-4111-8111-111111111111/start',
        payload: {},
      }),
    ).rejects.toThrow('Unsupported offline delivery command path');
  });
});
