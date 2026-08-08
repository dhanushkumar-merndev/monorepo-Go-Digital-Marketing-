import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';

import { WhatsAppCloudProvider } from '../src/messaging/whatsapp-cloud.provider.js';

const connection = {
  accessToken: 'test-token',
  appSecret: 'test-app-secret',
  connectionId: 'connection-1',
  connectionKey: 'connection-key-1',
  phoneNumberId: 'phone-number-1',
  provider: 'WHATSAPP_CLOUD',
  settings: { graph_api_version: 'v23.0' },
  verifyToken: 'verify-token',
  wabaId: 'waba-1',
};

describe('WhatsApp Cloud provider boundary', () => {
  it('verifies Meta signatures and normalizes message and status webhook entries', async () => {
    const provider = new WhatsAppCloudProvider();
    const payload = {
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                contacts: [{ profile: { name: 'Cloud Customer' }, wa_id: '919876543210' }],
                metadata: { phone_number_id: 'phone-number-1' },
                messages: [
                  {
                    from: '919876543210',
                    id: 'wamid.inbound-1',
                    referral: { ad_id: 'ad-1', campaign_id: 'campaign-1' },
                    text: { body: 'Hello from WhatsApp' },
                    timestamp: '1786179600',
                    type: 'text',
                  },
                ],
                statuses: [
                  {
                    id: 'wamid.outbound-1',
                    status: 'delivered',
                    timestamp: '1786179660',
                  },
                ],
              },
            },
          ],
          id: 'waba-1',
        },
      ],
      object: 'whatsapp_business_account',
    };
    const rawBody = JSON.stringify(payload);
    const signature = createHmac('sha256', connection.appSecret)
      .update(rawBody, 'utf8')
      .digest('hex');
    assert.equal(
      await provider.verifyWebhook({
        connection,
        headers: { 'x-hub-signature-256': `sha256=${signature}` },
        rawBody,
      }),
      true,
    );
    assert.equal(
      await provider.verifyWebhook({
        connection,
        headers: { 'x-hub-signature-256': 'sha256=00' },
        rawBody,
      }),
      false,
    );
    const events = await provider.parseWebhook({ connection, payload });
    assert.equal(events.length, 2);
    assert.deepEqual(events[0], {
      kind: 'MESSAGE',
      message: {
        bodyText: 'Hello from WhatsApp',
        contentType: 'TEXT',
        customerDisplayName: 'Cloud Customer',
        externalEventId: 'wamid.inbound-1',
        occurredAt: new Date('2026-08-08T09:00:00.000Z'),
        providerMessageId: 'wamid.inbound-1',
        referral: { ad_id: 'ad-1', campaign_id: 'campaign-1' },
        remoteAddress: '919876543210',
      },
    });
    assert.equal(events[1]?.kind, 'STATUS');
    if (events[1]?.kind === 'STATUS') {
      assert.equal(events[1].status.providerMessageId, 'wamid.outbound-1');
      assert.equal(events[1].status.status, 'DELIVERED');
    }
  });

  it('rejects a validly shaped payload routed to another tenant phone identity', async () => {
    const provider = new WhatsAppCloudProvider();
    await assert.rejects(
      provider.parseWebhook({
        connection,
        payload: {
          entry: [
            {
              changes: [
                {
                  field: 'messages',
                  value: {
                    messages: [],
                    metadata: { phone_number_id: 'another-tenant-phone' },
                  },
                },
              ],
              id: 'waba-1',
            },
          ],
          object: 'whatsapp_business_account',
        },
      }),
      /does not match the tenant connection/u,
    );
  });
});
