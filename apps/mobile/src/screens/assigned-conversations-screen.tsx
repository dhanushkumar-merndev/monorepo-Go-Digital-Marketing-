import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { useAuth } from '../auth/auth-provider';
import { Alert, AppText, Badge, Button, Card, StatePanel } from '../components/ui';
import { MobileShell } from '../components/mobile-shell';
import { useAppStore } from '../store/app-store';
import { useAuthStore } from '../store/auth-store';
import { parseJson } from './assigned-leads-screen';

interface ConversationSummary {
  channel: string;
  contact_name: string;
  id: string;
  last_message_at: string | null;
  phone_e164: string;
  status: string;
  unread_count: number;
}

export function AssignedConversationsScreen() {
  const { request } = useAuth();
  const router = useRouter();
  const connectivity = useAppStore((state) => state.connectivity);
  const principal = useAuthStore((state) => state.principal);
  const permitted = principal?.permissions.includes('messaging.conversations.read') ?? false;
  const query = useQuery({
    queryKey: ['mobile', 'assigned-conversations'],
    queryFn: async () =>
      parseJson<{ conversations: ConversationSummary[] }>(
        await request('/messaging/conversations?assigned_to_me=true&limit=100'),
      ),
    enabled: permitted,
  });
  return (
    <MobileShell title="Assigned conversations">
      {!permitted ? (
        <Alert
          description="Your active role does not include assigned-conversation access."
          title="Inbox unavailable"
          tone="warning"
        />
      ) : null}
      {connectivity === 'offline' ? (
        <Alert
          description="Already-open text and approved-template messages can be queued safely. Media waits for connectivity."
          title="Offline"
          tone="warning"
        />
      ) : null}
      {permitted && query.isPending ? <StatePanel state="loading" /> : null}
      {permitted && query.isError ? (
        <StatePanel actionLabel="Retry" onAction={() => void query.refetch()} state="error" />
      ) : null}
      {permitted && query.data?.conversations.length === 0 ? <StatePanel state="empty" /> : null}
      {query.data?.conversations.map((conversation) => (
        <Card key={conversation.id}>
          <View className="gap-2">
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <AppText accessibilityRole="header" variant="heading">
                {conversation.contact_name}
              </AppText>
              <Badge
                label={
                  conversation.unread_count > 0
                    ? `${String(conversation.unread_count)} new`
                    : conversation.status
                }
                tone={conversation.unread_count > 0 ? 'info' : 'neutral'}
              />
            </View>
            <AppText tone="muted">
              {conversation.phone_e164} · {conversation.channel}
            </AppText>
            <AppText variant="caption">
              {conversation.last_message_at
                ? new Date(conversation.last_message_at).toLocaleString()
                : 'Awaiting first message'}
            </AppText>
            <Button
              label="Open conversation"
              onPress={() =>
                router.push({
                  pathname: '/(app)/inbox/[conversationId]',
                  params: { conversationId: conversation.id },
                })
              }
            />
          </View>
        </Card>
      ))}
    </MobileShell>
  );
}
