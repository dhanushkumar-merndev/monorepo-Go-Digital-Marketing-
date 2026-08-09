import { DeliveryDetailView } from '@/features/delivery/delivery-detail';

export default async function DeliveryDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  return <DeliveryDetailView jobId={jobId} />;
}
