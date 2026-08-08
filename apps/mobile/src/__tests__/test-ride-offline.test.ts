import {
  enqueueTestRideCommand,
  enqueueTestRideLocationSample,
  replayTestRideOfflineWork,
} from '../data/test-ride-offline';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'offline-ride-operation-1' }));

describe('test-ride offline replay', () => {
  it('queues temporary location and completion with tenant-bound stable identifiers', async () => {
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const database = { runAsync } as never;

    await enqueueTestRideLocationSample(database, {
      accuracy: 12,
      capturedAt: '2026-08-08T10:00:00.000Z',
      clientOrganizationId: 'tenant-a',
      latitude: 18.52,
      longitude: 73.85,
      rideId: 'ride-a',
    });
    await enqueueTestRideCommand(database, {
      clientOrganizationId: 'tenant-a',
      path: '/test-rides/11111111-1111-4111-8111-111111111111/complete',
      payload: { expected_version: 5 },
    });

    expect(runAsync.mock.calls[0]).toEqual(
      expect.arrayContaining(['offline-ride-operation-1', 'tenant-a', 'ride-a']),
    );
    expect(runAsync.mock.calls[1]).toEqual(
      expect.arrayContaining([
        'offline-ride-operation-1',
        'tenant-a',
        '/v1/test-rides/11111111-1111-4111-8111-111111111111/complete',
      ]),
    );
  });

  it('flushes location before one completion replay and deletes the accepted command', async () => {
    const runAsync = jest.fn().mockResolvedValue(undefined);
    const getAllAsync = jest
      .fn()
      .mockResolvedValueOnce([
        {
          accuracy_m: 10,
          captured_at: '2026-08-08T10:00:00.000Z',
          latitude: 18.52,
          longitude: 73.85,
          sample_id: 'sample-1',
          test_ride_job_id: 'ride-a',
        },
      ])
      .mockResolvedValueOnce([
        {
          command_path: '/v1/test-rides/ride-a/complete',
          idempotency_key: 'completion-1',
          operation_id: 'completion-1',
          payload_json: '{"expected_version":5}',
        },
      ]);
    const database = { getAllAsync, runAsync } as never;
    const request = jest.fn().mockResolvedValue(new Response('{}', { status: 200 }));

    const result = await replayTestRideOfflineWork(database, request, 'tenant-a');

    expect(request.mock.calls.map((call) => call[0])).toEqual([
      '/test-rides/ride-a/location',
      '/test-rides/ride-a/complete',
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
});
