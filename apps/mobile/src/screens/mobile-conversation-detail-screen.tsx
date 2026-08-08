import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { messageTemplateVariableKeys } from '@gdm/contracts';
import * as DocumentPicker from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';
import { useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useAuth } from '../auth/auth-provider';
import { Alert, AppText, Badge, Button, Card, StatePanel, TextField } from '../components/ui';
import { MobileShell } from '../components/mobile-shell';
import { enqueueOfflineMessage, replayMessagingOutbox } from '../data/messaging-outbox';
import { useAppStore } from '../store/app-store';
import { useAuthStore } from '../store/auth-store';
import { useMobileInboxUiStore } from '../store/inbox-ui.store';
import { parseJson } from './assigned-leads-screen';

interface MessageTemplate {
  body_text: string;
  category: string;
  id: string;
  name: string;
  status: string;
}

interface MessageSummary {
  body_text: string | null;
  content_type: string;
  created_at: string;
  direction: 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
  id: string;
  media: { availability: string; filename: string | null; id: string; mime_type: string }[];
  provider_occurred_at: string | null;
  status: string;
  template_name: string | null;
}

interface ConversationDetail {
  conversation: {
    contact_name: string;
    free_form_allowed: boolean;
    free_form_window_expires_at: string | null;
    id: string;
    phone_e164: string;
    status: string;
    unread_count: number;
    vehicle_interest: string;
  };
  messages: MessageSummary[];
}

export function MobileConversationDetailScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const { request } = useAuth();
  const database = useSQLiteContext();
  const cache = useQueryClient();
  const principal = useAuthStore((state) => state.principal);
  const connectivity = useAppStore((state) => state.connectivity);
  const mode = useMobileInboxUiStore((state) => state.composerMode);
  const text = useMobileInboxUiStore((state) => state.draftText);
  const templateId = useMobileInboxUiStore((state) => state.selectedTemplateId);
  const templateVariables = useMobileInboxUiStore((state) => state.templateVariables);
  const prepareComposer = useMobileInboxUiStore((state) => state.prepareComposer);
  const resetComposer = useMobileInboxUiStore((state) => state.resetComposer);
  const setMode = useMobileInboxUiStore((state) => state.setComposerMode);
  const setText = useMobileInboxUiStore((state) => state.setDraftText);
  const setTemplateId = useMobileInboxUiStore((state) => state.setSelectedTemplateId);
  const setTemplateVariable = useMobileInboxUiStore((state) => state.setTemplateVariable);
  const [message, setMessage] = useState<string | null>(null);
  const markedRead = useRef(new Set<string>());
  const detail = useQuery({
    queryKey: ['mobile', 'conversation', conversationId],
    queryFn: async () =>
      parseJson<ConversationDetail>(await request(`/messaging/conversations/${conversationId}`)),
    enabled: Boolean(conversationId),
  });
  const templates = useQuery({
    queryKey: ['mobile', 'message-templates'],
    queryFn: async () =>
      parseJson<{ templates: MessageTemplate[] }>(
        await request('/messaging/templates?status=APPROVED'),
      ),
  });
  const selectedTemplate = templates.data?.templates.find((template) => template.id === templateId);
  const variableKeys = selectedTemplate
    ? messageTemplateVariableKeys(selectedTemplate.body_text)
    : [];

  useEffect(() => {
    if (conversationId) prepareComposer(conversationId);
  }, [conversationId, prepareComposer]);

  useEffect(() => {
    const conversation = detail.data?.conversation;
    if (
      !conversationId ||
      !conversation ||
      conversation.unread_count === 0 ||
      markedRead.current.has(conversationId)
    )
      return;
    markedRead.current.add(conversationId);
    void request(`/messaging/conversations/${conversationId}/read`, { method: 'POST' })
      .then((response) => {
        if (response.ok) {
          cache.setQueryData<ConversationDetail>(
            ['mobile', 'conversation', conversationId],
            (current) =>
              current
                ? { ...current, conversation: { ...current.conversation, unread_count: 0 } }
                : current,
          );
          return cache.invalidateQueries({ queryKey: ['mobile', 'assigned-conversations'] });
        }
        return undefined;
      })
      .catch(() => undefined)
      .finally(() => markedRead.current.delete(conversationId));
  }, [cache, conversationId, detail.data?.conversation, request]);
  const send = useMutation({
    mutationFn: async () => {
      if (!principal || !conversationId) throw new Error('No active tenant conversation.');
      const payload =
        mode === 'TEXT'
          ? ({ content_type: 'TEXT', text } as const)
          : ({
              content_type: 'TEMPLATE',
              template_id: templateId,
              variables: templateVariables,
            } as const);
      if (connectivity === 'offline') {
        await enqueueOfflineMessage(database, {
          clientOrganizationId: principal.clientOrganizationId,
          conversationId,
          payload,
        });
        return { queued: true };
      }
      const response = await request(`/messaging/conversations/${conversationId}/messages`, {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
        method: 'POST',
      });
      if (!response.ok) throw new Error(`Message rejected (${String(response.status)}).`);
      return { queued: false };
    },
    onSuccess: (result) => {
      setMessage(
        result.queued ? 'Saved to the tenant-scoped offline outbox.' : 'Message accepted.',
      );
      resetComposer();
      void cache.invalidateQueries({ queryKey: ['mobile', 'conversation', conversationId] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Message failed.'),
  });
  const upload = useMutation({
    mutationFn: async () => {
      if (connectivity === 'offline') throw new Error('Media cannot be queued offline.');
      if (!conversationId) throw new Error('No conversation is selected.');
      const picked = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: [
          'image/jpeg',
          'image/png',
          'application/pdf',
          'audio/mpeg',
          'audio/mp4',
          'video/mp4',
        ],
      });
      if (picked.canceled) return { canceled: true };
      const asset = picked.assets[0];
      if (!asset?.mimeType || asset.size === undefined)
        throw new Error('The selected file does not provide safe MIME and size metadata.');
      const beginResponse = await request('/messaging/media/uploads', {
        body: JSON.stringify({
          caption: null,
          conversation_id: conversationId,
          filename: asset.name,
          mime_type: asset.mimeType,
          size_bytes: asset.size,
        }),
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
        method: 'POST',
      });
      const begin = await parseJson<{ media_id: string; upload: { method: 'PUT'; url: string } }>(
        beginResponse,
      );
      const fileResponse = await fetch(asset.uri);
      const blob = await fileResponse.blob();
      const stored = await fetch(begin.upload.url, {
        body: blob,
        headers: { 'Content-Type': asset.mimeType },
        method: begin.upload.method,
      });
      if (!stored.ok) throw new Error('Private object storage rejected the media upload.');
      const complete = await request(`/messaging/media/${begin.media_id}/complete`, {
        body: JSON.stringify({ checksum_sha256: null }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      if (!complete.ok) throw new Error(`Media completion failed (${String(complete.status)}).`);
      return { canceled: false };
    },
    onSuccess: (result) => {
      if (!result.canceled) {
        setMessage('Media verified and queued for delivery.');
        void cache.invalidateQueries({ queryKey: ['mobile', 'conversation', conversationId] });
      }
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Media send failed.'),
  });
  const retry = useMutation({
    mutationFn: async (messageId: string) => {
      if (connectivity === 'offline') throw new Error('Failed sends can be retried when online.');
      const response = await request(`/messaging/messages/${messageId}/retry`, { method: 'POST' });
      if (!response.ok) throw new Error(`Retry rejected (${String(response.status)}).`);
    },
    onSuccess: () => {
      setMessage('Failed-send retry accepted.');
      void cache.invalidateQueries({ queryKey: ['mobile', 'conversation', conversationId] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : 'Retry failed.'),
  });

  if (detail.isPending)
    return (
      <MobileShell title="Conversation">
        <StatePanel state="loading" />
      </MobileShell>
    );
  if (detail.isError || !detail.data)
    return (
      <MobileShell title="Conversation">
        <StatePanel actionLabel="Retry" onAction={() => void detail.refetch()} state="error" />
      </MobileShell>
    );

  const conversation = detail.data.conversation;
  const canSend = principal?.permissions.includes('messaging.messages.send') ?? false;
  const canRetry = principal?.permissions.includes('messaging.failures.manage') ?? false;
  return (
    <MobileShell title={conversation.contact_name}>
      {connectivity === 'offline' ? (
        <Alert
          description="Text and approved templates are queued with an idempotency key. Media and failed-send retry wait for connectivity."
          title="Offline queue active"
          tone="warning"
        />
      ) : null}
      {message ? <Alert description={message} title="Messaging" tone="info" /> : null}
      <Card>
        <View className="gap-2">
          <View className="flex-row flex-wrap items-center justify-between gap-2">
            <AppText accessibilityRole="header" variant="heading">
              {conversation.phone_e164}
            </AppText>
            <Badge label={conversation.status} tone="success" />
          </View>
          <AppText tone="muted">{conversation.vehicle_interest}</AppText>
          <AppText variant="caption">
            {conversation.free_form_allowed && conversation.free_form_window_expires_at
              ? `Free-form window ends ${new Date(conversation.free_form_window_expires_at).toLocaleString()}`
              : 'Approved template required outside the service window.'}
          </AppText>
        </View>
      </Card>
      {detail.data.messages.length === 0 ? <StatePanel state="empty" /> : null}
      {detail.data.messages.map((item) => (
        <Card key={item.id}>
          <View className="gap-2">
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <Badge
                label={item.direction === 'INTERNAL' ? 'INTERNAL NOTE' : item.direction}
                tone={item.direction === 'INBOUND' ? 'info' : 'neutral'}
              />
              <Badge label={item.status} tone={item.status === 'FAILED' ? 'danger' : 'success'} />
            </View>
            <AppText>{item.body_text ?? item.template_name ?? 'Media attachment'}</AppText>
            {item.media.map((media) => (
              <AppText key={media.id} tone="muted" variant="caption">
                {media.filename ?? media.mime_type} · {media.availability}
              </AppText>
            ))}
            <AppText tone="muted" variant="caption">
              {new Date(item.provider_occurred_at ?? item.created_at).toLocaleString()}
            </AppText>
            {item.status === 'FAILED' && canRetry ? (
              <Button
                disabled={retry.isPending || connectivity === 'offline'}
                label={retry.isPending ? 'Retrying…' : 'Retry failed send'}
                onPress={() => retry.mutate(item.id)}
                variant="secondary"
              />
            ) : null}
          </View>
        </Card>
      ))}
      {canSend ? (
        <Card>
          <View className="gap-3">
            <View className="flex-row gap-2">
              <Button
                className="flex-1"
                label="Free-form"
                onPress={() => setMode('TEXT')}
                variant={mode === 'TEXT' ? 'primary' : 'secondary'}
              />
              <Button
                className="flex-1"
                label="Template"
                onPress={() => setMode('TEMPLATE')}
                variant={mode === 'TEMPLATE' ? 'primary' : 'secondary'}
              />
            </View>
            {mode === 'TEXT' ? (
              <TextField
                description={
                  conversation.free_form_allowed
                    ? 'Customer-facing reply'
                    : 'The backend requires an approved template.'
                }
                editable={conversation.free_form_allowed && !send.isPending}
                label="Message"
                multiline
                onChangeText={setText}
                value={text}
              />
            ) : (
              <View className="gap-2">
                <AppText variant="label">Approved template</AppText>
                {templates.data?.templates.map((template) => (
                  <Button
                    key={template.id}
                    label={`${template.name} · ${template.category}`}
                    onPress={() => setTemplateId(template.id)}
                    variant={templateId === template.id ? 'primary' : 'secondary'}
                  />
                ))}
                {variableKeys.map((key) => (
                  <TextField
                    key={key}
                    label={`Variable ${key}`}
                    onChangeText={(value) => setTemplateVariable(key, value)}
                    value={templateVariables[key] ?? ''}
                  />
                ))}
              </View>
            )}
            <Button
              disabled={
                send.isPending ||
                (mode === 'TEXT' &&
                  (!conversation.free_form_allowed || text.trim().length === 0)) ||
                (mode === 'TEMPLATE' &&
                  (templateId.length === 0 ||
                    variableKeys.some((key) => (templateVariables[key] ?? '').trim().length === 0)))
              }
              label={
                send.isPending
                  ? 'Sending…'
                  : connectivity === 'offline'
                    ? 'Queue message'
                    : 'Send message'
              }
              onPress={() => send.mutate()}
            />
            <Button
              disabled={upload.isPending || connectivity === 'offline'}
              label={upload.isPending ? 'Uploading…' : 'Send media'}
              onPress={() => upload.mutate()}
              variant="secondary"
            />
            {connectivity !== 'offline' && principal ? (
              <Button
                label="Replay offline queue"
                onPress={() =>
                  void replayMessagingOutbox(
                    database,
                    request,
                    principal.clientOrganizationId,
                  ).then((result) => {
                    setMessage(
                      `Replayed ${String(result.replayed)}; ${String(result.conflicts)} conflict(s).`,
                    );
                    void cache.invalidateQueries({ queryKey: ['mobile'] });
                  })
                }
                variant="secondary"
              />
            ) : null}
          </View>
        </Card>
      ) : (
        <Alert
          description="Your role can read this conversation but cannot send customer messages."
          title="Read only"
          tone="warning"
        />
      )}
    </MobileShell>
  );
}
