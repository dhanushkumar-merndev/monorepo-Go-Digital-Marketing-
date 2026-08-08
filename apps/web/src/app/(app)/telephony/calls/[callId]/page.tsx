import { CallDetail } from '@/features/telephony/call-detail';

export default async function CallDetailPage({ params }: { params: Promise<{ callId: string }> }) {
  const { callId } = await params;
  return <CallDetail callId={callId} />;
}
