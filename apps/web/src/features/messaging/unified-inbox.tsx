'use client';

import { Alert, AlertDescription, AlertTitle } from '@gdm/ui/components/alert';
import { Badge } from '@gdm/ui/components/badge';
import { Button } from '@gdm/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@gdm/ui/components/card';
import { EmptyState } from '@gdm/ui/components/empty-state';
import { Input } from '@gdm/ui/components/input';
import { Label } from '@gdm/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@gdm/ui/components/select';
import { Skeleton } from '@gdm/ui/components/skeleton';
import { StatusBadge } from '@gdm/ui/components/status-badge';
import { Textarea } from '@gdm/ui/components/textarea';
import { messageTemplateVariableKeys } from '@gdm/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  AlertTriangle,
  FileUp,
  Inbox,
  MessageSquareText,
  RefreshCw,
  Send,
  StickyNote,
  UserRoundCheck,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { PageHeader } from '@/components/page-header';
import {
  readPageParameters,
  ServerPagination,
  type PageMetadata,
} from '@/components/server-pagination';
import { useAuth } from '@/features/auth/auth-provider';
import { PermissionGate } from '@/features/auth/permission-gate';
import { useDebouncedValue } from '@/features/analytics/use-debounced-value';
import { useInboxUiStore } from './inbox-ui.store';

interface ConversationSummary {
  channel: 'WHATSAPP' | 'EMAIL' | 'SMS';
  contact_id: string;
  contact_name: string;
  conversation_owner_id: string | null;
  id: string;
  last_message_at: string | null;
  lead_id: string;
  phone_e164: string;
  status: 'OPEN' | 'PENDING' | 'CLOSED';
  team_id: string | null;
  unread_count: number;
  version: number;
}

interface MessageSummary {
  body_text: string | null;
  content_type: 'TEXT' | 'TEMPLATE' | 'MEDIA' | 'NOTE';
  created_at: string;
  direction: 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
  id: string;
  media: {
    availability: string;
    filename: string | null;
    id: string;
    mime_type: string;
    size_bytes: number | null;
  }[];
  provider_occurred_at: string | null;
  status: string;
  template_name: string | null;
}

interface ConversationDetail {
  conversation: ConversationSummary & {
    branch_id: string;
    free_form_allowed: boolean;
    free_form_window_expires_at: string | null;
    vehicle_interest: string;
  };
  messages: MessageSummary[];
  message_page: { has_more: boolean; next_cursor: string | null };
}

interface MessagePage {
  messages: MessageSummary[];
  page: { has_more: boolean; next_cursor: string | null };
}

interface MessageTemplate {
  body_text: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  id: string;
  language: string;
  name: string;
  status: string;
}

interface ConnectionSummary {
  display_name: string;
  id: string;
  last_health_status: string | null;
  provider: string;
  status: string;
  template_sync_status: string;
  token_configured: boolean;
  webhook_callback_path: string;
  webhook_state: string;
}

interface FailureSummary {
  attempts: number;
  conversation_id: string;
  error_code: string | null;
  error_message: string | null;
  message_id: string;
  status: string;
}

export function UnifiedInbox() {
  const { api, session } = useAuth();
  const cache = useQueryClient();
  const router = useRouter();
  const searchParameters = useSearchParams();
  const selectedId = searchParameters.get('conversation');
  const search = searchParameters.get('search') ?? '';
  const { page, pageSize } = readPageParameters(searchParameters);
  const assignedOnly = searchParameters.get('assigned') === 'true';
  const [searchDraft, setSearchDraft] = useState(search);
  const debouncedSearch = useDebouncedValue(searchDraft);
  const [notice, setNotice] = useState<string | null>(null);
  const readRequests = useRef(new Set<string>());
  const customerPanelOpen = useInboxUiStore((state) => state.customerPanelOpen);
  const setCustomerPanelOpen = useInboxUiStore((state) => state.setCustomerPanelOpen);
  const conversations = useQuery({
    queryKey: ['messaging', 'conversations', search, assignedOnly, page, pageSize],
    queryFn: () =>
      api.request<{ conversations: ConversationSummary[]; pagination: PageMetadata }>(
        `/messaging/conversations?assigned_to_me=${String(assignedOnly)}&search=${encodeURIComponent(search)}&limit=${String(pageSize)}&page=${String(page)}`,
      ),
  });
  const activeSelectedId = selectedId ?? conversations.data?.conversations[0]?.id ?? null;
  const detail = useQuery({
    queryKey: ['messaging', 'conversation', activeSelectedId],
    queryFn: () => api.request<ConversationDetail>(`/messaging/conversations/${activeSelectedId}`),
    enabled: activeSelectedId !== null,
  });

  useEffect(() => {
    const conversation = detail.data?.conversation;
    if (
      !conversation ||
      conversation.unread_count === 0 ||
      readRequests.current.has(conversation.id)
    )
      return;
    readRequests.current.add(conversation.id);
    void api
      .request(`/messaging/conversations/${conversation.id}/read`, { method: 'POST' })
      .then(() => {
        cache.setQueryData<ConversationDetail>(
          ['messaging', 'conversation', conversation.id],
          (current) =>
            current
              ? { ...current, conversation: { ...current.conversation, unread_count: 0 } }
              : current,
        );
        void cache.invalidateQueries({ queryKey: ['messaging', 'conversations'] });
      })
      .catch(() => undefined)
      .finally(() => readRequests.current.delete(conversation.id));
  }, [api, cache, detail.data?.conversation]);
  useEffect(() => {
    if (debouncedSearch !== search)
      updateInboxUrl({ conversation: null, page: '1', search: debouncedSearch });
    // updateInboxUrl is stable for the active URL snapshot and intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, search]);
  const templates = useQuery({
    queryKey: ['messaging', 'templates'],
    queryFn: () => api.request<{ templates: MessageTemplate[] }>('/messaging/templates'),
  });
  const canManageConnections =
    session?.permissions.includes('messaging.connections.manage') ?? false;
  const canManageFailures = session?.permissions.includes('messaging.failures.manage') ?? false;
  const connections = useQuery({
    queryKey: ['messaging', 'connections'],
    queryFn: () => api.request<{ connections: ConnectionSummary[] }>('/messaging/connections'),
    enabled: canManageConnections,
  });
  const failures = useQuery({
    queryKey: ['messaging', 'failures'],
    queryFn: () => api.request<{ failures: FailureSummary[] }>('/messaging/failures'),
    enabled: canManageFailures,
  });

  function refreshConversation() {
    void cache.invalidateQueries({ queryKey: ['messaging'] });
  }

  function updateInboxUrl(
    changes: Record<string, string | null>,
    navigation: 'push' | 'replace' = 'replace',
  ) {
    const next = new URLSearchParams(searchParameters.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value.length === 0) next.delete(key);
      else next.set(key, value);
    }
    const target = next.size > 0 ? `/inbox?${next.toString()}` : '/inbox';
    router[navigation](target, { scroll: false });
  }

  return (
    <PermissionGate permission="messaging.conversations.read">
      <div className="space-y-6">
        <PageHeader
          description="One tenant-scoped customer timeline for official messages, internal collaboration, delivery status, and queue ownership."
          eyebrow="Phase 5"
          title="Unified inbox"
        />
        <div className="flex justify-end">
          <Button
            aria-pressed={customerPanelOpen}
            onClick={() => setCustomerPanelOpen(!customerPanelOpen)}
            size="sm"
            variant="outline"
          >
            {customerPanelOpen ? 'Hide customer panel' : 'Show customer panel'}
          </Button>
        </div>
        {notice ? (
          <Alert>
            <MessageSquareText className="size-4" />
            <AlertTitle>Messaging update</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid min-h-[42rem] gap-4 xl:grid-cols-[20rem_minmax(0,1fr)_19rem]">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Conversations</CardTitle>
              <CardDescription>Filtered by tenant, branch, team, and owner scope.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label htmlFor="conversation-search">Search customers</Label>
              <Input
                id="conversation-search"
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Name or phone"
                value={searchDraft}
              />
              <Button
                aria-pressed={assignedOnly}
                className="w-full"
                onClick={() =>
                  updateInboxUrl({
                    assigned: assignedOnly ? null : 'true',
                    conversation: null,
                    page: '1',
                  })
                }
                variant={assignedOnly ? 'default' : 'outline'}
              >
                <UserRoundCheck data-icon="inline-start" /> Assigned to me
              </Button>
              {conversations.isPending ? <ConversationSkeleton /> : null}
              {conversations.isError ? (
                <Retry onRetry={() => void conversations.refetch()} text="Inbox unavailable" />
              ) : null}
              {conversations.data?.conversations.length === 0 ? (
                <EmptyState
                  description="Inbound official messages and started conversations will appear here."
                  icon={<Inbox className="size-5" />}
                  title="No conversations"
                />
              ) : null}
              <div className="space-y-2">
                {conversations.data?.conversations.map((conversation) => (
                  <button
                    className="hover:bg-muted focus-visible:ring-ring w-full rounded-md border p-3 text-left focus-visible:ring-2 focus-visible:outline-none"
                    data-active={activeSelectedId === conversation.id || undefined}
                    key={conversation.id}
                    onClick={() => updateInboxUrl({ conversation: conversation.id }, 'push')}
                    type="button"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span>
                        <span className="block text-sm font-medium">
                          {conversation.contact_name}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {conversation.phone_e164}
                        </span>
                      </span>
                      {conversation.unread_count > 0 ? (
                        <Badge>{conversation.unread_count}</Badge>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground mt-2 block text-xs">
                      {conversation.last_message_at
                        ? new Date(conversation.last_message_at).toLocaleString()
                        : 'Awaiting first message'}
                    </span>
                  </button>
                ))}
              </div>
              {conversations.data ? (
                <ServerPagination
                  metadata={conversations.data.pagination}
                  onPage={(value) => updateInboxUrl({ conversation: null, page: String(value) })}
                  onPageSize={(value) =>
                    updateInboxUrl({ conversation: null, page: '1', page_size: String(value) })
                  }
                />
              ) : null}
            </CardContent>
          </Card>

          <ConversationWorkspace
            detail={detail}
            onRefresh={refreshConversation}
            onStatus={setNotice}
            templates={templates.data?.templates ?? []}
          />

          <aside className="space-y-4">
            {customerPanelOpen ? <CustomerPanel detail={detail.data ?? null} /> : null}
            {canManageConnections ? <IntegrationPanel connections={connections} /> : null}
            <TemplateCatalogue templates={templates.data?.templates ?? []} />
            {canManageFailures ? (
              <FailurePanel
                failures={failures.data?.failures ?? []}
                onRefresh={refreshConversation}
                onStatus={setNotice}
              />
            ) : null}
          </aside>
        </div>
      </div>
    </PermissionGate>
  );
}

function ConversationWorkspace({
  detail,
  onRefresh,
  onStatus,
  templates,
}: {
  detail: ReturnType<typeof useQuery<ConversationDetail>>;
  onRefresh(): void;
  onStatus(message: string): void;
  templates: MessageTemplate[];
}) {
  const { api, session } = useAuth();
  const mode = useInboxUiStore((state) => state.composerMode);
  const draftText = useInboxUiStore((state) => state.draftText);
  const selectedTemplateId = useInboxUiStore((state) => state.selectedTemplateId);
  const templateVariables = useInboxUiStore((state) => state.templateVariables);
  const prepareComposer = useInboxUiStore((state) => state.prepareComposer);
  const resetComposer = useInboxUiStore((state) => state.resetComposer);
  const setDraftText = useInboxUiStore((state) => state.setDraftText);
  const setMode = useInboxUiStore((state) => state.setComposerMode);
  const setSelectedTemplateId = useInboxUiStore((state) => state.setSelectedTemplateId);
  const setTemplateVariable = useInboxUiStore((state) => state.setTemplateVariable);
  const [olderMessages, setOlderMessages] = useState<MessageSummary[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const messageViewport = useRef<HTMLDivElement>(null);
  const renderedMessages = [...olderMessages, ...(detail.data?.messages ?? [])];
  // TanStack Virtual returns imperative measurement functions by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const messageVirtualizer = useVirtualizer({
    count: renderedMessages.length,
    estimateSize: () => 112,
    getScrollElement: () => messageViewport.current,
    overscan: 6,
  });
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const variableKeys = selectedTemplate
    ? messageTemplateVariableKeys(selectedTemplate.body_text)
    : [];
  useEffect(() => {
    if (detail.data?.conversation.id) prepareComposer(detail.data.conversation.id);
  }, [detail.data?.conversation.id, prepareComposer]);
  useEffect(() => {
    setOlderMessages([]);
    setOlderCursor(detail.data?.message_page.next_cursor ?? null);
  }, [detail.data?.conversation.id, detail.data?.message_page.next_cursor]);
  const loadOlder = useMutation({
    mutationFn: async () => {
      if (!detail.data || !olderCursor) throw new Error('No older message page is available.');
      return api.request<MessagePage>(
        `/messaging/conversations/${detail.data.conversation.id}/messages?before=${encodeURIComponent(olderCursor)}&limit=50`,
      );
    },
    onSuccess: (page) => {
      setOlderMessages((current) => [...page.messages, ...current]);
      setOlderCursor(page.page.next_cursor);
    },
  });
  const send = useMutation({
    mutationFn: async () => {
      if (!detail.data) throw new Error('Select a conversation first.');
      const body =
        mode === 'TEXT'
          ? { content_type: 'TEXT', text: draftText }
          : {
              content_type: 'TEMPLATE',
              template_id: selectedTemplateId,
              variables: templateVariables,
            };
      return api.request(`/messaging/conversations/${detail.data.conversation.id}/messages`, {
        body: JSON.stringify(body),
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        method: 'POST',
      });
    },
    onSuccess: () => {
      onStatus('Message accepted. Delivery status is shown in the conversation timeline.');
      resetComposer();
      onRefresh();
    },
    onError: (error) =>
      onStatus(error instanceof Error ? error.message : 'Message could not be sent.'),
  });
  const note = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      if (!detail.data) throw new Error('Select a conversation first.');
      const values = new FormData(form);
      return api.request(`/messaging/conversations/${detail.data.conversation.id}/notes`, {
        body: JSON.stringify({ note: String(values.get('note')) }),
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        method: 'POST',
      });
    },
    onSuccess: () => {
      onStatus('Internal note added. It was not sent to the customer.');
      onRefresh();
    },
    onError: (error) => onStatus(error instanceof Error ? error.message : 'Note failed.'),
  });

  if (detail.isPending)
    return (
      <Card>
        <CardContent className="space-y-4 p-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-96 w-full" />
        </CardContent>
      </Card>
    );
  if (detail.isError)
    return (
      <Card>
        <CardContent className="p-6">
          <Retry onRetry={() => void detail.refetch()} text="Conversation unavailable" />
        </CardContent>
      </Card>
    );
  if (!detail.data)
    return (
      <Card>
        <CardContent className="p-6">
          <EmptyState
            description="Choose an inbox item to read the customer timeline and reply."
            icon={<MessageSquareText className="size-5" />}
            title="Select a conversation"
          />
        </CardContent>
      </Card>
    );
  const conversation = detail.data.conversation;
  const canSend = session?.permissions.includes('messaging.messages.send') ?? false;
  const canNote = session?.permissions.includes('messaging.notes.create') ?? false;
  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{conversation.contact_name}</CardTitle>
            <CardDescription>
              {conversation.vehicle_interest} · {conversation.channel}
            </CardDescription>
          </div>
          <StatusBadge tone={conversation.status === 'OPEN' ? 'success' : 'neutral'}>
            {conversation.status}
          </StatusBadge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 p-4">
        <div aria-live="polite" className="flex flex-1 flex-col gap-2">
          {olderCursor ? (
            <Button
              className="w-full"
              disabled={loadOlder.isPending}
              onClick={() => loadOlder.mutate()}
              size="sm"
              variant="ghost"
            >
              {loadOlder.isPending ? 'Loading older messages…' : 'Load older messages'}
            </Button>
          ) : null}
          {renderedMessages.length === 0 ? (
            <EmptyState
              description="No message or internal-note evidence has been recorded."
              icon={<MessageSquareText className="size-5" />}
              title="Empty timeline"
            />
          ) : (
            <div className="h-[28rem] overflow-y-auto pr-1" ref={messageViewport}>
              <div
                className="relative w-full"
                style={{ height: messageVirtualizer.getTotalSize() }}
              >
                {messageVirtualizer.getVirtualItems().map((row) => {
                  const message = renderedMessages[row.index];
                  return message ? (
                    <div
                      className="absolute top-0 left-0 w-full pb-3"
                      data-index={row.index}
                      key={message.id}
                      ref={messageVirtualizer.measureElement}
                      style={{ transform: `translateY(${String(row.start)}px)` }}
                    >
                      <MessageBubble message={message} />
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          )}
        </div>
        {!conversation.free_form_allowed ? (
          <Alert>
            <AlertTriangle className="size-4" />
            <AlertTitle>Approved template required</AlertTitle>
            <AlertDescription>
              The customer service window is closed. The backend will reject free-form or
              unapproved-template sends.
            </AlertDescription>
          </Alert>
        ) : null}
        {canSend ? (
          <form
            className="space-y-3 border-t pt-4"
            onSubmit={(event) => {
              event.preventDefault();
              send.mutate();
            }}
          >
            <div className="flex gap-2">
              <Button
                aria-pressed={mode === 'TEXT'}
                onClick={() => setMode('TEXT')}
                size="sm"
                type="button"
                variant={mode === 'TEXT' ? 'default' : 'outline'}
              >
                Free-form
              </Button>
              <Button
                aria-pressed={mode === 'TEMPLATE'}
                onClick={() => setMode('TEMPLATE')}
                size="sm"
                type="button"
                variant={mode === 'TEMPLATE' ? 'default' : 'outline'}
              >
                Template
              </Button>
            </div>
            {mode === 'TEXT' ? (
              <div className="space-y-2">
                <Label htmlFor="message-text">Customer message</Label>
                <Textarea
                  disabled={!conversation.free_form_allowed || send.isPending}
                  id="message-text"
                  onChange={(event) => setDraftText(event.target.value)}
                  placeholder="Write a reply"
                  required
                  value={draftText}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="message-template">Approved template</Label>
                <Select
                  onValueChange={(value) => setSelectedTemplateId(value ?? '')}
                  value={selectedTemplateId}
                >
                  <SelectTrigger id="message-template">
                    <SelectValue placeholder="Select a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates
                      .filter((template) => template.status === 'APPROVED')
                      .map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name} · {template.category}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {variableKeys.map((key) => (
                  <div className="space-y-1" key={key}>
                    <Label htmlFor={`message-template-variable-${key}`}>Variable {key}</Label>
                    <Input
                      id={`message-template-variable-${key}`}
                      maxLength={1024}
                      onChange={(event) => setTemplateVariable(key, event.target.value)}
                      required
                      value={templateVariables[key] ?? ''}
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={
                  send.isPending ||
                  (mode === 'TEXT' &&
                    (!conversation.free_form_allowed || draftText.trim().length === 0)) ||
                  (mode === 'TEMPLATE' &&
                    (selectedTemplateId.length === 0 ||
                      variableKeys.some(
                        (key) => (templateVariables[key] ?? '').trim().length === 0,
                      )))
                }
                type="submit"
              >
                <Send data-icon="inline-start" /> {send.isPending ? 'Sending…' : 'Send'}
              </Button>
              <PermissionGate permission="messaging.media.upload">
                <MediaUpload
                  conversationId={conversation.id}
                  onRefresh={onRefresh}
                  onStatus={onStatus}
                />
              </PermissionGate>
            </div>
          </form>
        ) : (
          <Alert>
            <AlertTitle>Read-only conversation</AlertTitle>
            <AlertDescription>Your role cannot send customer messages.</AlertDescription>
          </Alert>
        )}
        {canNote ? (
          <form
            className="space-y-2 rounded-md border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              note.mutate(event.currentTarget);
            }}
          >
            <Label htmlFor="internal-note">Internal note</Label>
            <Textarea id="internal-note" name="note" required />
            <Button disabled={note.isPending} size="sm" type="submit" variant="outline">
              <StickyNote data-icon="inline-start" />
              {note.isPending ? 'Adding…' : 'Add internal note'}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MediaUpload({
  conversationId,
  onRefresh,
  onStatus,
}: {
  conversationId: string;
  onRefresh(): void;
  onStatus(message: string): void;
}) {
  const { api } = useAuth();
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const begin = await api.request<{
        media_id: string;
        upload: { method: 'PUT'; url: string };
      }>('/messaging/media/uploads', {
        body: JSON.stringify({
          caption: null,
          conversation_id: conversationId,
          filename: file.name,
          mime_type: file.type,
          size_bytes: file.size,
        }),
        headers: { 'Idempotency-Key': crypto.randomUUID() },
        method: 'POST',
      });
      const stored = await fetch(begin.upload.url, {
        body: file,
        headers: { 'Content-Type': file.type },
        method: begin.upload.method,
      });
      if (!stored.ok) throw new Error('Private object storage rejected the media upload.');
      await api.request(`/messaging/media/${begin.media_id}/complete`, {
        body: JSON.stringify({ checksum_sha256: null }),
        method: 'POST',
      });
    },
    onSuccess: () => {
      onStatus('Media verified and queued for delivery.');
      onRefresh();
    },
    onError: (error) => onStatus(error instanceof Error ? error.message : 'Media upload failed.'),
  });
  return (
    <label className="inline-flex">
      <Input
        accept="image/jpeg,image/png,application/pdf,audio/mpeg,audio/mp4,video/mp4"
        className="sr-only"
        disabled={upload.isPending}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload.mutate(file);
        }}
        type="file"
      />
      <span className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium">
        <FileUp className="size-4" /> {upload.isPending ? 'Uploading…' : 'Attach media'}
      </span>
    </label>
  );
}

function CustomerPanel({ detail }: { detail: ConversationDetail | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer</CardTitle>
        <CardDescription>Canonical Phase 3 Contact and Lead links.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {detail ? (
          <>
            <p className="font-medium">{detail.conversation.contact_name}</p>
            <p>{detail.conversation.phone_e164}</p>
            <p className="text-muted-foreground">Lead {detail.conversation.lead_id}</p>
            <p className="text-muted-foreground">
              Conversation owner: {detail.conversation.conversation_owner_id ?? 'Queue unassigned'}
            </p>
            <AssignmentForm conversation={detail.conversation} />
          </>
        ) : (
          <p className="text-muted-foreground">Select a conversation.</p>
        )}
      </CardContent>
    </Card>
  );
}

function AssignmentForm({ conversation }: { conversation: ConversationDetail['conversation'] }) {
  const { api, session } = useAuth();
  const cache = useQueryClient();
  const [status, setStatus] = useState<string | null>(null);
  const canAssign = session?.permissions.includes('messaging.assignments.manage') ?? false;
  const mutation = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const values = new FormData(form);
      const owner = String(values.get('owner_membership_id')).trim();
      const team = String(values.get('team_id')).trim();
      return api.request(`/messaging/conversations/${conversation.id}/assignment`, {
        body: JSON.stringify({
          expected_version: conversation.version,
          owner_membership_id: owner || null,
          reason: String(values.get('reason')),
          team_id: team || null,
        }),
        method: 'POST',
      });
    },
    onSuccess: () => {
      setStatus('Assignment updated.');
      void cache.invalidateQueries({ queryKey: ['messaging'] });
    },
    onError: (error) => setStatus(error instanceof Error ? error.message : 'Assignment failed.'),
  });
  if (!canAssign) return null;
  return (
    <form
      className="mt-4 space-y-2 border-t pt-4"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        mutation.mutate(event.currentTarget);
      }}
    >
      <p className="text-xs font-medium">Queue assignment</p>
      <Input name="owner_membership_id" placeholder="Owner membership UUID" />
      <Input name="team_id" placeholder="Queue team UUID" />
      <Input name="reason" placeholder="Required reason" required />
      <Button disabled={mutation.isPending} size="sm" type="submit" variant="outline">
        Assign
      </Button>
      {status ? (
        <p className="text-muted-foreground text-xs" role="status">
          {status}
        </p>
      ) : null}
    </form>
  );
}

function IntegrationPanel({
  connections,
}: {
  connections: ReturnType<typeof useQuery<{ connections: ConnectionSummary[] }>>;
}) {
  const { api } = useAuth();
  const cache = useQueryClient();
  const action = useMutation({
    mutationFn: ({
      connectionId,
      operation,
    }: {
      connectionId: string;
      operation: 'activate' | 'sync';
    }) =>
      api.request(
        operation === 'activate'
          ? `/messaging/connections/${connectionId}/activate`
          : `/messaging/connections/${connectionId}/templates/sync`,
        { method: 'POST' },
      ),
    onSuccess: () => void cache.invalidateQueries({ queryKey: ['messaging'] }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Integration status</CardTitle>
        <CardDescription>Credentials are backend-only and never rendered here.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {connections.isPending ? <Skeleton className="h-20 w-full" /> : null}
        {connections.isError ? (
          <Retry onRetry={() => void connections.refetch()} text="Status unavailable" />
        ) : null}
        {connections.data?.connections.map((connection) => (
          <div className="rounded-md border p-3" key={connection.id}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{connection.display_name}</p>
              <StatusBadge tone={connection.status === 'ACTIVE' ? 'success' : 'warning'}>
                {connection.status}
              </StatusBadge>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {connection.provider} · Webhook {connection.webhook_state} · Templates{' '}
              {connection.template_sync_status}
            </p>
            <p className="text-muted-foreground mt-2 font-mono text-[0.7rem] break-all">
              Callback: {connection.webhook_callback_path}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                disabled={action.isPending || connection.status === 'ACTIVE'}
                onClick={() =>
                  action.mutate({ connectionId: connection.id, operation: 'activate' })
                }
                size="sm"
                variant="outline"
              >
                Activate
              </Button>
              <Button
                disabled={action.isPending}
                onClick={() => action.mutate({ connectionId: connection.id, operation: 'sync' })}
                size="sm"
                variant="outline"
              >
                Sync templates
              </Button>
            </div>
          </div>
        ))}
        {action.isError ? (
          <p className="text-destructive text-xs">
            {action.error instanceof Error ? action.error.message : 'Integration action failed.'}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function TemplateCatalogue({ templates }: { templates: MessageTemplate[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Template catalogue</CardTitle>
        <CardDescription>Provider approval remains authoritative.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {templates.length === 0 ? (
          <p className="text-muted-foreground text-sm">No synchronized templates.</p>
        ) : (
          templates.map((template) => (
            <div className="rounded-md border p-2" key={template.id}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs font-medium">{template.name}</p>
                <Badge variant="outline">{template.status}</Badge>
              </div>
              <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                {template.category} · {template.language} · {template.body_text}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function FailurePanel({
  failures,
  onRefresh,
  onStatus,
}: {
  failures: FailureSummary[];
  onRefresh(): void;
  onStatus(message: string): void;
}) {
  const { api } = useAuth();
  const retry = useMutation({
    mutationFn: (messageId: string) =>
      api.request(`/messaging/messages/${messageId}/retry`, { method: 'POST' }),
    onSuccess: () => {
      onStatus('Failed message retry accepted.');
      onRefresh();
    },
    onError: (error) => onStatus(error instanceof Error ? error.message : 'Retry failed.'),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Delivery failures</CardTitle>
        <CardDescription>
          Failed and dead-letter sends remain visible and retryable.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {failures.length === 0 ? (
          <p className="text-muted-foreground text-sm">No outbound failures.</p>
        ) : (
          failures.map((failure) => (
            <div className="rounded-md border p-2" key={failure.message_id}>
              <p className="text-xs font-medium">
                {failure.status} · {failure.attempts} attempts
              </p>
              <p className="text-muted-foreground my-1 text-xs">
                {failure.error_message ?? failure.error_code ?? 'Provider failure'}
              </p>
              <Button
                disabled={retry.isPending}
                onClick={() => retry.mutate(failure.message_id)}
                size="sm"
                variant="outline"
              >
                <RefreshCw data-icon="inline-start" /> Retry
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function MessageBubble({ message }: { message: MessageSummary }) {
  const internal = message.direction === 'INTERNAL';
  const inbound = message.direction === 'INBOUND';
  return (
    <div className={`flex ${inbound || internal ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[85%] rounded-lg border p-3 ${
          internal ? 'bg-muted border-dashed' : inbound ? 'bg-background' : 'bg-primary/5'
        }`}
      >
        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline">{internal ? 'Internal note' : message.direction}</Badge>
          <span className="text-muted-foreground">{message.status}</span>
        </div>
        <p className="text-sm whitespace-pre-wrap">
          {message.body_text ?? message.template_name ?? 'Media attachment'}
        </p>
        {message.media.map((media) => (
          <p className="text-muted-foreground mt-2 text-xs" key={media.id}>
            {media.filename ?? media.mime_type} · {media.availability}
          </p>
        ))}
        <p className="text-muted-foreground mt-1 text-xs">
          {new Date(message.provider_occurred_at ?? message.created_at).toLocaleString()}
        </p>
      </div>
    </div>
  );
}

function ConversationSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  );
}

function Retry({ onRetry, text }: { onRetry(): void; text: string }) {
  return (
    <div className="rounded-md border p-3 text-sm" role="alert">
      <p>{text}</p>
      <Button className="mt-2" onClick={onRetry} size="sm" variant="outline">
        Retry
      </Button>
    </div>
  );
}
