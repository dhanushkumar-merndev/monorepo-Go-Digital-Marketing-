import { describe, expect, it } from 'vitest';
import {
  reminderRuleRequestSchema,
  rescheduleReminderRequestSchema,
  updateReminderPreferencesRequestSchema,
} from './contracts.js';

describe('Phase 11 reminder contracts', () => {
  it('keeps operational and marketing categories explicit', () => {
    expect(
      reminderRuleRequestSchema.parse({
        base_date_field: 'DELIVERY_DATE',
        category: 'OPERATIONAL',
        channel: 'WHATSAPP',
        due_after_days: 180,
        notice_days: [30, 15, 7, 1],
        reminder_type: 'SERVICE_DUE',
        template_id: '11111111-1111-4111-8111-111111111111',
        threshold_kind: 'DATE',
      }).category,
    ).toBe('OPERATIONAL');
  });

  it('rejects incomplete kilometre rules', () => {
    expect(() =>
      reminderRuleRequestSchema.parse({
        category: 'OPERATIONAL',
        channel: 'SMS',
        notice_days: [0],
        reminder_type: 'SERVICE_DUE',
        template_id: '11111111-1111-4111-8111-111111111111',
        threshold_kind: 'KILOMETRE',
      }),
    ).toThrow();
  });

  it('requires optimistic versions for rescheduling and preferences', () => {
    expect(() =>
      rescheduleReminderRequestSchema.parse({
        expected_version: 0,
        reason: 'Customer requested another date.',
        scheduled_for: new Date().toISOString(),
      }),
    ).toThrow();
    expect(
      updateReminderPreferencesRequestSchema.parse({
        expected_version: null,
        marketing_enabled: false,
        operational_enabled: true,
        preferred_channel: 'EMAIL',
        reason: 'Customer preference captured.',
      }).marketing_enabled,
    ).toBe(false);
  });
});
