import { describe, expect, it } from 'vitest';

import {
  assignConversationRequestSchema,
  beginMessageMediaUploadRequestSchema,
  messageTemplateVariableKeys,
  sendMessageRequestSchema,
} from '../index.js';

const id = '018f25a7-6dc0-7d4a-b7c6-6ba6f7446711';

describe('Phase 5 messaging contracts', () => {
  it('keeps free-form and template commands explicitly distinct', () => {
    expect(
      sendMessageRequestSchema.safeParse({ content_type: 'TEXT', text: 'Hello' }).success,
    ).toBe(true);
    expect(
      sendMessageRequestSchema.safeParse({
        content_type: 'TEMPLATE',
        template_id: id,
        variables: { '1': 'Customer' },
      }).success,
    ).toBe(true);
    expect(
      sendMessageRequestSchema.safeParse({ content_type: 'TEXT', template_id: id }).success,
    ).toBe(false);
    expect(
      sendMessageRequestSchema.safeParse({
        content_type: 'TEMPLATE',
        template_id: id,
        variables: { customer: 'Customer' },
      }).success,
    ).toBe(false);
    expect(
      sendMessageRequestSchema.safeParse({
        content_type: 'TEMPLATE',
        template_id: id,
        variables: { '1': '   ' },
      }).success,
    ).toBe(false);
  });

  it('extracts numbered provider placeholders in canonical send order', () => {
    expect(messageTemplateVariableKeys('Hi {{2}}, order {{ 1 }} / {{2}} / {{10}}')).toEqual([
      '1',
      '2',
      '10',
    ]);
  });

  it('requires optimistic assignment evidence and an owner or team target', () => {
    expect(
      assignConversationRequestSchema.safeParse({
        expected_version: 1,
        owner_membership_id: null,
        reason: 'Route this customer reply.',
        team_id: null,
      }).success,
    ).toBe(false);
    expect(
      assignConversationRequestSchema.safeParse({
        expected_version: 1,
        owner_membership_id: id,
        reason: 'Route this customer reply.',
        team_id: null,
      }).success,
    ).toBe(true);
  });

  it('accepts only the allowlisted outbound media types', () => {
    const request = {
      caption: null,
      conversation_id: id,
      filename: 'quotation.pdf',
      size_bytes: 4096,
    };
    expect(
      beginMessageMediaUploadRequestSchema.safeParse({ ...request, mime_type: 'application/pdf' })
        .success,
    ).toBe(true);
    expect(
      beginMessageMediaUploadRequestSchema.safeParse({ ...request, mime_type: 'text/html' })
        .success,
    ).toBe(false);
  });
});
